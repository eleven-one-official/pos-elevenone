<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use App\Models\Concerns\BelongsToBranch;
use Illuminate\Database\Eloquent\Model;

class Customer extends Model
{
    use Auditable, BelongsToBranch;

    protected $fillable = ['name', 'phone', 'email', 'note'];
}
