<?php

namespace App\Http\Controllers;

use App\Models\MenuItem;
use App\Models\Order;
use App\Models\Pricelist;
use App\Models\Setting;
use App\Models\Table;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class OrderController extends Controller
{
    /** Relations every order response carries. */
    private const WITH = [
        'items', 'table', 'user:id,name,username', 'customer:id,name',
        'payments', 'payments.paymentMethod:id,label',
    ];

    /**
     * The pricelist that should price this order: the explicitly requested
     * one, or the venue's default_pricelist_id setting. Null = menu prices.
     */
    private function resolvePricelist(?int $requested): ?Pricelist
    {
        $id = $requested;
        if ($id === null) {
            $raw = Setting::where('key', 'default_pricelist_id')->value('value');
            $id = ($raw !== null && $raw !== '') ? (int) $raw : null;
        }

        return $id ? Pricelist::with('rules')->find($id) : null;
    }

    /** Riel per USD from settings — converts KHR pricelist rules to base USD. */
    private function khrRate(): float
    {
        return (float) (Setting::where('key', 'currency_khr_rate')->value('value') ?: 4100);
    }
    /**
     * List orders. Filter by ?status=, ?order_type=, ?table_id=, ?date=YYYY-MM-DD
     * and ?search= (order number). Plain array by default (the POS floor
     * expects that); pass ?per_page= for the back office's paginated list.
     */
    public function index(Request $request): JsonResponse
    {
        $query = Order::query()
            ->with(self::WITH)
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

        if ($request->filled('search')) {
            $query->where('order_number', 'like', '%'.$request->string('search').'%');
        }

        if ($request->filled('per_page')) {
            // Clamp so a client can't request an unbounded page.
            $perPage = max(1, min($request->integer('per_page'), 100));

            return response()->json($query->paginate($perPage));
        }

        return response()->json($query->get());
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'order_type' => ['required', 'in:dine_in,take_away,delivery'],
            'table_id' => ['nullable', 'required_if:order_type,dine_in', 'exists:tables,id'],
            'customer_id' => ['nullable', 'exists:customers,id'],
            'pricelist_id' => ['nullable', 'exists:pricelists,id'],
            'guest_count' => ['nullable', 'integer', 'min:0', 'max:65535'],
            'discount' => ['nullable', 'numeric', 'min:0'],
            'tax' => ['nullable', 'numeric', 'min:0'],
            'note' => ['nullable', 'string'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.menu_item_id' => ['required', 'exists:menu_items,id'],
            'items.*.quantity' => ['required', 'integer', 'min:1'],
            'items.*.note' => ['nullable', 'string', 'max:255'],
        ]);

        $pricelist = $this->resolvePricelist($data['pricelist_id'] ?? null);
        $khrRate = $this->khrRate();

        $order = DB::transaction(function () use ($data, $request, $pricelist, $khrRate) {
            $order = Order::create([
                'order_number' => Order::generateOrderNumber(),
                'order_type' => $data['order_type'],
                'table_id' => $data['table_id'] ?? null,
                'user_id' => $request->user()?->id,
                'customer_id' => $data['customer_id'] ?? null,
                'pricelist_id' => $pricelist?->id,
                'status' => 'new',
                'guest_count' => $data['guest_count'] ?? 0,
                'discount' => $data['discount'] ?? 0,
                'tax' => $data['tax'] ?? 0,
                'note' => $data['note'] ?? null,
            ]);

            foreach ($data['items'] as $line) {
                $menuItem = MenuItem::findOrFail($line['menu_item_id']);
                $quantity = (int) $line['quantity'];
                $price = $pricelist?->priceFor($menuItem, $quantity, $khrRate) ?? (float) $menuItem->price;

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

        return response()->json($order->load(self::WITH), 201);
    }

    public function show(Order $order): JsonResponse
    {
        return response()->json($order->load(self::WITH));
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
            'customer_id' => ['nullable', 'exists:customers,id'],
            'pricelist_id' => ['nullable', 'exists:pricelists,id'],
            'guest_count' => ['nullable', 'integer', 'min:0', 'max:65535'],
            'discount' => ['nullable', 'numeric', 'min:0'],
            'tax' => ['nullable', 'numeric', 'min:0'],
            'note' => ['nullable', 'string'],
            'items' => ['sometimes', 'array', 'min:1'],
            'items.*.menu_item_id' => ['required_with:items', 'exists:menu_items,id'],
            'items.*.quantity' => ['required_with:items', 'integer', 'min:1'],
            'items.*.note' => ['nullable', 'string', 'max:255'],
        ]);

        // An order keeps the pricelist it was opened with unless the request
        // names another (or explicitly clears it with null); replaced items
        // re-price through the resulting pricelist either way.
        $pricelistId = array_key_exists('pricelist_id', $data) ? $data['pricelist_id'] : $order->pricelist_id;
        $pricelist = $pricelistId ? Pricelist::with('rules')->find($pricelistId) : null;
        $khrRate = $this->khrRate();

        DB::transaction(function () use ($data, $order, $pricelist, $khrRate) {
            $order->fill(collect($data)->only(['status', 'order_type', 'table_id', 'customer_id', 'guest_count', 'discount', 'tax', 'note'])->all());
            $order->pricelist_id = $pricelist?->id;
            $order->save();

            if (array_key_exists('items', $data)) {
                $order->items()->delete();
                foreach ($data['items'] as $line) {
                    $menuItem = MenuItem::findOrFail($line['menu_item_id']);
                    $quantity = (int) $line['quantity'];
                    $price = $pricelist?->priceFor($menuItem, $quantity, $khrRate) ?? (float) $menuItem->price;

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

        return response()->json($order->load(self::WITH));
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
