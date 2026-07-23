<?php

namespace App\Http\Controllers;

use App\Models\Order;
use App\Models\OrderItem;
use App\Models\OrderRound;
use App\Models\Payment;
use App\Models\Table;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ReportController extends Controller
{
    /**
     * Dashboard summary: sales, order counts, table availability, recent orders.
     */
    public function dashboard(): JsonResponse
    {
        $today = now()->startOfDay();
        $monthStart = now()->startOfMonth();

        $completed = Order::where('status', 'completed');

        // Partially refunded orders stay `completed`, so the money handed back
        // must come off the sales figures (fully refunded orders drop out via
        // their status). Attributed to the order's own day, like the order.
        $refundsSince = fn ($since) => (float) Payment::where('payments.status', 'refunded')
            ->whereHas('order', fn ($q) => $q->where('status', 'completed')->where('created_at', '>=', $since))
            ->sum('amount');

        return response()->json([
            'today_sales' => (float) (clone $completed)->where('created_at', '>=', $today)->sum('total') - $refundsSince($today),
            'monthly_sales' => (float) (clone $completed)->where('created_at', '>=', $monthStart)->sum('total') - $refundsSince($monthStart),
            'total_orders_today' => Order::where('created_at', '>=', $today)->count(),
            'pending_orders' => Order::whereIn('status', ['new', 'preparing', 'ready'])->count(),
            'tables' => [
                'total' => Table::count(),
                'occupied' => Table::where('status', 'occupied')->count(),
                'available' => Table::where('status', 'available')->count(),
                'reserved' => Table::where('status', 'reserved')->count(),
            ],
            'recent_orders' => Order::with(['table', 'user:id,name,username'])
                ->latest()->limit(10)->get(),
        ]);
    }

    /**
     * Daily sales report + payment method breakdown for a given ?date=YYYY-MM-DD (default today).
     */
    public function dailySales(Request $request): JsonResponse
    {
        $date = $request->filled('date') ? $request->date('date') : now();

        $orders = Order::where('status', 'completed')->whereDate('created_at', $date);

        $paymentSummary = Payment::where('status', 'paid')
            ->whereDate('created_at', $date)
            ->select('method', DB::raw('SUM(amount) as total'), DB::raw('COUNT(*) as count'))
            ->groupBy('method')
            ->get();

        // Money handed back on partially refunded (still `completed`) orders.
        $refunds = (float) Payment::where('payments.status', 'refunded')
            ->whereHas('order', fn ($q) => $q->where('status', 'completed')->whereDate('created_at', $date))
            ->sum('amount');

        return response()->json([
            'date' => $date->toDateString(),
            'orders_count' => (clone $orders)->count(),
            'gross_sales' => (float) (clone $orders)->sum('subtotal'),
            'discount' => (float) (clone $orders)->sum('discount'),
            'tax' => (float) (clone $orders)->sum('tax'),
            'refunds' => $refunds,
            'net_sales' => (float) (clone $orders)->sum('total') - $refunds,
            'payment_summary' => $paymentSummary,
        ]);
    }

    /**
     * Stats behind the dashboard's register cards. There is no session model;
     * the registers are the two "sides" (cashier POS vs waiter tablets), told
     * apart by the role of the user who fired the order. "Last closing" is the
     * most recent finished day with a completed order — today is still trading,
     * so it never counts as a closing; its cash balance sums that day's paid
     * cash payments (only cashiers record payments).
     */
    public function posConfigs(): JsonResponse
    {
        $waiterIds = User::whereHas('role', fn ($q) => $q->where('slug', 'waiter'))->pluck('id');

        $sideStats = function ($ordersQuery, bool $withCash) {
            $open = (clone $ordersQuery)
                ->whereIn('status', ['new', 'preparing', 'ready', 'served'])
                ->count();
            $lastCompleted = (clone $ordersQuery)
                ->where('status', 'completed')
                ->whereDate('created_at', '<', today())
                ->latest()
                ->first();

            $cash = null;
            if ($withCash && $lastCompleted) {
                $cash = (float) Payment::where('status', 'paid')
                    ->where('method', 'cash')
                    ->whereDate('created_at', $lastCompleted->created_at->toDateString())
                    ->sum('amount');
            }

            return [
                'open_orders' => $open,
                'last_closing_date' => $lastCompleted?->created_at->toDateString(),
                'last_closing_cash' => $cash,
            ];
        };

        return response()->json([
            'cashier' => $sideStats(
                Order::query()->where(function ($q) use ($waiterIds) {
                    $q->whereNotIn('user_id', $waiterIds)->orWhereNull('user_id');
                }),
                true,
            ),
            'waiter' => $sideStats(Order::query()->whereIn('user_id', $waiterIds), false),
        ]);
    }

    /**
     * Data behind the printable Sales Details report: product lines, payment
     * totals and net sales between ?start= and ?end= (datetimes). Only
     * completed orders count — the report reconciles money actually taken.
     * The order-level discount is spread over its lines like ordersAnalysis.
     */
    public function salesDetails(Request $request): JsonResponse
    {
        return response()->json($this->salesDetailsData($request));
    }

    /**
     * The Sales Details figures as a plain array, shared by the JSON endpoint
     * above and the CSV export in exportSalesDetails().
     *
     * @return array<string, mixed>
     */
    private function salesDetailsData(Request $request): array
    {
        $request->validate([
            'start' => ['required', 'date'],
            'end' => ['required', 'date', 'after_or_equal:start'],
            // CSV of registers to include: cashier,waiter (default both).
            'sides' => ['nullable', 'string'],
        ]);

        // Timestamps are stored in UTC, and query bindings render a Carbon in
        // its own timezone — so an ISO instant carrying an offset (what the
        // admin dialog sends) has to be shifted to UTC or the window slides by
        // the client's offset. A naive datetime is already read as UTC.
        $start = $request->date('start')->utc();
        $end = $request->date('end')->utc();

        // Like posConfigs, a register "side" is the role of the user who fired
        // the order. No filter when both (or none) are requested.
        $sides = array_values(array_intersect(
            array_filter(explode(',', (string) $request->string('sides'))),
            ['cashier', 'waiter'],
        ));
        $sideFilter = function ($q) use ($sides) {
            if (count($sides) !== 1) {
                return;
            }
            $waiterIds = User::whereHas('role', fn ($r) => $r->where('slug', 'waiter'))->pluck('id');
            if ($sides[0] === 'waiter') {
                $q->whereIn('user_id', $waiterIds);
            } else {
                $q->where(fn ($w) => $w->whereNotIn('user_id', $waiterIds)->orWhereNull('user_id'));
            }
        };

        $lines = OrderItem::query()
            ->with(['order:id,status,discount,subtotal,created_at', 'menuItem:id,category_id', 'menuItem.category:id,name'])
            ->whereHas('order', function ($q) use ($start, $end, $sideFilter) {
                $q->where('status', 'completed')->whereBetween('created_at', [$start, $end]);
                $sideFilter($q);
            })
            ->get();

        /** @var array<string, array<string, mixed>> $products */
        $products = [];
        $orderIds = [];
        $total = 0.0;

        foreach ($lines as $line) {
            $order = $line->order;
            $gross = (float) $line->line_total;
            $subtotal = (float) $order->subtotal;
            $discountShare = $subtotal > 0 ? (float) $order->discount * $gross / $subtotal : 0.0;
            $net = $gross - $discountShare;

            // One line per product AND unit price (Odoo-style), so a price
            // change mid-period shows as two lines instead of a blended total.
            // The zero-padded key keeps ksort ordering by name, then price.
            $key = sprintf('%s|%012.2f', $line->name, (float) $line->price);
            $row = $products[$key] ?? [
                'name' => $line->name,
                'category' => $line->menuItem?->category?->name ?? 'None',
                'price' => round((float) $line->price, 2),
                'quantity' => 0,
                'amount' => 0.0,
            ];
            $row['quantity'] += $line->quantity;
            $row['amount'] += $net;
            $products[$key] = $row;

            $orderIds[$order->id] = true;
            $total += $net;
        }

        ksort($products);

        // Grouped by journal (Cash USD, Cash KHR, ABA PAY, Grab Merchant, …),
        // not by the raw channel — so the report names exactly which tender took
        // the money instead of lumping every cash journal into one "Cash" line.
        // Older payments that carry no journal fall back to their channel code.
        // Anchored on the ORDER's window and status — not payments.created_at —
        // so this section covers exactly the orders the product lines cover and
        // the two columns reconcile to the same net total.
        $payments = Payment::where('payments.status', 'paid')
            ->whereHas('order', function ($q) use ($start, $end, $sideFilter) {
                $q->where('status', 'completed')->whereBetween('created_at', [$start, $end]);
                $sideFilter($q);
            })
            ->leftJoin('payment_methods', 'payments.payment_method_id', '=', 'payment_methods.id')
            ->select(
                'payments.payment_method_id',
                'payments.method',
                DB::raw('COALESCE(payment_methods.label, payments.method) as label'),
                DB::raw('SUM(payments.amount) as amount'),
                DB::raw('COUNT(*) as count'),
            )
            ->groupBy('payments.payment_method_id', 'payments.method', 'payment_methods.label')
            ->orderByDesc(DB::raw('SUM(payments.amount)'))
            ->get();

        // Money handed back on partially refunded orders in the range shows as
        // its own negative line so the payments column still reconciles.
        $refunds = Payment::where('payments.status', 'refunded')
            ->whereHas('order', function ($q) use ($start, $end, $sideFilter) {
                $q->where('status', 'completed')->whereBetween('created_at', [$start, $end]);
                $sideFilter($q);
            })
            ->selectRaw('COALESCE(SUM(amount), 0) as amount, COUNT(*) as count')
            ->first();

        if ((int) $refunds->count > 0) {
            $payments->push([
                'method' => 'refunds',
                'label' => 'Refunds',
                'amount' => -(float) $refunds->amount,
                'count' => (int) $refunds->count,
            ]);
            $total -= (float) $refunds->amount;
        }

        // Seated guests over the same completed orders (0 for take-away) — the
        // report's "Guests" line, summed with the same side filter.
        $guestsQuery = Order::where('status', 'completed')
            ->whereBetween('created_at', [$start, $end]);
        $sideFilter($guestsQuery);
        $guests = (int) $guestsQuery->sum('guest_count');

        return [
            'start' => $start->toDateTimeString(),
            'end' => $end->toDateTimeString(),
            'orders_count' => count($orderIds),
            'guests' => $guests,
            'total' => round($total, 2),
            'products' => array_values(array_map(fn (array $p) => [
                ...$p,
                'amount' => round($p['amount'], 2),
            ], $products)),
            'payments' => $payments,
        ];
    }

    /**
     * Aggregates for the admin's Orders Analysis screen. Groups every order
     * line (cancelled orders excluded) into ?group_by= buckets — category
     * (default), product, order_date (month), order_type or employee — and
     * limits the window with ?period= today|week|month|year (default: all).
     *
     * The order-level discount is spread over its lines by their share of the
     * subtotal, so Total Price sums to the real money taken. Margin uses the
     * product's current cost.
     */
    public function ordersAnalysis(Request $request): JsonResponse
    {
        $groupBy = $request->string('group_by')->toString() ?: 'category';

        $start = match ($request->string('period')->toString()) {
            'today' => now()->startOfDay(),
            'week' => now()->startOfWeek(),
            'month' => now()->startOfMonth(),
            'year' => now()->startOfYear(),
            default => null,
        };

        $typeLabels = ['dine_in' => 'Dine-in', 'take_away' => 'Take-away', 'delivery' => 'Delivery'];

        $lines = OrderItem::query()
            ->with(['order.user:id,name', 'menuItem:id,category_id,cost', 'menuItem.category:id,name'])
            ->whereHas('order', function ($q) use ($start) {
                $q->whereNotIn('status', ['cancelled', 'refunded']);
                if ($start) {
                    $q->where('created_at', '>=', $start);
                }
            })
            ->get();

        /** @var array<string, array<string, mixed>> $buckets */
        $buckets = [];

        foreach ($lines as $line) {
            $order = $line->order;
            $label = match ($groupBy) {
                'product' => $line->name,
                'order_date' => $order->created_at->format('F Y'),
                'order_type' => $typeLabels[$order->order_type] ?? $order->order_type,
                'employee' => $order->user->name ?? 'Unknown',
                default => $line->menuItem?->category?->name ?? 'None',
            };

            $gross = (float) $line->line_total;
            $subtotal = (float) $order->subtotal;
            $discountShare = $subtotal > 0 ? (float) $order->discount * $gross / $subtotal : 0.0;
            $net = $gross - $discountShare;
            $cost = (float) ($line->menuItem->cost ?? 0) * $line->quantity;

            $bucket = $buckets[$label] ?? [
                'label' => $label,
                'total_price' => 0.0,
                'subtotal_wo_discount' => 0.0,
                'total_discount' => 0.0,
                'margin' => 0.0,
                'product_quantity' => 0,
                'sale_line_count' => 0,
                'order_ids' => [],
            ];

            $bucket['total_price'] += $net;
            $bucket['subtotal_wo_discount'] += $gross;
            $bucket['total_discount'] += $discountShare;
            $bucket['margin'] += $net - $cost;
            $bucket['product_quantity'] += $line->quantity;
            $bucket['sale_line_count']++;
            $bucket['order_ids'][$order->id] = true;

            $buckets[$label] = $bucket;
        }

        ksort($buckets);

        $rows = array_values(array_map(function (array $b) {
            return [
                'label' => $b['label'],
                'total_price' => round($b['total_price'], 2),
                'subtotal_wo_discount' => round($b['subtotal_wo_discount'], 2),
                'total_discount' => round($b['total_discount'], 2),
                'margin' => round($b['margin'], 2),
                'product_quantity' => $b['product_quantity'],
                'sale_line_count' => $b['sale_line_count'],
                'order_count' => count($b['order_ids']),
                'average_price' => $b['product_quantity'] > 0
                    ? round($b['total_price'] / $b['product_quantity'], 2)
                    : 0.0,
            ];
        }, $buckets));

        return response()->json($rows);
    }

    /** Ticket-level rows returned with the Chef Performance report. */
    private const CHEF_DETAIL_LIMIT = 500;

    /**
     * Chef Performance KPI — per-cook productivity for the admin report. Every
     * ticket a cook picked up at the kitchen display counts: how many orders,
     * how many item units they cooked, and their cook time
     * (the gap between tapping Start and Ready, only over tickets that carry
     * both stamps). Cancelled orders are excluded; a removed cook's tickets
     * fold into "Unknown".
     *
     * A ticket can be shared — two cooks split one card — and then it counts in
     * full for each of them, so the per-cook rows deliberately add up to more
     * than the `overview`, which counts every ticket once.
     *
     * Returns six views over the same set of tickets so the screen can show an
     * overview, a per-cook comparison, a trend, a per-dish cut, a per-cook
     * per-dish cut and the raw list without six round trips: `overview`,
     * `chefs`, `by_day` / `by_hour` / `by_station`, `by_item` (each dish's
     * plates and its average clock — the dish's own, now the board times every
     * plate; tickets from the whole-card era fall back to the ticket's clock),
     * `by_chef_item` (each cook's own dishes — a tracked line credits only its
     * real maker with its own clock; a whole-card-era line credits the
     * ticket's whole crew, like the leaderboard), and
     * `details` (newest first, capped — `details_total` is the real count).
     *
     * Filters: ?period= today|week|month|year (default: all), or a custom
     * ?from= / ?to= window of ISO instants — either bound may stand alone, and
     * a custom window overrides the preset. ?chef_id= singles out one person,
     * ?station= kitchen|bar. Day and hour buckets are cut in the caller's
     * timezone via ?tz= (minutes east of UTC, as
     * `-new Date().getTimezoneOffset()`), since the app itself stores UTC.
     */
    public function chefPerformance(Request $request): JsonResponse
    {
        $request->validate([
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date'],
        ]);

        // Shifted to UTC like salesDetails — the client sends instants that
        // carry its offset, and the bindings must match the stored clock.
        $from = $request->filled('from') ? $request->date('from')->utc() : null;
        $to = $request->filled('to') ? $request->date('to')->utc() : null;

        $start = $from !== null || $to !== null ? $from : match ($request->string('period')->toString()) {
            'today' => now()->startOfDay(),
            'week' => now()->startOfWeek(),
            'month' => now()->startOfMonth(),
            'year' => now()->startOfYear(),
            default => null,
        };

        $chefId = $request->integer('chef_id') ?: null;
        $station = $request->string('station')->toString();
        $station = in_array($station, OrderRound::STATIONS, true) ? $station : null;
        // Clamped to the real UTC offset range so a junk ?tz= can't skew days.
        $tzMinutes = max(-840, min(840, $request->integer('tz')));

        // Measured per round, not per bill: a table that ordered twice is two
        // separate jobs, often for two different cooks, and averaging them into
        // one order would smear one cook's time across the other's.
        $rounds = OrderRound::query()
            // Attributed to somebody — the lead, or a crewmate still on the
            // roster after the lead was removed.
            ->where(fn ($q) => $q->whereNotNull('chef_id')->orWhereHas('chefs'))
            ->whereHas('order', fn ($q) => $q->whereNotIn('status', ['cancelled']))
            ->when($start, fn ($q) => $q->where('created_at', '>=', $start))
            ->when($to, fn ($q) => $q->where('created_at', '<=', $to))
            // Filtering to one cook means every ticket they worked on, not only
            // the ones they led — a shared card counts for both of them.
            ->when($chefId, fn ($q) => $q->where(fn ($w) => $w
                ->where('chef_id', $chefId)
                ->orWhereHas('chefs', fn ($c) => $c->where('chefs.id', $chefId))))
            ->when($station, fn ($q) => $q->where('station', $station))
            ->with(['chef:id,name', 'chefs:id,name', 'order:id,order_number,table_id', 'order.table:id,name'])
            ->withSum('items as items_count', 'quantity')
            ->get();

        // Every ticket's dish lines ride along — the per-dish cut below needs
        // them all, and the capped details list reuses the same loaded relation.
        // Since per-dish tracking, a line carries its own cook and clock.
        $rounds->load([
            'items:id,order_round_id,name,quantity,note,chef_id,started_at,ready_at',
            'items.chef:id,name',
        ]);

        // One bucket bag per dimension, all filled in the same pass.
        /** @var array<string, array<array-key, array<string, mixed>>> $bags */
        $bags = ['chef' => [], 'day' => [], 'hour' => [], 'station' => [], 'item' => [], 'chef_item' => []];

        $orderIds = [];
        $items = 0;
        $prepTotal = 0;
        $prepCount = 0;
        $fastest = null;
        $slowest = null;

        $blank = fn (array $seed) => $seed + [
            'order_ids' => [],
            'rounds' => 0,
            'items' => 0,
            'prep_seconds_total' => 0,
            'prep_count' => 0,
        ];

        // A clock only exists once its two stamps do — true of a ticket and of
        // a single dish alike.
        $clock = fn ($of) => $of->started_at && $of->ready_at
            ? (int) abs($of->ready_at->diffInSeconds($of->started_at))
            : null;

        foreach ($rounds as $round) {
            $roundItems = (int) $round->items_count;
            $prep = $clock($round);

            // Each cook's own stretch of the ticket: from their first dish
            // started to their last dish plated. Only lines the board timed
            // count; tickets from the whole-card era have none and fall back
            // to the ticket's clock below.
            $chefSpans = [];
            foreach ($round->items as $line) {
                if ($line->chef_id && $line->started_at && $line->ready_at) {
                    $span = $chefSpans[$line->chef_id] ?? ['from' => $line->started_at, 'to' => $line->ready_at];
                    $span['from'] = $span['from']->min($line->started_at);
                    $span['to'] = $span['to']->max($line->ready_at);
                    $chefSpans[$line->chef_id] = $span;
                }
            }

            // The wall clock the venue would recognise, not the stored UTC one.
            $at = ($round->started_at ?? $round->created_at)->copy()->addMinutes($tzMinutes);
            $day = $at->format('Y-m-d');
            $hour = (int) $at->format('G');
            $roundStation = $round->station ?? OrderRound::STATION_KITCHEN;

            // A card split between two cooks credits the ticket to each of them,
            // so the per-cook rows can add up to more than the board fired —
            // that is the point, and the overview below still counts it once.
            // Rows from before crews existed fall back to their single cook.
            // A cook's clock is their own span of the card when the board
            // timed their dishes, the whole ticket's clock when it didn't.
            $chefTargets = $round->chefs->isNotEmpty()
                ? $round->chefs->map(fn ($chef) => [
                    $chef->id,
                    ['chef_id' => $chef->id, 'chef' => $chef->name],
                    isset($chefSpans[$chef->id])
                        ? (int) abs($chefSpans[$chef->id]['to']->diffInSeconds($chefSpans[$chef->id]['from']))
                        : $prep,
                ])->all()
                : [[$round->chef_id, ['chef_id' => $round->chef_id, 'chef' => $round->chef?->name ?? 'Unknown'], $prep]];

            $targets = [
                'chef' => $chefTargets,
                'day' => [[$day, ['date' => $day], $prep]],
                'hour' => [[$hour, ['hour' => $hour], $prep]],
                'station' => [[$roundStation, ['station' => $roundStation], $prep]],
            ];

            foreach ($targets as $dim => $entries) {
                foreach ($entries as [$key, $seed, $entryPrep]) {
                    $bucket = $bags[$dim][$key] ?? $blank($seed);
                    // A cook who took both of a table's rounds still worked one order.
                    $bucket['order_ids'][$round->order_id] = true;
                    $bucket['rounds']++;
                    $bucket['items'] += $roundItems;
                    if ($entryPrep !== null) {
                        $bucket['prep_seconds_total'] += $entryPrep;
                        $bucket['prep_count']++;
                    }
                    $bags[$dim][$key] = $bucket;
                }
            }

            // The dish dimension counts each plate, not the whole round —
            // same-name lines (one with a note, one without) fold together
            // first so a ticket counts once per dish, whatever its line count.
            // A dish the board timed itself keeps its own clock (averaged
            // across the folded lines); one from the whole-card era rides the
            // ticket's clock, the only clock it ever had.
            $dishes = [];
            foreach ($round->items as $line) {
                $key = (string) $line->name;
                $dishes[$key]['name'] = $line->name;
                $dishes[$key]['qty'] = ($dishes[$key]['qty'] ?? 0) + (int) $line->quantity;
                if (($linePrep = $clock($line)) !== null) {
                    $dishes[$key]['prep_total'] = ($dishes[$key]['prep_total'] ?? 0) + $linePrep;
                    $dishes[$key]['prep_lines'] = ($dishes[$key]['prep_lines'] ?? 0) + 1;
                }
            }
            foreach ($dishes as $key => $dish) {
                $bucket = $bags['item'][$key] ?? $blank(['name' => $dish['name']]);
                $bucket['order_ids'][$round->order_id] = true;
                $bucket['rounds']++;
                $bucket['items'] += $dish['qty'];
                $dishPrep = isset($dish['prep_lines'])
                    ? (int) round($dish['prep_total'] / $dish['prep_lines'])
                    : $prep;
                if ($dishPrep !== null) {
                    $bucket['prep_seconds_total'] += $dishPrep;
                    $bucket['prep_count']++;
                }
                $bags['item'][$key] = $bucket;
            }

            // Who made what: a line the board tracked credits only its real
            // maker, with the line's own clock; a whole-card-era line credits
            // the ticket's whole crew (each in full, like the leaderboard)
            // with each cook's span of the card. Folded per (cook, dish)
            // within the round first, so a ticket counts once per pairing.
            $chefDishes = [];
            foreach ($round->items as $line) {
                $credits = $line->chef_id
                    ? [[$line->chef_id, $line->chef?->name ?? 'Unknown', $clock($line) ?? $prep]]
                    : array_map(fn ($t) => [$t[1]['chef_id'], $t[1]['chef'], $t[2]], $chefTargets);
                foreach ($credits as [$creditId, $creditName, $linePrep]) {
                    $pairKey = $creditId.'|'.$line->name;
                    $slot = $chefDishes[$pairKey] ?? [
                        'chef_id' => $creditId,
                        'chef' => $creditName,
                        'name' => $line->name,
                        'qty' => 0,
                        'prep_total' => 0,
                        'prep_lines' => 0,
                    ];
                    $slot['qty'] += (int) $line->quantity;
                    if ($linePrep !== null) {
                        $slot['prep_total'] += $linePrep;
                        $slot['prep_lines']++;
                    }
                    $chefDishes[$pairKey] = $slot;
                }
            }
            foreach ($chefDishes as $pairKey => $dish) {
                $bucket = $bags['chef_item'][$pairKey] ?? $blank([
                    'chef_id' => $dish['chef_id'],
                    'chef' => $dish['chef'],
                    'name' => $dish['name'],
                ]);
                $bucket['order_ids'][$round->order_id] = true;
                $bucket['rounds']++;
                $bucket['items'] += $dish['qty'];
                if ($dish['prep_lines'] > 0) {
                    $bucket['prep_seconds_total'] += (int) round($dish['prep_total'] / $dish['prep_lines']);
                    $bucket['prep_count']++;
                }
                $bags['chef_item'][$pairKey] = $bucket;
            }

            $orderIds[$round->order_id] = true;
            $items += $roundItems;
            if ($prep !== null) {
                $prepTotal += $prep;
                $prepCount++;
                $fastest = $fastest === null ? $prep : min($fastest, $prep);
                $slowest = $slowest === null ? $prep : max($slowest, $prep);
            }
        }

        // null when no ticket in the bucket carries both stamps — the UI dashes it.
        $avg = fn (array $b) => $b['prep_count'] > 0
            ? (int) round($b['prep_seconds_total'] / $b['prep_count'])
            : null;

        $chefRows = array_values(array_map(fn (array $b) => [
            'chef_id' => $b['chef_id'],
            'chef' => $b['chef'],
            'orders' => count($b['order_ids']),
            'rounds' => $b['rounds'],
            'items' => $b['items'],
            'timed_rounds' => $b['prep_count'],
            'avg_prep_seconds' => $avg($b),
        ], $bags['chef']));
        // Busiest cook first.
        usort($chefRows, fn ($a, $b) => $b['orders'] <=> $a['orders']);

        $dayRows = array_values(array_map(fn (array $b) => [
            'date' => $b['date'],
            'rounds' => $b['rounds'],
            'items' => $b['items'],
            'avg_prep_seconds' => $avg($b),
        ], $bags['day']));
        usort($dayRows, fn ($a, $b) => strcmp($a['date'], $b['date']));

        $hourRows = array_values(array_map(fn (array $b) => [
            'hour' => $b['hour'],
            'rounds' => $b['rounds'],
            'items' => $b['items'],
            'avg_prep_seconds' => $avg($b),
        ], $bags['hour']));
        usort($hourRows, fn ($a, $b) => $a['hour'] <=> $b['hour']);

        $stationRows = array_values(array_map(fn (array $b) => [
            'station' => $b['station'],
            'rounds' => $b['rounds'],
            'items' => $b['items'],
            'avg_prep_seconds' => $avg($b),
        ], $bags['station']));
        usort($stationRows, fn ($a, $b) => $b['rounds'] <=> $a['rounds']);

        // A dish's clock is the average of the tickets it appeared on — the
        // closest the board can get to "how long does this dish take".
        $itemRows = array_values(array_map(fn (array $b) => [
            'name' => $b['name'],
            'units' => $b['items'],
            'rounds' => $b['rounds'],
            'orders' => count($b['order_ids']),
            'timed_rounds' => $b['prep_count'],
            'avg_prep_seconds' => $avg($b),
        ], $bags['item']));
        // Most-cooked dish first.
        usort($itemRows, fn ($a, $b) => $b['units'] <=> $a['units']);

        // Each cook's own menu, one row per (cook, dish) — how many plates of
        // it they made and their own clock on it.
        $chefItemRows = array_values(array_map(fn (array $b) => [
            'chef_id' => $b['chef_id'],
            'chef' => $b['chef'],
            'name' => $b['name'],
            'units' => $b['items'],
            'rounds' => $b['rounds'],
            'orders' => count($b['order_ids']),
            'timed_rounds' => $b['prep_count'],
            'avg_prep_seconds' => $avg($b),
        ], $bags['chef_item']));
        // Grouped per cook in leaderboard order, each cook's biggest dish first.
        $chefOrder = array_flip(array_column($chefRows, 'chef_id'));
        usort($chefItemRows, fn ($a, $b) => (($chefOrder[$a['chef_id']] ?? PHP_INT_MAX) <=> ($chefOrder[$b['chef_id']] ?? PHP_INT_MAX))
            ?: $b['units'] <=> $a['units']);

        // Newest ticket first, capped — a year of service is thousands of rows
        // and the list is meant to be read, not paged through.
        $detailRounds = $rounds
            ->sortByDesc(fn ($round) => ($round->started_at ?? $round->created_at)->timestamp)
            ->take(self::CHEF_DETAIL_LIMIT);

        $details = $detailRounds
            ->map(fn ($round) => [
                'id' => $round->id,
                'order_id' => $round->order_id,
                'order_number' => $round->order?->order_number,
                'table' => $round->order?->table?->name,
                'round_no' => $round->round_no,
                'station' => $round->station,
                'status' => $round->status,
                'chef_id' => $round->chef_id,
                // The whole crew on one line — "Bopha + Rithy" — so a shared
                // ticket doesn't read as if one person cooked it alone.
                'chef' => $round->chefs->isNotEmpty()
                    ? $round->chefs->pluck('name')->join(' + ')
                    : ($round->chef?->name ?? 'Unknown'),
                'items' => (int) $round->items_count,
                'started_at' => $round->started_at?->toIso8601String(),
                'ready_at' => $round->ready_at?->toIso8601String(),
                'created_at' => $round->created_at?->toIso8601String(),
                'prep_seconds' => $round->started_at && $round->ready_at
                    ? (int) abs($round->ready_at->diffInSeconds($round->started_at))
                    : null,
                // What the cook actually made, dish by dish — since per-dish
                // tracking, each line names its own maker, its own two stamps
                // and its own clock.
                'lines' => $round->items->map(fn ($line) => [
                    'name' => $line->name,
                    'quantity' => (int) $line->quantity,
                    'note' => $line->note,
                    'chef' => $line->chef?->name,
                    'started_at' => $line->started_at?->toIso8601String(),
                    'ready_at' => $line->ready_at?->toIso8601String(),
                    'prep_seconds' => $line->started_at && $line->ready_at
                        ? (int) abs($line->ready_at->diffInSeconds($line->started_at))
                        : null,
                ])->values(),
                'dishes' => $round->items->count(),
            ])
            ->values();

        return response()->json([
            'overview' => [
                'orders' => count($orderIds),
                'rounds' => $rounds->count(),
                'items' => $items,
                'chefs' => count($bags['chef']),
                'timed_rounds' => $prepCount,
                'avg_prep_seconds' => $prepCount > 0 ? (int) round($prepTotal / $prepCount) : null,
                'fastest_seconds' => $fastest,
                'slowest_seconds' => $slowest,
                'busiest_chef' => $chefRows[0]['chef'] ?? null,
            ],
            'chefs' => $chefRows,
            'by_day' => $dayRows,
            'by_hour' => $hourRows,
            'by_station' => $stationRows,
            'by_item' => $itemRows,
            'by_chef_item' => $chefItemRows,
            'details' => $details,
            'details_total' => $rounds->count(),
        ]);
    }

    /**
     * Top selling menu items by quantity. Limit via ?limit= (default 10).
     */
    public function topItems(Request $request): JsonResponse
    {
        $limit = min($request->integer('limit') ?: 10, 100);

        $items = OrderItem::select(
            'menu_item_id',
            'name',
            DB::raw('SUM(quantity) as total_quantity'),
            DB::raw('SUM(line_total) as total_sales')
        )
            ->whereNotNull('menu_item_id')
            // Dead orders don't make best-sellers.
            ->whereHas('order', fn ($q) => $q->whereNotIn('status', ['cancelled', 'refunded']))
            ->groupBy('menu_item_id', 'name')
            ->orderByDesc('total_quantity')
            ->limit($limit)
            ->get();

        return response()->json($items);
    }

    /**
     * Every order in ?start=&end= (UTC instants) as JSON, one row per bill —
     * the data behind the admin's "Export Orders" PDF. ?tz= (minutes east of
     * UTC, as `-new Date().getTimezoneOffset()`) shifts the shown date/time to
     * the venue's wall clock; the date window itself is already absolute.
     */
    public function ordersList(Request $request): JsonResponse
    {
        $request->validate([
            'start' => ['required', 'date'],
            'end' => ['required', 'date', 'after_or_equal:start'],
        ]);

        $start = $request->date('start')->utc();
        $end = $request->date('end')->utc();
        $tzMinutes = max(-840, min(840, $request->integer('tz')));

        $typeLabels = ['dine_in' => 'Dine-in', 'take_away' => 'Take-away', 'delivery' => 'Delivery'];

        $orders = Order::query()
            ->with(['table:id,name', 'user:id,name'])
            ->withSum('items as item_quantity', 'quantity')
            ->whereBetween('created_at', [$start, $end])
            ->orderBy('created_at')
            ->get();

        return response()->json(
            $orders->map(function (Order $order) use ($typeLabels, $tzMinutes) {
                $at = $order->created_at?->copy()->addMinutes($tzMinutes);

                return [
                    'order_number' => $order->order_number,
                    'date' => $at?->format('Y-m-d'),
                    'time' => $at?->format('H:i'),
                    'type' => $typeLabels[$order->order_type] ?? $order->order_type,
                    'table' => $order->table?->name,
                    'staff' => $order->user?->name,
                    'guests' => (int) $order->guest_count,
                    'items' => (int) $order->item_quantity,
                    'subtotal' => (float) $order->subtotal,
                    'discount' => (float) $order->discount,
                    'total' => (float) $order->total,
                    'status' => $order->status,
                ];
            })->values()
        );
    }
}
