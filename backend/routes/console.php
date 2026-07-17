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
