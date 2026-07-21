<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Order extends Model
{
    use Auditable, HasFactory;

    protected $fillable = [
        'order_number',
        'order_type',
        'table_id',
        'takeaway_slot',
        'transferred_from_table_id',
        'user_id',
        'chef_id',
        'customer_id',
        'pricelist_id',
        'status',
        'guest_count',
        'subtotal',
        'discount',
        'tax',
        'total',
        'note',
        'started_at',
        'ready_at',
    ];

    protected function casts(): array
    {
        return [
            'guest_count' => 'integer',
            'takeaway_slot' => 'integer',
            'subtotal' => 'decimal:2',
            'discount' => 'decimal:2',
            'tax' => 'decimal:2',
            'total' => 'decimal:2',
            'started_at' => 'datetime',
            'ready_at' => 'datetime',
        ];
    }

    public function table(): BelongsTo
    {
        return $this->belongsTo(Table::class);
    }

    /**
     * The table this bill was opened on, when it has since been transferred
     * elsewhere. Null for an order still sitting where it started.
     */
    public function transferredFrom(): BelongsTo
    {
        return $this->belongsTo(Table::class, 'transferred_from_table_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * The cook who picked this ticket up at the kitchen display (tapped Start).
     */
    public function chef(): BelongsTo
    {
        return $this->belongsTo(Chef::class);
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function pricelist(): BelongsTo
    {
        return $this->belongsTo(Pricelist::class);
    }

    public function items(): HasMany
    {
        return $this->hasMany(OrderItem::class);
    }

    /**
     * The kitchen jobs this bill has fired — one per "Send to Kitchen". Round 1
     * is the first order the table placed, round 2 whatever they added after.
     */
    public function rounds(): HasMany
    {
        return $this->hasMany(OrderRound::class)->orderBy('round_no');
    }

    public function payments(): HasMany
    {
        return $this->hasMany(Payment::class);
    }

    /**
     * Generate the next sequential order number, e.g. ORD-20260714-0001.
     */
    public static function generateOrderNumber(): string
    {
        $date = now()->format('Ymd');
        $prefix = "ORD-{$date}-";

        $lastNumber = static::where('order_number', 'like', $prefix.'%')
            ->orderByDesc('order_number')
            ->value('order_number');

        $sequence = $lastNumber ? ((int) substr($lastNumber, -4)) + 1 : 1;

        return $prefix.str_pad((string) $sequence, 4, '0', STR_PAD_LEFT);
    }

    /**
     * Roll the bill's kitchen status up from its rounds. The bill is only as far
     * along as its least-finished round: one round still waiting keeps the whole
     * order "new", so a table that ordered again is back in the kitchen queue
     * even if its first round was plated an hour ago.
     *
     * Money statuses are never touched — a settled bill is history — and a bill
     * the floor already marked "served" doesn't slide back to "ready" just
     * because its rounds are all done.
     */
    public function syncStatusFromRounds(): void
    {
        if (in_array($this->status, ['completed', 'cancelled', 'refunded'], true)) {
            return;
        }

        $rounds = $this->rounds()->get();
        if ($rounds->isEmpty()) {
            return;
        }

        $next = match (true) {
            $rounds->contains('status', 'new') => 'new',
            $rounds->contains('status', 'preparing') => 'preparing',
            default => 'ready',
        };

        if (! ($next === 'ready' && $this->status === 'served')) {
            $this->status = $next;
        }

        // Order-level KPI stamps stay meaningful across rounds: when the kitchen
        // first picked this bill up, and when the last round left the pass.
        $this->started_at = $rounds->whereNotNull('started_at')->min('started_at');
        $this->ready_at = $next === 'ready' ? $rounds->max('ready_at') : null;
        // The bill shows the cook of the round still in hand, so the floor can
        // ask the right person; falls back to whoever cooked last.
        $this->chef_id = $rounds->firstWhere('status', 'preparing')?->chef_id
            ?? $rounds->whereNotNull('chef_id')->last()?->chef_id;

        $this->save();
    }

    /**
     * Recalculate subtotal/total from the current line items.
     */
    public function recalculateTotals(): void
    {
        $subtotal = $this->items()->sum('line_total');
        $this->subtotal = $subtotal;
        $this->total = max(0, $subtotal - (float) $this->discount + (float) $this->tax);
        $this->save();
    }
}
