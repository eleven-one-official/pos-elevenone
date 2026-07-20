<?php

namespace App\Http\Controllers;

use App\Models\Order;
use App\Models\Table;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class TableController extends Controller
{
    /**
     * List tables. Filter by ?type= and ?status=.
     *
     * Each row carries `guest_count` from the table's open order (newest of
     * new/preparing/ready/served, matching the POS's idea of the live bill),
     * or null when the table has no running order.
     */
    public function index(Request $request): JsonResponse
    {
        $query = Table::query()
            // Natural sort: E2 before E10 (plain name sort would put E10 first)
            ->orderByRaw('LENGTH(name), name')
            ->addSelect([
                'guest_count' => Order::select('guest_count')
                    ->whereColumn('table_id', 'tables.id')
                    ->whereIn('status', ['new', 'preparing', 'ready', 'served'])
                    ->latest('id')
                    ->limit(1),
            ]);

        if ($request->filled('type')) {
            $query->where('type', $request->string('type'));
        }

        if ($request->filled('status')) {
            $query->where('status', $request->string('status'));
        }

        return response()->json($query->get());
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255', 'unique:tables,name'],
            'type' => ['required', 'in:normal,vip'],
            'capacity' => ['nullable', 'integer', 'min:1'],
            'status' => ['nullable', 'in:available,occupied,reserved'],
        ]);

        $table = Table::create($data);

        return response()->json($table, 201);
    }

    public function show(Table $table): JsonResponse
    {
        return response()->json($table);
    }

    public function update(Request $request, Table $table): JsonResponse
    {
        $data = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:255', 'unique:tables,name,'.$table->id],
            'type' => ['sometimes', 'required', 'in:normal,vip'],
            'capacity' => ['nullable', 'integer', 'min:1'],
            'status' => ['sometimes', 'required', 'in:available,occupied,reserved'],
        ]);

        $table->update($data);

        return response()->json($table);
    }

    public function destroy(Table $table): JsonResponse
    {
        $table->delete();

        return response()->json(['message' => 'Table deleted.']);
    }
}
