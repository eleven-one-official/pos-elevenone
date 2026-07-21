<?php

namespace App\Http\Controllers;

use App\Models\OrderRound;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * The kitchen display board. It works in rounds, not bills: a table that orders
 * again gets a second ticket under the same table number instead of extra lines
 * quietly appearing on a card the cook has already started. Read-only apart from
 * the two taps that move a ticket along — Start (a cook takes it) and Ready.
 */
class KitchenController extends Controller
{
    /** Everything a ticket card needs, and nothing about money. */
    private const WITH = [
        'items',
        'chef:id,name',
        'order:id,order_number,order_type,table_id,transferred_from_table_id,user_id,guest_count,status',
        'order.table:id,name',
        'order.transferredFrom:id,name',
        'order.user:id,name,username',
    ];

    /** Bills that have left the floor — their rounds are no longer cooked. */
    private const DEAD_ORDER_STATUSES = ['completed', 'cancelled', 'refunded'];

    /**
     * The live queue: every round still to cook, oldest first, so the board
     * reads as a first-in-first-out ticket rail.
     */
    public function tickets(): JsonResponse
    {
        $rounds = OrderRound::query()
            ->whereIn('status', OrderRound::OPEN_STATUSES)
            ->whereHas('order', fn ($q) => $q->whereNotIn('status', self::DEAD_ORDER_STATUSES))
            ->with(self::WITH)
            ->orderBy('created_at')
            ->orderBy('id')
            ->get();

        return response()->json($rounds);
    }

    /**
     * Move one ticket along. `preparing` names the cook who picked it up and
     * starts their clock; `ready` stops it and bumps the card off the board.
     */
    public function update(Request $request, OrderRound $round): JsonResponse
    {
        $data = $request->validate([
            'status' => ['required', 'in:new,preparing,ready'],
            'chef_id' => ['nullable', 'exists:chefs,id'],
        ]);

        if (in_array($round->order?->status, self::DEAD_ORDER_STATUSES, true)) {
            return response()->json([
                'message' => 'That bill has been closed — its tickets are no longer on the board.',
            ], 422);
        }

        DB::transaction(function () use ($data, $round) {
            $round->status = $data['status'];
            if (array_key_exists('chef_id', $data) && $data['chef_id'] !== null) {
                $round->chef_id = $data['chef_id'];
            }

            // Stamped once: a re-tap never rewrites when the cook first started
            // or plated, which is what the Chef Performance KPI measures.
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
}
