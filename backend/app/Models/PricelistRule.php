<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PricelistRule extends Model
{
    protected $fillable = [
        'pricelist_id',
        'menu_item_id',
        'min_quantity',
        'fixed_price',
        'date_start',
        'date_end',
    ];

    protected function casts(): array
    {
        return [
            'min_quantity' => 'integer',
            'fixed_price' => 'decimal:2',
            'date_start' => 'date:Y-m-d',
            'date_end' => 'date:Y-m-d',
        ];
    }

    public function pricelist(): BelongsTo
    {
        return $this->belongsTo(Pricelist::class);
    }

    public function menuItem(): BelongsTo
    {
        return $this->belongsTo(MenuItem::class);
    }
}
