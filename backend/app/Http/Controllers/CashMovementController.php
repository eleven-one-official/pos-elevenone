<?php

namespace App\Http\Controllers;

use App\Models\CashMovement;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CashMovementController extends Controller
{
    /**
     * The drawer log for one business day (?date=YYYY-MM-DD, default today).
     * Every terminal reads the same list, so Cash In/Out stays consistent
     * across registers.
     */
    public function index(Request $request): JsonResponse
    {
        $date = $request->filled('date') ? $request->date('date') : now();

        $movements = CashMovement::query()
            ->with('user:id,name')
            ->whereDate('business_date', $date)
            ->orderBy('id')
            ->get();

        return response()->json($movements);
    }

    /**
     * Record money added to or taken from the drawer. The Auditable model
     * writes the audit-trail row.
     */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'type' => ['required', 'in:in,out'],
            'amount' => ['required', 'numeric', 'min:0.01', 'max:99999.99'],
            'reason' => ['required', 'string', 'max:255'],
        ]);

        $movement = CashMovement::create([
            'user_id' => $request->user()?->id,
            'type' => $data['type'],
            'amount' => $data['amount'],
            'reason' => $data['reason'],
            'business_date' => now()->toDateString(),
        ]);

        return response()->json($movement->load('user:id,name'), 201);
    }
}
