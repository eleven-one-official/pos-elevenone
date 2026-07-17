<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureUserHasRole
{
    /**
     * Allow the request only when the authenticated user's role slug is one of
     * the listed roles. Usage: ->middleware('role:admin') or 'role:admin,cashier'.
     */
    public function handle(Request $request, Closure $next, string ...$roles): Response
    {
        $slug = $request->user()?->role?->slug;

        abort_unless(
            $slug !== null && in_array($slug, $roles, true),
            403,
            'You do not have permission to perform this action.'
        );

        return $next($request);
    }
}
