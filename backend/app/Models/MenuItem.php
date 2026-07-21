<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class MenuItem extends Model
{
    use Auditable, HasFactory;

    protected $fillable = [
        'category_id',
        'product_type',
        'name',
        'slug',
        'description',
        'price',
        'cost',
        'image',
        'barcode',
        'internal_reference',
        'internal_notes',
        'is_available',
        'can_be_sold',
        'can_be_purchased',
        'is_archived',
        'sort_order',
    ];

    protected function casts(): array
    {
        return [
            'price' => 'decimal:2',
            'cost' => 'decimal:2',
            'is_available' => 'boolean',
            'can_be_sold' => 'boolean',
            'can_be_purchased' => 'boolean',
            'is_archived' => 'boolean',
            'sort_order' => 'integer',
        ];
    }

    /** Price edits surface in the audit trail as their own event. */
    protected function auditEventForUpdate(array $new): string
    {
        return array_key_exists('price', $new) ? 'price_change' : 'updated';
    }

    public function category(): BelongsTo
    {
        return $this->belongsTo(Category::class);
    }

    /**
     * Which station makes this product: anything in the "drink" category is
     * poured at the bar, everything else is cooked in the kitchen. Routing is
     * read off the category rather than stored per product, so moving an item
     * between Food and Drink moves it between the two display boards too.
     */
    public function station(): string
    {
        return $this->category?->slug === Category::DRINK_SLUG
            ? OrderRound::STATION_BAR
            : OrderRound::STATION_KITCHEN;
    }

    public function orderItems(): HasMany
    {
        return $this->hasMany(OrderItem::class);
    }
}
