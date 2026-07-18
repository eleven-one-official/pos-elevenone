<?php

namespace App\Http\Controllers;

use App\Models\PaymentMethod;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PaymentMethodController extends Controller
{
    /** Editing the venue's payment journals is admin-only. */
    private function authorizeAdmin(Request $request): void
    {
        abort_unless($request->user()?->hasRole('admin'), 403, 'Only admins can manage payment methods.');
    }

    /** List journals; ?active=1 for just the ones the POS should show. Any authed user reads. */
    public function index(Request $request): JsonResponse
    {
        $query = PaymentMethod::query()->orderBy('sort_order')->orderBy('id');

        if ($request->has('active')) {
            $query->where('is_active', $request->boolean('active'));
        }

        return response()->json($query->get());
    }

    public function store(Request $request): JsonResponse
    {
        $this->authorizeAdmin($request);

        $data = $request->validate([
            'label' => ['required', 'string', 'max:255'],
            'channel' => ['required', 'in:cash,aba_qr,khqr,card'],
            'is_active' => ['boolean'],
            'sort_order' => ['nullable', 'integer'],
        ]);

        // The column is NOT NULL — an omitted sequence lands at the end.
        $data['sort_order'] ??= ((int) PaymentMethod::max('sort_order')) + 1;

        return response()->json(PaymentMethod::create($data), 201);
    }

    public function show(PaymentMethod $paymentMethod): JsonResponse
    {
        return response()->json($paymentMethod);
    }

    public function update(Request $request, PaymentMethod $paymentMethod): JsonResponse
    {
        $this->authorizeAdmin($request);

        $data = $request->validate([
            'label' => ['sometimes', 'required', 'string', 'max:255'],
            'channel' => ['sometimes', 'required', 'in:cash,aba_qr,khqr,card'],
            'is_active' => ['boolean'],
            'sort_order' => ['nullable', 'integer'],
        ]);

        // NOT NULL column — clearing the sequence keeps the current position.
        if (array_key_exists('sort_order', $data) && $data['sort_order'] === null) {
            unset($data['sort_order']);
        }

        $paymentMethod->update($data);

        return response()->json($paymentMethod);
    }

    public function destroy(Request $request, PaymentMethod $paymentMethod): JsonResponse
    {
        $this->authorizeAdmin($request);

        $paymentMethod->delete();

        return response()->json(['message' => 'Payment method deleted.']);
    }
}
