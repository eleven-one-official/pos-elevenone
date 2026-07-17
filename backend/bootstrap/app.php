<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // API-only app: there is no login page to redirect guests to. Returning
        // null (instead of the framework default route('login')) lets the
        // exception handler answer 401 JSON rather than crash with
        // "Route [login] not defined".
        $middleware->redirectGuestsTo(fn () => null);

        // Route-level role checks, e.g. ->middleware('role:admin,manager').
        $middleware->alias([
            'role' => \App\Http\Middleware\EnsureUserHasRole::class,
        ]);

        // Caddy terminates TLS on this machine and proxies over loopback
        // (artisan serve binds 127.0.0.1 only, so nothing else can reach it).
        // Trusting it lets request()->ip() — and the audit log — record the
        // tablet's real LAN address from X-Forwarded-For.
        $middleware->trustProxies(at: '127.0.0.1');
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        // API-only app: always answer api/* requests with JSON (401 instead of
        // redirecting to a nonexistent "login" route when unauthenticated).
        $exceptions->shouldRenderJsonWhen(
            fn ($request, $e) => $request->is('api/*') || $request->expectsJson()
        );
    })->create();
