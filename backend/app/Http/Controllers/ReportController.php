<?php

namespace App\Http\Controllers;

use App\Models\Order;
use App\Models\OrderItem;
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

        $start = $request->date('start');
        $end = $request->date('end');

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

        $payments = Payment::where('payments.status', 'paid')
            ->whereBetween('payments.created_at', [$start, $end])
            ->whereHas('order', $sideFilter)
            ->select('method', DB::raw('SUM(amount) as amount'), DB::raw('COUNT(*) as count'))
            ->groupBy('method')
            ->orderBy('method')
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
                'amount' => -(float) $refunds->amount,
                'count' => (int) $refunds->count,
            ]);
            $total -= (float) $refunds->amount;
        }

        return response()->json([
            'start' => $start->toDateTimeString(),
            'end' => $end->toDateTimeString(),
            'orders_count' => count($orderIds),
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

    /**
     * Chef Performance KPI — per-cook productivity for the admin report. Every
     * order a cook picked up at the kitchen display (has a chef_id) counts:
     * how many orders, how many item units they cooked, and their average cook
     * time (the gap between tapping Start and Ready, only over tickets that
     * carry both stamps). Cancelled orders are excluded; a removed cook's
     * orders fold into "Unknown". Window via ?period= today|week|month|year
     * (default: all).
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

        $orders = Order::query()
            ->whereNotNull('chef_id')
            ->whereNotIn('status', ['cancelled'])
            ->when($start, fn ($q) => $q->where('created_at', '>=', $start))
            ->with('chef:id,name')
            ->withSum('items as items_count', 'quantity')
            ->get();

        /** @var array<int, array<string, mixed>> $buckets */
        $buckets = [];

        foreach ($orders as $order) {
            $chefId = $order->chef_id;
            $bucket = $buckets[$chefId] ?? [
                'chef_id' => $chefId,
                'chef' => $order->chef?->name ?? 'Unknown',
                'orders' => 0,
                'items' => 0,
                'prep_seconds_total' => 0,
                'prep_count' => 0,
            ];

            $bucket['orders']++;
            $bucket['items'] += (int) $order->items_count;
            if ($order->started_at && $order->ready_at) {
                $bucket['prep_seconds_total'] += abs($order->ready_at->diffInSeconds($order->started_at));
                $bucket['prep_count']++;
            }

            $buckets[$chefId] = $bucket;
        }

        $rows = array_values(array_map(fn (array $b) => [
            'chef_id' => $b['chef_id'],
            'chef' => $b['chef'],
            'orders' => $b['orders'],
            'items' => $b['items'],
            // null when no ticket carries both stamps yet — the UI shows a dash.
            'avg_prep_seconds' => $b['prep_count'] > 0
                ? (int) round($b['prep_seconds_total'] / $b['prep_count'])
                : null,
        ], $buckets));

        // Busiest cook first.
        usort($rows, fn ($a, $b) => $b['orders'] <=> $a['orders']);

        return response()->json($rows);
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
