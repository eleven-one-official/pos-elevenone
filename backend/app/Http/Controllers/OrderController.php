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
use Illuminate\Validation\ValidationException;

class OrderController extends Controller
{
    /** Relations every order response carries. */
    private const WITH = [
        'items', 'table', 'user:id,name,username', 'chef:id,name', 'customer:id,name',
        'payments', 'payments.paymentMethod:id,label',
    ];

    /** An order still in service — it holds its table until it closes. */
    private const OPEN_STATUSES = ['new', 'preparing', 'ready', 'served'];

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
     * A discount can wipe a bill down to zero, never past it. Called after
     * totals are recomputed, inside the transaction, so a bad discount rolls
     * everything back with a 422.
     */
    private function assertDiscountWithinSubtotal(Order $order): void
    {
        if ((float) $order->discount > (float) $order->subtotal + 0.001) {
            throw ValidationException::withMessages([
                'discount' => ['The discount cannot exceed the order subtotal.'],
            ]);
        }
    }
    /**
     * List orders. Filter by ?status=, ?order_type=, ?table_id=, ?date=YYYY-MM-DD
     * and ?search= (order number). ?status= accepts a comma-separated list
     * (e.g. new,preparing) so the kitchen screen can pull its whole queue in one
     * call. Plain array by default (the POS floor expects that); pass ?per_page=
     * for the back office's paginated list.
     */
    public function index(Request $request): JsonResponse
    {
        $query = Order::query()
            ->with(self::WITH)
            ->latest();

        if ($request->filled('status')) {
            $statuses = array_values(array_filter(
                array_map('trim', explode(',', (string) $request->string('status')))
            ));
            $query->whereIn('status', $statuses);
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

        // Waiters take orders and fire them to the kitchen; money adjustments
        // stay on the cashier / back office side.
        if (($data['discount'] ?? 0) > 0 && $request->user()?->hasRole('waiter')) {
            return response()->json(['message' => 'Waiters cannot apply discounts.'], 403);
        }

        // One live bill per table — a second one would double-charge the
        // guests. The POS loads the open order first; this catches the race
        // (or a stale screen) where it didn't.
        if ($data['order_type'] === 'dine_in' && ($data['table_id'] ?? null)) {
            $existing = Order::where('table_id', $data['table_id'])
                ->whereIn('status', self::OPEN_STATUSES)
                ->latest()
                ->first();
            if ($existing) {
                return response()->json([
                    'message' => "This table already has open order {$existing->order_number} — load it instead of starting a second bill.",
                ], 422);
            }
        }

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
            $this->assertDiscountWithinSubtotal($order);

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
            'chef_id' => ['nullable', 'exists:chefs,id'],
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

        $user = $request->user();
        $isBackOffice = $user?->hasRole('admin') || $user?->hasRole('manager');

        // Closed orders are money history. Only a back-office status correction
        // may touch them — plus the POS's idempotent "mark completed" ping that
        // can arrive right after the final split payment already closed it.
        if (in_array($order->status, ['completed', 'cancelled', 'refunded'], true)) {
            $statusOnly = count($data) === 1 && array_key_exists('status', $data);
            $sameStatus = ($data['status'] ?? null) === $order->status;
            if (! ($statusOnly && ($isBackOffice || $sameStatus))) {
                return response()->json([
                    'message' => "This order is {$order->status} — its items and totals can no longer be changed.",
                ], 422);
            }
        }

        // The kitchen display only advances an order through the cooking flow —
        // it never edits items, prices, guests or the table, and can't close a
        // bill. So it may send `status` (within the kitchen flow) and the
        // `chef_id` of the cook who picked the ticket up, and nothing else.
        if ($user?->hasRole('kitchen')) {
            if (array_diff(array_keys($data), ['status', 'chef_id'])) {
                return response()->json(['message' => 'The kitchen can only update an order’s status.'], 403);
            }
            if (isset($data['status']) && ! in_array($data['status'], ['new', 'preparing', 'ready', 'served'], true)) {
                return response()->json(['message' => 'The kitchen cannot close or cancel an order.'], 403);
            }
        }

        // Waiters run the kitchen flow only; closing or cancelling a bill is
        // cashier / back-office work, as is any discount change.
        if ($user?->hasRole('waiter')) {
            if (isset($data['status']) && ! in_array($data['status'], ['new', 'preparing', 'ready', 'served'], true)) {
                return response()->json(['message' => 'Waiters cannot close or cancel an order.'], 403);
            }
            if (isset($data['discount']) && round((float) $data['discount'], 2) !== round((float) $order->discount, 2)) {
                return response()->json(['message' => 'Waiters cannot change discounts.'], 403);
            }
        }

        // Completing an order is normally PaymentController's job once the
        // money covers the bill. A direct completion is allowed for the back
        // office, or when recorded payments already cover the total (small
        // tolerance for a split's rounding cent).
        if (($data['status'] ?? null) === 'completed' && $order->status !== 'completed' && ! $isBackOffice) {
            $paid = (float) $order->payments()->where('status', 'paid')->sum('amount');
            if ($paid + 0.05 < (float) $order->total) {
                return response()->json([
                    'message' => 'This order is not fully paid — record the payment instead of completing it directly.',
                ], 422);
            }
        }

        // A changed table_id is a transfer. The destination has to be free —
        // otherwise the move would stack two live bills on one table, the very
        // thing store() refuses when a bill is first opened.
        $previousTableId = $order->table_id === null ? null : (int) $order->table_id;
        if (array_key_exists('table_id', $data)) {
            $targetTableId = $data['table_id'] === null ? null : (int) $data['table_id'];
            if ($targetTableId !== null && $targetTableId !== $previousTableId) {
                $taken = Order::where('table_id', $targetTableId)
                    ->whereKeyNot($order->id)
                    ->whereIn('status', self::OPEN_STATUSES)
                    ->latest()
                    ->first();
                if ($taken) {
                    return response()->json([
                        'message' => "That table already has open order {$taken->order_number} — close it before transferring another bill there.",
                    ], 422);
                }
            }
        }

        // An order keeps the pricelist it was opened with unless the request
        // names another (or explicitly clears it with null); replaced items
        // re-price through the resulting pricelist either way.
        $pricelistId = array_key_exists('pricelist_id', $data) ? $data['pricelist_id'] : $order->pricelist_id;
        $pricelist = $pricelistId ? Pricelist::with('rules')->find($pricelistId) : null;
        $khrRate = $this->khrRate();

        DB::transaction(function () use ($data, $order, $pricelist, $khrRate, $previousTableId) {
            $order->fill(collect($data)->only(['status', 'order_type', 'table_id', 'chef_id', 'customer_id', 'guest_count', 'discount', 'tax', 'note'])->all());

            // Stamp the kitchen-flow timestamps as the ticket advances, for the
            // Chef Performance KPI. Set once — a re-tap or a later status change
            // never overwrites when the cook first started or plated.
            if (($data['status'] ?? null) === 'preparing' && $order->started_at === null) {
                $order->started_at = now();
            }
            if (($data['status'] ?? null) === 'ready' && $order->ready_at === null) {
                $order->ready_at = now();
            }

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
            $this->assertDiscountWithinSubtotal($order);

            // A transfer moved the bill. `tables.status` drives the floor's
            // occupied badge, so it has to follow the order: release the table
            // the bill left (unless another live bill is still sitting there)
            // and seat the one it landed on. Without this the old table stays
            // flagged occupied forever and the new one never lights up.
            $currentTableId = $order->table_id === null ? null : (int) $order->table_id;
            if ($currentTableId !== $previousTableId) {
                if ($previousTableId !== null) {
                    $stillSeated = Order::where('table_id', $previousTableId)
                        ->whereKeyNot($order->id)
                        ->whereIn('status', self::OPEN_STATUSES)
                        ->exists();
                    if (! $stillSeated) {
                        Table::whereKey($previousTableId)->update(['status' => 'available']);
                    }
                }
                if ($currentTableId !== null && in_array($order->status, self::OPEN_STATUSES, true)) {
                    Table::whereKey($currentTableId)->update(['status' => 'occupied']);
                }
            }

            // Free the table when the order is closed.
            if (in_array($order->status, ['completed', 'cancelled'], true) && $order->table_id) {
                Table::whereKey($order->table_id)->update(['status' => 'available']);
            }
        });

        return response()->json($order->load(self::WITH));
    }

    /**
     * Email the guest their copy of a settled bill. Defaults to the linked
     * customer's address when none is given.
     */
    public function emailReceipt(Request $request, Order $order): JsonResponse
    {
        $data = $request->validate([
            'email' => ['nullable', 'email', 'max:255'],
        ]);

        $email = $data['email'] ?? $order->customer?->email;
        if (! $email) {
            return response()->json(['message' => 'No email address given and the order has no customer email.'], 422);
        }

        if (! in_array($order->status, ['completed', 'refunded'], true)) {
            return response()->json(['message' => 'Only a settled bill can be emailed.'], 422);
        }

        try {
            \Illuminate\Support\Facades\Mail::to($email)->send(new \App\Mail\ReceiptMail($order));
        } catch (\Throwable $e) {
            report($e);

            return response()->json(['message' => 'Sending failed — check the mail settings on the server.'], 502);
        }

        \App\Models\AuditLog::record('receipt_emailed', $order, [], ['email' => $email], $order->order_number);

        return response()->json(['message' => "Receipt sent to {$email}."]);
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
