<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use App\Models\Concerns\BelongsToBranch;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Payment extends Model
{
    use Auditable, BelongsToBranch, HasFactory;

    protected $fillable = [
        'order_id',
        'method',
        'payment_method_id',
        'amount',
        'currency',
        'exchange_rate',
        'received',
        'change',
        'reference',
        'status',
        'paid_at',
    ];

    protected function casts(): array
    {
        return [
            'amount' => 'decimal:2',
            'exchange_rate' => 'decimal:2',
            'received' => 'decimal:2',
            'change' => 'decimal:2',
            'paid_at' => 'datetime',
        ];
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    /** The journal (Cash USD, Grab, …) that took the money. */
    public function paymentMethod(): BelongsTo
    {
        return $this->belongsTo(PaymentMethod::class);
    }
}
