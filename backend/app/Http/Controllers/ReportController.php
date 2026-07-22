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
     * most recent day with a completed order; its cash balance sums that day's
     * paid cash payments (only cashiers record payments).
     */
    public function posConfigs(): JsonResponse
    {
        $waiterIds = User::whereHas('role', fn ($q) => $q->where('slug', 'waiter'))->pluck('id');

        $sideStats = function ($ordersQuery, bool $withCash) {
            $open = (clone $ordersQuery)
                ->whereIn('status', ['new', 'preparing', 'ready', 'served'])
                ->count();
            $lastCompleted = (clone $ordersQuery)->where('status', 'completed')->latest()->first();

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

            $row = $products[$line->name] ?? [
                'name' => $line->name,
                'category' => $line->menuItem?->category?->name ?? 'None',
                'quantity' => 0,
                'amount' => 0.0,
            ];
            $row['quantity'] += $line->quantity;
            $row['amount'] += $net;
            $products[$line->name] = $row;

            $orderIds[$order->id] = true;
            $total += $net;
        }

        ksort($products);

        // Grouped by journal (Cash USD, Cash KHR, ABA PAY, Grab Merchant, …),
        // not by the raw channel — so the report names exactly which tender took
        // the money instead of lumping every cash journal into one "Cash" line.
        // Older payments that carry no journal fall back to their channel code.
        $payments = Payment::where('payments.status', 'paid')
            ->whereBetween('payments.created_at', [$start, $end])
            ->whereHas('order', $sideFilter)
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

        return response()->json([
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
        ]);
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
     * Returns four views over the same set of tickets so the screen can show an
     * overview, a per-cook comparison, a trend and the raw list without four
     * round trips: `overview`, `chefs`, `by_day` / `by_hour` / `by_station`,
     * and `details` (newest first, capped — `details_total` is the real count).
     *
     * Filters: ?period= today|week|month|year (default: all), ?chef_id= to
     * single out one person, ?station= kitchen|bar. Day and hour buckets are
     * cut in the caller's timezone via ?tz= (minutes east of UTC, as
     * `-new Date().getTimezoneOffset()`), since the app itself stores UTC.
     */
    public function chefPerformance(Request $request): JsonResponse
    {
        $start = match ($request->string('period')->toString()) {
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
            // Filtering to one cook means every ticket they worked on, not only
            // the ones they led — a shared card counts for both of them.
            ->when($chefId, fn ($q) => $q->where(fn ($w) => $w
                ->where('chef_id', $chefId)
                ->orWhereHas('chefs', fn ($c) => $c->where('chefs.id', $chefId))))
            ->when($station, fn ($q) => $q->where('station', $station))
            ->with(['chef:id,name', 'chefs:id,name', 'order:id,order_number,table_id', 'order.table:id,name'])
            ->withSum('items as items_count', 'quantity')
            ->get();

        // One bucket bag per dimension, all filled in the same pass.
        /** @var array<string, array<array-key, array<string, mixed>>> $bags */
        $bags = ['chef' => [], 'day' => [], 'hour' => [], 'station' => []];

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

        foreach ($rounds as $round) {
            $roundItems = (int) $round->items_count;
            // A ticket's clock only exists once it has been started and finished.
            $prep = $round->started_at && $round->ready_at
                ? (int) abs($round->ready_at->diffInSeconds($round->started_at))
                : null;

            // The wall clock the venue would recognise, not the stored UTC one.
            $at = ($round->started_at ?? $round->created_at)->copy()->addMinutes($tzMinutes);
            $day = $at->format('Y-m-d');
            $hour = (int) $at->format('G');
            $roundStation = $round->station ?? OrderRound::STATION_KITCHEN;

            // A card split between two cooks credits the ticket to each of them,
            // so the per-cook rows can add up to more than the board fired —
            // that is the point, and the overview below still counts it once.
            // Rows from before crews existed fall back to their single cook.
            $chefTargets = $round->chefs->isNotEmpty()
                ? $round->chefs->map(fn ($chef) => [$chef->id, ['chef_id' => $chef->id, 'chef' => $chef->name]])->all()
                : [[$round->chef_id, ['chef_id' => $round->chef_id, 'chef' => $round->chef?->name ?? 'Unknown']]];

            $targets = [
                'chef' => $chefTargets,
                'day' => [[$day, ['date' => $day]]],
                'hour' => [[$hour, ['hour' => $hour]]],
                'station' => [[$roundStation, ['station' => $roundStation]]],
            ];

            foreach ($targets as $dim => $entries) {
                foreach ($entries as [$key, $seed]) {
                    $bucket = $bags[$dim][$key] ?? $blank($seed);
                    // A cook who took both of a table's rounds still worked one order.
                    $bucket['order_ids'][$round->order_id] = true;
                    $bucket['rounds']++;
                    $bucket['items'] += $roundItems;
                    if ($prep !== null) {
                        $bucket['prep_seconds_total'] += $prep;
                        $bucket['prep_count']++;
                    }
                    $bags[$dim][$key] = $bucket;
                }
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

        // Newest ticket first, capped — a year of service is thousands of rows
        // and the list is meant to be read, not paged through.
        $detailRounds = $rounds
            ->sortByDesc(fn ($round) => ($round->started_at ?? $round->created_at)->timestamp)
            ->take(self::CHEF_DETAIL_LIMIT);

        // The dishes themselves, only for the tickets that are actually listed —
        // the aggregates above already have their quantities from withSum.
        $detailRounds->load('items:id,order_round_id,name,quantity,note');

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
                // What the cook actually made, dish by dish.
                'lines' => $round->items->map(fn ($line) => [
                    'name' => $line->name,
                    'quantity' => (int) $line->quantity,
                    'note' => $line->note,
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
}
