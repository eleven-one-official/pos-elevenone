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
