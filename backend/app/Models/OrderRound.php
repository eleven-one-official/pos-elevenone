<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * One batch of an order fired to the people who make it. A bill gains a round
 * every time the table orders again, and each round is its own ticket on a
 * display — same table, own maker, own clock.
 *
 * A send is also split by *station*: the food goes to the kitchen and the
 * drinks to the bar, as two rounds sharing one round number. Both boards
 * therefore call the table's second fire "R2", and neither shows the other's
 * lines.
 */
class OrderRound extends Model
{
    /** Rounds a station still has work on — what its display board pulls. */
    public const OPEN_STATUSES = ['new', 'preparing'];

    /** Where a round is made. Products in the "drink" category go to the bar. */
    public const STATION_KITCHEN = 'kitchen';
    public const STATION_BAR = 'bar';
    public const STATIONS = [self::STATION_KITCHEN, self::STATION_BAR];

    protected $fillable = [
        'order_id',
        'round_no',
        'station',
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
