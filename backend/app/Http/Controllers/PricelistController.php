<?php

namespace App\Http\Controllers;

use App\Models\Pricelist;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class PricelistController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = Pricelist::query()->with('rules.menuItem:id,name')->orderBy('name');

        if ($request->filled('search')) {
            $query->where('name', 'like', '%'.$request->string('search').'%');
        }

        return response()->json($query->get());
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validated($request);

        $pricelist = DB::transaction(function () use ($data) {
            $pricelist = Pricelist::create($data);
            $pricelist->rules()->createMany(self::normalizeRules($data['rules'] ?? []));

            return $pricelist;
        });

        return response()->json($pricelist->load('rules.menuItem:id,name'), 201);
    }

    public function show(Pricelist $pricelist): JsonResponse
    {
        return response()->json($pricelist->load('rules.menuItem:id,name'));
    }

    public function update(Request $request, Pricelist $pricelist): JsonResponse
    {
        $data = $this->validated($request);

        DB::transaction(function () use ($data, $pricelist) {
            $pricelist->update($data);

            // The form always submits the full rule set, so replace wholesale.
            if (array_key_exists('rules', $data)) {
                $pricelist->rules()->delete();
                $pricelist->rules()->createMany(self::normalizeRules($data['rules']));
            }
        });

        return response()->json($pricelist->load('rules.menuItem:id,name'));
    }

    public function destroy(Pricelist $pricelist): JsonResponse
    {
        $pricelist->delete(); // rules cascade

        return response()->json(['message' => 'Pricelist deleted.']);
    }

    /**
     * Fill rule defaults so optional fields never reach non-nullable columns.
     *
     * @param  array<int, array<string, mixed>>  $rules
     * @return array<int, array<string, mixed>>
     */
    private static function normalizeRules(array $rules): array
    {
        return array_map(fn (array $rule) => [
            'menu_item_id' => $rule['menu_item_id'] ?? null,
            'min_quantity' => $rule['min_quantity'] ?? 1,
            'fixed_price' => $rule['fixed_price'],
            'date_start' => $rule['date_start'] ?? null,
            'date_end' => $rule['date_end'] ?? null,
        ], $rules);
    }

    /** @return array<string, mixed> */
    private function validated(Request $request): array
    {
        return $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'currency' => ['required', 'in:USD,KHR'],
            'discount_policy' => ['nullable', 'in:included,public'],
            'rules' => ['sometimes', 'array'],
            // menu_item_id null = the rule prices all products.
            'rules.*.menu_item_id' => ['nullable', 'exists:menu_items,id'],
            'rules.*.min_quantity' => ['nullable', 'integer', 'min:1'],
            'rules.*.fixed_price' => ['required', 'numeric', 'min:0'],
            'rules.*.date_start' => ['nullable', 'date'],
            'rules.*.date_end' => ['nullable', 'date', 'after_or_equal:rules.*.date_start'],
        ]);
    }
}
