<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
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

    /**
     * The lead cook — the first name picked when the ticket was taken. The bill
     * rolls up to this one so the floor has a single person to ask about a
     * table; `chefs()` is who actually worked on it.
     */
    public function chef(): BelongsTo
    {
        return $this->belongsTo(Chef::class);
    }

    /**
     * Everyone cooking this ticket. One card often holds dishes from two
     * sections, so the kitchen display lets the cooks tick more than one name —
     * and the Chef Performance KPI credits the ticket to each of them.
     */
    public function chefs(): BelongsToMany
    {
        return $this->belongsToMany(Chef::class, 'order_round_chef')->withTimestamps();
    }

    /**
     * Record who is cooking this ticket. The first name given leads (that is
     * what the bill shows); an empty list leaves the current crew alone, so a
     * later "Ready" tap never wipes the attribution.
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

    public function items(): HasMany
    {
        return $this->hasMany(OrderItem::class);
    }

    /**
     * Roll the ticket up from its dishes. The kitchen now works the card line
     * by line — each dish is taken (named to a cook) and plated on its own —
     * so the round no longer has taps of its own there; it follows: preparing
     * once any dish is started, ready once every dish is, its crew everyone
     * who cooked a line (the first to start leads), its stamps the first
     * start and the last plate. Keeps the bill's roll-up in step too.
     */
    public function syncFromItems(): void
    {
        // Zero-quantity lines are edits' leftovers — nothing to cook, so they
        // must not hold the ticket open.
        $all = $this->items()->where('quantity', '>', 0)->with('chefs:chefs.id')->get();
        if ($all->isEmpty()) {
            return;
        }

        // A struck dish ("can't make this") is out of the ticket's work: it
        // holds nothing open and names no cook. A card whose every dish is
        // struck has nothing left to make, so it leaves the board — as
        // `cancelled`, not `ready`: nothing was plated, so it belongs in
        // neither the history drawer nor the chef KPI.
        $items = $all->whereNull('cancelled_at');
        if ($items->isEmpty()) {
            $this->status = 'cancelled';
            $this->save();
            $this->order?->syncStatusFromRounds();

            return;
        }

        $started = $items->whereNotNull('started_at')->sortBy('started_at');

        // The ticket's crew is everyone on any of its dishes — a dish itself
        // can be shared now — in the order the dishes were started, each dish's
        // own lead first, so the first dish's lead leads the ticket too.
        $crew = [];
        foreach ($started as $line) {
            $ids = $line->chefs->pluck('id')->all();
            if ($line->chef_id !== null) {
                array_unshift($ids, (int) $line->chef_id);
            }
            foreach ($ids as $id) {
                $crew[$id] = true;
            }
        }
        $this->assignChefs(array_keys($crew));

        if ($this->started_at === null) {
            $this->started_at = $started->first()?->started_at;
        }

        if ($items->whereNull('ready_at')->isEmpty()) {
            $this->status = 'ready';
            if ($this->ready_at === null) {
                $this->ready_at = $items->max('ready_at');
            }
        } elseif ($started->isNotEmpty()) {
            $this->status = 'preparing';
        }

        $this->save();
        $this->order?->syncStatusFromRounds();
    }
}
