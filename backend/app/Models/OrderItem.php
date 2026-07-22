<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

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
    ];

    protected function casts(): array
    {
        return [
            'price' => 'decimal:2',
            'quantity' => 'integer',
            'line_total' => 'decimal:2',
            'started_at' => 'datetime',
            'ready_at' => 'datetime',
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
     * Who cooked this dish. Each line is taken and plated on its own at the
     * kitchen display — its cook and its `started_at`/`ready_at` pair are the
     * per-dish clock the Chef Performance KPI reads.
     */
    public function chef(): BelongsTo
    {
        return $this->belongsTo(Chef::class);
    }

    public function menuItem(): BelongsTo
    {
        return $this->belongsTo(MenuItem::class);
    }
}
