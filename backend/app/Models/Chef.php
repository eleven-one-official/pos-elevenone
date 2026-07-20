<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Chef extends Model
{
    use Auditable;

    protected $fillable = ['name', 'is_active', 'sort_order'];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
        ];
    }

    /**
     * Orders this cook picked up (tapped "Start" on) at the kitchen display.
     */
    public function orders(): HasMany
    {
        return $this->hasMany(Order::class);
    }
}
