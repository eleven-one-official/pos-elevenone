<?php

namespace App\Http\Controllers;

use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Payment;
use App\Models\Table;
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

        return response()->json([
            'today_sales' => (float) (clone $completed)->where('created_at', '>=', $today)->sum('total'),
            'monthly_sales' => (float) (clone $completed)->where('created_at', '>=', $monthStart)->sum('total'),
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

        return response()->json([
            'date' => $date->toDateString(),
            'orders_count' => (clone $orders)->count(),
            'gross_sales' => (float) (clone $orders)->sum('subtotal'),
            'discount' => (float) (clone $orders)->sum('discount'),
            'tax' => (float) (clone $orders)->sum('tax'),
            'net_sales' => (float) (clone $orders)->sum('total'),
            'payment_summary' => $paymentSummary,
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
                $q->where('status', '!=', 'cancelled');
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
     * Top selling menu items by quantity. Limit via ?limit= (default 10).
     */
    public function topItems(Request $request): JsonResponse
    {
        $limit = $request->integer('limit') ?: 10;

        $items = OrderItem::select(
            'menu_item_id',
            'name',
            DB::raw('SUM(quantity) as total_quantity'),
            DB::raw('SUM(line_total) as total_sales')
        )
            ->whereNotNull('menu_item_id')
            ->groupBy('menu_item_id', 'name')
            ->orderByDesc('total_quantity')
            ->limit($limit)
            ->get();

        return response()->json($items);
    }
}
