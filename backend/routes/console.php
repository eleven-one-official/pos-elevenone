<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// All maintenance is pinned to midday, not the conventional overnight slot:
// this POS PC is powered off outside working hours and schedule:work does
// not back-fill runs it slept through, so anything scheduled at night
// silently never happens. The explicit timezone matters too — the app runs
// on UTC, so without it "12:00" would mean 19:00 at the restaurant.

// Tokens expire after config('sanctum.expiration') minutes; this clears the
// stale rows out of personal_access_tokens.
Schedule::command('sanctum:prune-expired --hours=24')
    ->dailyAt('12:05')
    ->timezone('Asia/Phnom_Penh');

// Keep six months of audit trail.
Schedule::call(fn () => \App\Models\AuditLog::where('created_at', '<', now()->subDays(180))->delete())
    ->dailyAt('12:10')
    ->timezone('Asia/Phnom_Penh')
    ->name('prune-audit-logs');

// One gzipped database dump a day, then prune anything past the retention
// window (config('backup.retention_days')). Admins still keep their own
// off-server copy by downloading from the Backup page daily.
Schedule::command('backup:run')
    ->dailyAt('12:00')
    ->timezone('Asia/Phnom_Penh')
    ->name('daily-db-backup');
