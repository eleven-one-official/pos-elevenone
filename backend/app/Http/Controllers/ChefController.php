<?php

namespace App\Http\Controllers;

use App\Models\Chef;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ChefController extends Controller
{
    /**
     * List cooks; ?active=1 for just the ones the kitchen display should offer
     * in its "who's cooking?" picker. Any signed-in role reads (the display
     * runs on the shared kitchen token). Writes are back-office only (routes).
     */
    public function index(Request $request): JsonResponse
    {
        $query = Chef::query()->orderBy('sort_order')->orderBy('name');

        if ($request->has('active')) {
            $query->where('is_active', $request->boolean('active'));
        }

        return response()->json($query->get());
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'is_active' => ['boolean'],
            'sort_order' => ['nullable', 'integer'],
        ]);

        // The column is NOT NULL — an omitted sequence lands at the end.
        $data['sort_order'] ??= ((int) Chef::max('sort_order')) + 1;

        return response()->json(Chef::create($data), 201);
    }

    public function show(Chef $chef): JsonResponse
    {
        return response()->json($chef);
    }

    public function update(Request $request, Chef $chef): JsonResponse
    {
        $data = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:255'],
            'is_active' => ['boolean'],
            'sort_order' => ['nullable', 'integer'],
        ]);

        // NOT NULL column — clearing the sequence keeps the current position.
        if (array_key_exists('sort_order', $data) && $data['sort_order'] === null) {
            unset($data['sort_order']);
        }

        $chef->update($data);

        return response()->json($chef);
    }

    public function destroy(Chef $chef): JsonResponse
    {
        // Orders keep their history — the FK nulls out (nullOnDelete), so past
        // KPI rows for a removed cook just fold into "Unknown".
        $chef->delete();

        return response()->json(['message' => 'Chef deleted.']);
    }
}
