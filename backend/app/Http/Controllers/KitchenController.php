<?php

namespace App\Http\Controllers;

use App\Models\OrderItem;
use App\Models\OrderRound;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * The station display boards — the kitchen's and the bar's. Both work in
 * rounds, not bills: a table that orders again gets a second ticket under the
 * same table number instead of extra lines quietly appearing on a card someone
 * has already started. Read-only apart from the two taps that move a ticket
 * along — Start (someone takes it) and Ready.
 *
 * Which board a request is for comes from the route (`/kitchen/tickets` vs
 * `/bar/tickets`), and a round is only ever on one of them: the food half of a
 * send goes to the kitchen, the drinks half to the bar.
 */
class KitchenController extends Controller
{
    /** Everything a ticket card needs, and nothing about money. */
    private const WITH = [
        'items',
        'items.chef:id,name',
        'items.chefs:id,name',
        'chef:id,name',
        'chefs:id,name',
        'order:id,order_number,order_type,table_id,transferred_from_table_id,user_id,guest_count,status',
        'order.table:id,name',
        'order.transferredFrom:id,name',
        'order.user:id,name,username',
    ];

    /** Bills that have left the floor — their rounds are no longer made. */
    private const DEAD_ORDER_STATUSES = ['completed', 'cancelled', 'refunded'];

    /** How many plated tickets the history panel looks back over. */
    private const HISTORY_LIMIT = 100;

    /**
     * The live queue for one station: every round it still has to make, oldest
     * first, so the board reads as a first-in-first-out ticket rail.
     */
    public function tickets(Request $request): JsonResponse
    {
        $rounds = OrderRound::query()
            ->where('station', $this->station($request))
            ->whereIn('status', OrderRound::OPEN_STATUSES)
            ->whereHas('order', fn ($q) => $q->whereNotIn('status', self::DEAD_ORDER_STATUSES))
            ->with(self::WITH)
            ->orderBy('created_at')
            ->orderBy('id')
            ->get();

        return response()->json($rounds);
    }

    /**
     * What this station has already made today — the tickets it bumped off the
     * board, newest first. The board itself only ever shows outstanding work, so
     * once a card is plated it is gone; this is where someone looks when a
     * waiter asks "did that go out, and when?".
     *
     * Scoped to the current service day (the same start-of-day the reports use)
     * and capped, because a board is glanced at, not paged through.
     */
    public function history(Request $request): JsonResponse
    {
        $rounds = OrderRound::query()
            ->where('station', $this->station($request))
            ->where('status', 'ready')
            ->where('ready_at', '>=', now()->startOfDay())
            ->with(self::WITH)
            ->orderByDesc('ready_at')
            ->orderByDesc('id')
            ->limit(self::HISTORY_LIMIT)
            ->get();

        return response()->json($rounds);
    }

    /**
     * Move one ticket along. `preparing` names the cooks who picked it up (the
     * kitchen only — the bar has no roster) and starts their clock; `ready`
     * stops it and bumps the card off the board.
     *
     * A card is often split between two cooks, so the crew arrives as
     * `chef_ids` and every one of them is credited with the ticket. The older
     * single `chef_id` still works and simply names a crew of one; either way
     * the first cook given leads, and that is what the bill rolls up to.
     */
    public function update(Request $request, OrderRound $round): JsonResponse
    {
        $data = $request->validate([
            'status' => ['required', 'in:new,preparing,ready'],
            'chef_id' => ['nullable', 'exists:chefs,id'],
            'chef_ids' => ['nullable', 'array'],
            'chef_ids.*' => ['integer', 'exists:chefs,id'],
        ]);

        // Each board only bumps its own tickets, so a stale screen can never
        // plate the other station's half of the same send.
        if ($round->station !== $this->station($request)) {
            return response()->json([
                'message' => 'That ticket belongs to another station.',
            ], 404);
        }

        if (in_array($round->order?->status, self::DEAD_ORDER_STATUSES, true)) {
            return response()->json([
                'message' => 'That bill has been closed — its tickets are no longer on the board.',
            ], 422);
        }

        // Both spellings fold into one crew, first-picked first — an empty list
        // leaves whoever is already on the ticket alone, so the "Ready" tap
        // (which names nobody) can never wipe the attribution.
        $crew = array_merge(
            $data['chef_ids'] ?? [],
            isset($data['chef_id']) && $data['chef_id'] !== null ? [$data['chef_id']] : [],
        );

        DB::transaction(function () use ($crew, $data, $round) {
            $round->status = $data['status'];
            $round->assignChefs($crew);

            // Stamped once: a re-tap never rewrites when the ticket was first
            // started or plated, which is what the Chef Performance KPI measures.
            if ($data['status'] === 'preparing' && $round->started_at === null) {
                $round->started_at = now();
            }
            if ($data['status'] === 'ready' && $round->ready_at === null) {
                $round->ready_at = now();
            }
            $round->save();

            $round->order?->syncStatusFromRounds();
        });

        return response()->json($round->load(self::WITH));
    }

    /**
     * Move one *dish* along. The kitchen works a card line by line: tapping a
     * dish names its cooks and starts that dish's clock (`preparing`); tapping
     * Ready on the dish stops it. The round rolls itself up from its lines —
     * preparing once any dish is under way, ready (and off the board) once
     * every dish is plated — so the card needs no taps of its own.
     *
     * A dish can be shared — fried by one cook, finished by another — so the
     * crew arrives as `chef_ids` and every one of them is credited with the
     * dish. The older single `chef_id` still works and simply names a crew of
     * one; either way the first cook given leads.
     *
     * Returns the whole refreshed ticket: the tap changes the round's status
     * and crew too, and the board wants one truth, not a line to merge.
     */
    public function updateItem(Request $request, OrderRound $round, OrderItem $item): JsonResponse
    {
        $data = $request->validate([
            'status' => ['required', 'in:preparing,ready'],
            'chef_id' => ['nullable', 'exists:chefs,id'],
            'chef_ids' => ['nullable', 'array'],
            'chef_ids.*' => ['integer', 'exists:chefs,id'],
        ]);

        // The line must be the round's own, and the round the station's own —
        // a stale screen can never advance another board's cooking.
        if ($round->station !== $this->station($request) || $item->order_round_id !== $round->id) {
            return response()->json([
                'message' => 'That dish is not on this ticket.',
            ], 404);
        }

        if (in_array($round->order?->status, self::DEAD_ORDER_STATUSES, true)) {
            return response()->json([
                'message' => 'That bill has been closed — its tickets are no longer on the board.',
            ], 422);
        }

        // Both spellings fold into one crew, first-picked first — an empty list
        // leaves whoever is already on the dish alone, so the "Ready" tap
        // (which names nobody) can never wipe the attribution.
        $crew = array_merge(
            $data['chef_ids'] ?? [],
            isset($data['chef_id']) && $data['chef_id'] !== null ? [(int) $data['chef_id']] : [],
        );

        DB::transaction(function () use ($crew, $data, $item, $round) {
            if ($data['status'] === 'preparing') {
                $item->assignChefs($crew);
                // Stamped once — a re-tap (or a second cook taking over) never
                // restarts a dish's clock.
                if ($item->started_at === null) {
                    $item->started_at = now();
                }
            } elseif ($item->ready_at === null) {
                // A dish bumped without ever being started keeps a null
                // started_at — an untimed plate, not a zero-second one that
                // would poison the KPI's fastest-dish number.
                $item->ready_at = now();
            }
            $item->save();

            $round->syncFromItems();
        });

        return response()->json($round->load(self::WITH));
    }

    /**
     * Which board this request is for. The bar routes carry it as a route
     * default; anything else is the kitchen.
     */
    private function station(Request $request): string
    {
        $station = (string) $request->route('station');

        return in_array($station, OrderRound::STATIONS, true)
            ? $station
            : OrderRound::STATION_KITCHEN;
    }
}
