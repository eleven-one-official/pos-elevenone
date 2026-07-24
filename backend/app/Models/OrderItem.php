<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class OrderItem extends Model
{
    protected $fillable = [
        'order_id',
        'order_round_id',
        'menu_item_id',
        'name',
        'price',
        'quantity',
        'note',
        'line_total',
        'chef_id',
        'started_at',
        'ready_at',
        'cancelled_at',
    ];

    protected function casts(): array
    {
        return [
            'price' => 'decimal:2',
            'quantity' => 'integer',
            'line_total' => 'decimal:2',
            'started_at' => 'datetime',
            'ready_at' => 'datetime',
            'cancelled_at' => 'datetime',
        ];
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    /** The kitchen round that fired this line. */
    public function round(): BelongsTo
    {
        return $this->belongsTo(OrderRound::class, 'order_round_id');
    }

    /**
     * The lead cook on this dish — the first name ticked when it was taken.
     * Each line is taken and plated on its own at the kitchen display — its
     * cooks and its `started_at`/`ready_at` pair are the per-dish clock the
     * Chef Performance KPI reads; `chefs()` is everyone who worked on it.
     */
    public function chef(): BelongsTo
    {
        return $this->belongsTo(Chef::class);
    }

    /**
     * Everyone cooking this dish. A single plate can pass through two sections
     * — fried then grilled — so the picker lets the kitchen tick more than one
     * name, and the KPI credits the dish to each of them.
     */
    public function chefs(): BelongsToMany
    {
        return $this->belongsToMany(Chef::class, 'order_item_chef')->withTimestamps();
    }

    /**
     * Record who is cooking this dish. The first name given leads (that is
     * what `chef_id` keeps and what single-cook reads show); an empty list
     * leaves the current crew alone, so a later "Ready" tap never wipes the
     * attribution.
     *
     * @param  array<int, int>  $chefIds
     */
    public function assignChefs(array $chefIds): void
    {
        $ids = array_values(array_unique(array_map('intval', $chefIds)));
        if ($ids === []) {
            return;
        }

        $this->chefs()->sync($ids);
        $this->chef_id = $ids[0];
        $this->setRelation('chefs', Chef::whereIn('id', $ids)->get());
    }

    public function menuItem(): BelongsTo
    {
        return $this->belongsTo(MenuItem::class);
    }
}
