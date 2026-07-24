<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use App\Models\Concerns\BelongsToBranch;
use Illuminate\Database\Eloquent\Model;

class PaymentMethod extends Model
{
    use Auditable, BelongsToBranch;

    protected $fillable = ['label', 'channel', 'is_active', 'sort_order'];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
        ];
    }
}
