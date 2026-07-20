<?php

namespace App\Http\Controllers;

use App\Models\AuditLog;
use App\Models\Order;
use App\Models\Payment;
use App\Models\Table;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class PaymentController extends Controller
{
    /**
     * List payments. Filter by ?order_id= and ?date=YYYY-MM-DD.
     */
    public function index(Request $request): JsonResponse
    {
        $query = Payment::query()->with('order')->latest();

        if ($request->filled('order_id')) {
            $query->where('order_id', $request->integer('order_id'));
        }

        if ($request->filled('date')) {
            $query->whereDate('created_at', $request->date('date'));
        }

        return response()->json($query->get());
    }

    /**
     * Record a payment against an order. Completes the order once fully paid.
     */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'order_id' => ['required', 'exists:orders,id'],
            'method' => ['required', 'in:cash,aba_qr,khqr,card'],
            // The journal (Cash USD, Cash KHR, Grab, …) behind the channel.
            'payment_method_id' => ['nullable', 'exists:payment_methods,id'],
            // `amount` is ALWAYS in USD (the base currency every report sums);
            // currency + exchange_rate record what the guest actually tendered.
            'amount' => ['required', 'numeric', 'min:0'],
            'currency' => ['nullable', 'in:USD,KHR'],
            'exchange_rate' => ['nullable', 'numeric', 'min:1', 'required_if:currency,KHR'],
            'received' => ['nullable', 'numeric', 'min:0'],
            'reference' => ['nullable', 'string', 'max:255'],
            'complete_order' => ['boolean'],
        ]);

        $order = Order::findOrFail($data['order_id']);

        // A closed bill takes no more money — this blocks double charges from
        // a retried request or a second terminal settling the same order.
        if (in_array($order->status, ['completed', 'cancelled', 'refunded'], true)) {
            return response()->json([
                'message' => "This order is already {$order->status} — no further payment can be taken.",
            ], 422);
        }

        $alreadyPaid = (float) $order->payments()->where('status', 'paid')->sum('amount');
        if ((float) $order->total > 0 && $alreadyPaid >= (float) $order->total) {
            return response()->json(['message' => 'This order is already fully paid.'], 422);
        }

        $payment = DB::transaction(function () use ($data, $order) {
            $received = isset($data['received']) ? (float) $data['received'] : null;
            $change = 0;
            if ($data['method'] === 'cash' && $received !== null) {
                $change = max(0, $received - (float) $data['amount']);
            }

            $payment = Payment::create([
                'order_id' => $order->id,
                'method' => $data['method'],
                'payment_method_id' => $data['payment_method_id'] ?? null,
                'amount' => $data['amount'],
                'currency' => $data['currency'] ?? 'USD',
                'exchange_rate' => $data['exchange_rate'] ?? null,
                'received' => $received,
                'change' => $change,
                'reference' => $data['reference'] ?? null,
                'status' => 'paid',
                'paid_at' => now(),
            ]);

            // Complete the order once total payments cover the order total.
            $completeOrder = $data['complete_order'] ?? true;
            $paidTotal = (float) $order->payments()->where('status', 'paid')->sum('amount');
            $completed = $completeOrder && $paidTotal >= (float) $order->total;

            if ($completed) {
                $order->update(['status' => 'completed']);

                if ($order->table_id) {
                    Table::whereKey($order->table_id)->update(['status' => 'available']);
                }
            }

            // Business-level trail row on top of the generic Payment "created".
            AuditLog::record('sale', $order, [], [
                'method' => $payment->method,
                'amount' => (float) $payment->amount,
                'paid_total' => $paidTotal,
                'order_total' => (float) $order->total,
                'order_completed' => $completed,
            ], $order->order_number);

            return $payment;
        });

        return response()->json($payment->load('order'), 201);
    }

    public function show(Payment $payment): JsonResponse
    {
        return response()->json($payment->load('order'));
    }

    /**
     * Mark a paid payment as refunded. The money trail stays intact: the row
     * keeps its amount and flips to refunded, and the refund itself lands in
     * the audit log with the reason given.
     */
    public function refund(Request $request, Payment $payment): JsonResponse
    {
        $data = $request->validate([
            'reason' => ['nullable', 'string', 'max:255'],
        ]);

        if ($payment->status !== 'paid') {
            return response()->json(['message' => 'Only paid payments can be refunded.'], 422);
        }

        DB::transaction(function () use ($payment, $data) {
            // Quiet update — the dedicated "refund" row below is the audit record.
            $payment->updateQuietly(['status' => 'refunded']);

            // Once no live money remains on the bill, take the order out of
            // the sales figures too — otherwise dashboards and daily sales
            // keep counting revenue that was handed back to the guest.
            $order = $payment->order;
            if ($order && $order->status === 'completed' && ! $order->payments()->where('status', 'paid')->exists()) {
                $order->update(['status' => 'refunded']);
            }

            AuditLog::record('refund', $payment, ['status' => 'paid'], [
                'status' => 'refunded',
                'method' => $payment->method,
                'amount' => (float) $payment->amount,
                'reason' => $data['reason'] ?? null,
                'order_status' => $order?->status,
            ], $order?->order_number);
        });

        return response()->json($payment->load('order'));
    }

    public function destroy(Payment $payment): JsonResponse
    {
        $payment->delete();

        return response()->json(['message' => 'Payment deleted.']);
    }
}
