<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * One shop of the venue (ElevenOne TTP, ElevenOne BKK). Every data row hangs
 * off exactly one branch via BelongsToBranch; which branch a request works in
 * comes from its X-Branch-Id header (see SetCurrentBranch).
 */
class Branch extends Model
{
    protected $fillable = ['name'];
}
