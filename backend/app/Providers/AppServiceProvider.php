<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // Login throttles. The whole venue sits behind ONE public IP, so a
        // plain per-IP cap gave every terminal a shared 10-attempts-a-minute
        // budget — a couple of typos on one till 429'd the admin's sign-in
        // (seen in prod 2026-07-24). The tight limit is therefore keyed by
        // account+IP: brute forcing one account is still slow, but unrelated
        // sign-ins never collide. The looser per-IP limit stays as a backstop
        // against spraying many accounts from a single address.
        RateLimiter::for('login', function (Request $request) {
            $username = mb_strtolower(trim((string) $request->input('username')));

            return [
                Limit::perMinute(10)->by('login:u:'.$username.'|'.$request->ip()),
                Limit::perMinute(30)->by('login:ip:'.$request->ip()),
            ];
        });

        RateLimiter::for('staff-login', function (Request $request) {
            return [
                Limit::perMinute(10)->by('staff:u:'.(int) $request->input('user_id').'|'.$request->ip()),
                Limit::perMinute(60)->by('staff:ip:'.$request->ip()),
            ];
        });
    }
}
