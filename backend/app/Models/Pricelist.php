<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Pricelist extends Model
{
    use Auditable;

    protected $fillable = [
        'name',
        'currency',
        'discount_policy',
    ];

    public function rules(): HasMany
    {
        return $this->hasMany(PricelistRule::class);
    }

    /**
     * The unit price this pricelist gives a menu item at a quantity, in USD.
     * Product-specific rules beat catch-all (all-products) rules; among the
     * qualifying rules the highest min_quantity wins, so bigger quantity
     * breaks apply automatically. Rules outside their date range are skipped.
     * KHR pricelists convert at the given riel-per-USD rate so order totals
     * stay in the base currency. Returns null when no rule applies — the
     * caller falls back to the menu price.
     */
    public function priceFor(MenuItem $item, int $quantity, ?float $khrRate = null): ?float
    {
        $today = now()->toDateString();

        $candidates = $this->rules->filter(
            fn (PricelistRule $rule) => ($rule->menu_item_id === null || $rule->menu_item_id === $item->id)
                && $rule->min_quantity <= $quantity
                && ($rule->date_start === null || $rule->date_start->toDateString() <= $today)
                && ($rule->date_end === null || $rule->date_end->toDateString() >= $today),
        );

        if ($candidates->isEmpty()) {
            return null;
        }

        $specific = $candidates->where('menu_item_id', $item->id);
        $rule = ($specific->isNotEmpty() ? $specific : $candidates)
            ->sortByDesc('min_quantity')
            ->first();

        $price = (float) $rule->fixed_price;
        if ($this->currency === 'KHR') {
            $price = round($price / (($khrRate !== null && $khrRate > 0) ? $khrRate : 4100.0), 2);
        }

        return $price;
    }
}
