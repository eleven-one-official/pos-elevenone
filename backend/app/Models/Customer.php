<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;

class Customer extends Model
{
    use Auditable;

    protected $fillable = ['name', 'phone', 'email', 'note'];
}
