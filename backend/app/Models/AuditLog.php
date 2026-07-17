<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Auth;

class AuditLog extends Model
{
    /** Rows are immutable — written once, never touched again. */
    public $timestamps = false;

    protected $fillable = [
        'user_id',
        'user_name',
        'event',
        'auditable_type',
        'auditable_id',
        'label',
        'old_values',
        'new_values',
        'ip_address',
        'user_agent',
        'created_at',
    ];

    protected function casts(): array
    {
        return [
            'old_values' => 'array',
            'new_values' => 'array',
            'created_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * Write one audit row. Never lets an audit failure break the POS action
     * being audited — a failed insert is reported to the log instead.
     * Skipped in console runs (migrations/seeders would flood the trail).
     */
    public static function record(
        string $event,
        ?Model $subject = null,
        array $old = [],
        array $new = [],
        ?string $label = null,
        ?User $user = null,
    ): void {
        if (app()->runningInConsole() && ! app()->runningUnitTests()) {
            return;
        }

        try {
            $user ??= Auth::user();

            static::create([
                'user_id' => $user?->id,
                'user_name' => $user?->name,
                'event' => $event,
                'auditable_type' => $subject?->getMorphClass(),
                'auditable_id' => $subject?->getKey(),
                'label' => $label,
                'old_values' => $old ?: null,
                'new_values' => $new ?: null,
                'ip_address' => request()?->ip(),
                'user_agent' => (string) request()?->userAgent() ?: null,
                'created_at' => now(),
            ]);
        } catch (\Throwable $e) {
            report($e);
        }
    }
}
