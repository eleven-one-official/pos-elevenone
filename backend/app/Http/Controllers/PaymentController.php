<?php

namespace App\Http\Controllers;

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

            if ($completeOrder && $paidTotal >= (float) $order->total) {
                $order->update(['status' => 'completed']);

                if ($order->table_id) {
                    Table::whereKey($order->table_id)->update(['status' => 'available']);
                }
            }

            return $payment;
        });

        return response()->json($payment->load('order'), 201);
    }

    public function show(Payment $payment): JsonResponse
    {
        return response()->json($payment->load('order'));
    }

    public function destroy(Payment $payment): JsonResponse
    {
        $payment->delete();

        return response()->json(['message' => 'Payment deleted.']);
    }
}
