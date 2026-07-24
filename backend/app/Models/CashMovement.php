<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use App\Models\Concerns\BelongsToBranch;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CashMovement extends Model
{
    use Auditable, BelongsToBranch;

    protected $fillable = [
        'user_id',
        'type',
        'amount',
        'reason',
        'business_date',
    ];

    protected function casts(): array
    {
        return [
            'amount' => 'decimal:2',
            'business_date' => 'date:Y-m-d',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
