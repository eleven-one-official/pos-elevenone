<?php

namespace App\Models\Concerns;

use App\Models\AuditLog;
use Illuminate\Database\Eloquent\Model;

/**
 * Automatically writes an audit_logs row when the model is created, updated
 * or deleted. Secrets (password/PIN/tokens) and timestamp noise are never
 * stored. Models can extend the exclusion list with:
 *
 *     protected array $auditExclude = ['some_column'];
 *
 * Note: query-builder writes (Model::where(...)->update(...)) bypass Eloquent
 * events and are NOT audited — use model instances for changes that matter.
 */
trait Auditable
{
    /** Never persisted into old_values/new_values. */
    private static array $auditAlwaysExclude = [
        'password',
        'pin',
        'remember_token',
        'created_at',
        'updated_at',
    ];

    public static function bootAuditable(): void
    {
        static::created(function (Model $model) {
            AuditLog::record('created', $model, [], $model->auditValues($model->getAttributes()), $model->auditLabel());
        });

        static::updated(function (Model $model) {
            $new = $model->auditValues($model->getChanges());
            if ($new === []) {
                return; // only excluded columns changed — nothing worth a row
            }
            $old = $model->auditValues(array_intersect_key($model->getOriginal(), $new));

            AuditLog::record($model->auditEventForUpdate($new), $model, $old, $new, $model->auditLabel());
        });

        static::deleted(function (Model $model) {
            AuditLog::record('deleted', $model, $model->auditValues($model->getAttributes()), [], $model->auditLabel());
        });
    }

    /**
     * Event name written for an update. Models override this to surface
     * business-level events (e.g. MenuItem price edits log "price_change").
     */
    protected function auditEventForUpdate(array $new): string
    {
        return 'updated';
    }

    /** Strip excluded columns from an attribute set. */
    protected function auditValues(array $attributes): array
    {
        $exclude = array_merge(self::$auditAlwaysExclude, $this->auditExclude ?? []);

        return array_diff_key($attributes, array_flip($exclude));
    }

    /** Human handle shown in the audit list (order number, name, ...). */
    protected function auditLabel(): ?string
    {
        foreach (['order_number', 'name', 'username', 'label', 'key'] as $attribute) {
            $value = $this->getAttribute($attribute);
            if (is_string($value) && $value !== '') {
                return $value;
            }
        }

        return null;
    }
}
