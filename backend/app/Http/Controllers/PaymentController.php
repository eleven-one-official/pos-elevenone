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
            'amount' => ['required', 'numeric', 'min:0'],
            'received' => ['nullable', 'numeric', 'min:0'],
            'reference' => ['nullable', 'string', 'max:255'],
            'complete_order' => ['boolean'],
        ]);

        $payment = DB::transaction(function () use ($data) {
            $order = Order::findOrFail($data['order_id']);

            $received = isset($data['received']) ? (float) $data['received'] : null;
            $change = 0;
            if ($data['method'] === 'cash' && $received !== null) {
                $change = max(0, $received - (float) $data['amount']);
            }

            $payment = Payment::create([
                'order_id' => $order->id,
                'method' => $data['method'],
                'amount' => $data['amount'],
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

        // Quiet update — the dedicated "refund" row below is the audit record.
        $payment->updateQuietly(['status' => 'refunded']);

        AuditLog::record('refund', $payment, ['status' => 'paid'], [
            'status' => 'refunded',
            'method' => $payment->method,
            'amount' => (float) $payment->amount,
            'reason' => $data['reason'] ?? null,
        ], $payment->order?->order_number);

        return response()->json($payment->load('order'));
    }

    public function destroy(Payment $payment): JsonResponse
    {
        $payment->delete();

        return response()->json(['message' => 'Payment deleted.']);
    }
}
