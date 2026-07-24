<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use App\Models\Concerns\BelongsToBranch;
use Illuminate\Database\Eloquent\Model;

class Setting extends Model
{
    use Auditable, BelongsToBranch;

    protected $fillable = ['key', 'value'];
}
