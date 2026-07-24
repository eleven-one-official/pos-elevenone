<?php

namespace App\Models\Concerns;

use App\Http\Middleware\SetCurrentBranch;
use App\Models\Branch;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Pins a model's rows to the request's branch (see SetCurrentBranch): every
 * query only sees the current branch's rows — route-model binding included,
 * so a cross-branch id 404s — and new rows are stamped with the branch.
 *
 * Console runs (migrations, seeders, backups) carry no request branch and
 * stay unscoped; rows created there land on branch 1 via the column default.
 * The where is table-qualified so scoped queries survive joins.
 */
trait BelongsToBranch
{
    public static function bootBelongsToBranch(): void
    {
        static::addGlobalScope('branch', function (Builder $builder) {
            if (app()->bound(SetCurrentBranch::CONTAINER_KEY)) {
                $builder->where(
                    $builder->getModel()->getTable().'.branch_id',
                    SetCurrentBranch::id(),
                );
            }
        });

        static::creating(function (Model $model) {
            if ($model->getAttribute('branch_id') === null && app()->bound(SetCurrentBranch::CONTAINER_KEY)) {
                $model->setAttribute('branch_id', SetCurrentBranch::id());
            }
        });
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }
}
