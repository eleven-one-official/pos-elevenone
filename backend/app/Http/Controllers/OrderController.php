<?php

namespace App\Http\Controllers;

use App\Models\MenuItem;
use App\Models\Order;
use App\Models\Table;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class OrderController extends Controller
{
    /**
     * List orders. Filter by ?status=, ?order_type=, ?table_id=, ?date=YYYY-MM-DD.
     */
    public function index(Request $request): JsonResponse
    {
        $query = Order::query()
            ->with(['items', 'table', 'user:id,name,username', 'payments'])
            ->latest();

        if ($request->filled('status')) {
            $query->where('status', $request->string('status'));
        }

        if ($request->filled('order_type')) {
            $query->where('order_type', $request->string('order_type'));
        }

        if ($request->filled('table_id')) {
            $query->where('table_id', $request->integer('table_id'));
        }

        if ($request->filled('date')) {
            $query->whereDate('created_at', $request->date('date'));
        }

        return response()->json($query->get());
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'order_type' => ['required', 'in:dine_in,take_away,delivery'],
            'table_id' => ['nullable', 'required_if:order_type,dine_in', 'exists:tables,id'],
            'discount' => ['nullable', 'numeric', 'min:0'],
            'tax' => ['nullable', 'numeric', 'min:0'],
            'note' => ['nullable', 'string'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.menu_item_id' => ['required', 'exists:menu_items,id'],
            'items.*.quantity' => ['required', 'integer', 'min:1'],
            'items.*.note' => ['nullable', 'string'],
        ]);

        $order = DB::transaction(function () use ($data, $request) {
            $order = Order::create([
                'order_number' => Order::generateOrderNumber(),
                'order_type' => $data['order_type'],
                'table_id' => $data['table_id'] ?? null,
                'user_id' => $request->user()?->id,
                'status' => 'new',
                'discount' => $data['discount'] ?? 0,
                'tax' => $data['tax'] ?? 0,
                'note' => $data['note'] ?? null,
            ]);

            foreach ($data['items'] as $line) {
                $menuItem = MenuItem::findOrFail($line['menu_item_id']);
                $quantity = (int) $line['quantity'];
                $price = (float) $menuItem->price;

                $order->items()->create([
                    'menu_item_id' => $menuItem->id,
                    'name' => $menuItem->name,
                    'price' => $price,
                    'quantity' => $quantity,
                    'note' => $line['note'] ?? null,
                    'line_total' => $price * $quantity,
                ]);
            }

            $order->recalculateTotals();

            if ($order->order_type === 'dine_in' && $order->table_id) {
                Table::whereKey($order->table_id)->update(['status' => 'occupied']);
            }

            return $order;
        });

        return response()->json(
            $order->load(['items', 'table', 'user:id,name,username', 'payments']),
            201
        );
    }

    public function show(Order $order): JsonResponse
    {
        return response()->json(
            $order->load(['items', 'table', 'user:id,name,username', 'payments'])
        );
    }

    /**
     * Update order status / discount / tax / note, and optionally replace items.
     */
    public function update(Request $request, Order $order): JsonResponse
    {
        $data = $request->validate([
            'status' => ['sometimes', 'in:new,preparing,ready,served,completed,cancelled'],
            'order_type' => ['sometimes', 'in:dine_in,take_away,delivery'],
            'table_id' => ['nullable', 'exists:tables,id'],
            'discount' => ['nullable', 'numeric', 'min:0'],
            'tax' => ['nullable', 'numeric', 'min:0'],
            'note' => ['nullable', 'string'],
            'items' => ['sometimes', 'array', 'min:1'],
            'items.*.menu_item_id' => ['required_with:items', 'exists:menu_items,id'],
            'items.*.quantity' => ['required_with:items', 'integer', 'min:1'],
            'items.*.note' => ['nullable', 'string'],
        ]);

        DB::transaction(function () use ($data, $order) {
            $order->fill(collect($data)->only(['status', 'order_type', 'table_id', 'discount', 'tax', 'note'])->all());
            $order->save();

            if (array_key_exists('items', $data)) {
                $order->items()->delete();
                foreach ($data['items'] as $line) {
                    $menuItem = MenuItem::findOrFail($line['menu_item_id']);
                    $quantity = (int) $line['quantity'];
                    $price = (float) $menuItem->price;

                    $order->items()->create([
                        'menu_item_id' => $menuItem->id,
                        'name' => $menuItem->name,
                        'price' => $price,
                        'quantity' => $quantity,
                        'note' => $line['note'] ?? null,
                        'line_total' => $price * $quantity,
                    ]);
                }
            }

            $order->recalculateTotals();

            // Free the table when the order is closed.
            if (in_array($order->status, ['completed', 'cancelled'], true) && $order->table_id) {
                Table::whereKey($order->table_id)->update(['status' => 'available']);
            }
        });

        return response()->json(
            $order->load(['items', 'table', 'user:id,name,username', 'payments'])
        );
    }

    public function destroy(Order $order): JsonResponse
    {
        if ($order->table_id) {
            Table::whereKey($order->table_id)->update(['status' => 'available']);
        }

        $order->delete();

        return response()->json(['message' => 'Order deleted.']);
    }
}
