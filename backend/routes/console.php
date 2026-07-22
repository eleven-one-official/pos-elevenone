<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// Tokens expire after config('sanctum.expiration') minutes; this clears the
// stale rows out of personal_access_tokens.
Schedule::command('sanctum:prune-expired --hours=24')->daily();

// Keep six months of audit trail.
Schedule::call(fn () => \App\Models\AuditLog::where('created_at', '<', now()->subDays(180))->delete())
    ->daily()
    ->name('prune-audit-logs');

// One gzipped database dump a night, then prune anything past the retention
// window (config('backup.retention_days')). Admins still keep their own
// off-server copy by downloading from the Backup page daily.
Schedule::command('backup:run')->dailyAt('02:00')->name('daily-db-backup');
