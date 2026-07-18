<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Pricelist extends Model
{
    use Auditable;

    protected $fillable = [
        'name',
        'currency',
        'discount_policy',
    ];

    public function rules(): HasMany
    {
        return $this->hasMany(PricelistRule::class);
    }
}
