<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * One batch of dishes fired to the kitchen. A bill gains a round every time the
 * table orders again, and each round is its own ticket on the kitchen display —
 * same table, own cook, own clock.
 */
class OrderRound extends Model
{
    /** Rounds the kitchen still has work on — what the display board pulls. */
    public const OPEN_STATUSES = ['new', 'preparing'];

    protected $fillable = [
        'order_id',
        'round_no',
        'status',
        'chef_id',
        'started_at',
        'ready_at',
    ];

    protected function casts(): array
    {
        return [
            'round_no' => 'integer',
            'started_at' => 'datetime',
            'ready_at' => 'datetime',
        ];
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    /** The cook who tapped "Start" on this ticket. */
    public function chef(): BelongsTo
    {
        return $this->belongsTo(Chef::class);
    }

    public function items(): HasMany
    {
        return $this->hasMany(OrderItem::class);
    }
}
