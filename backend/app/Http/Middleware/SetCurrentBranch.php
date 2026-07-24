<?php

namespace App\Http\Middleware;

use App\Models\Branch;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Resolves which branch this request works in. Every device picks its branch
 * on the login screen (or the admin's top-bar switcher) and sends it as an
 * X-Branch-Id header on every call; BelongsToBranch then scopes all reads and
 * writes to that branch. A request without the header (an old cached bundle,
 * curl) falls back to the first branch, so a stale device keeps trading in
 * TTP instead of erroring out — but a header naming a branch that doesn't
 * exist is refused rather than silently booked onto the wrong shop.
 */
class SetCurrentBranch
{
    /** Container key BelongsToBranch reads the current branch id from. */
    public const CONTAINER_KEY = 'pos.branch_id';

    public function handle(Request $request, Closure $next): Response
    {
        $raw = trim((string) $request->header('X-Branch-Id'));

        if ($raw === '') {
            $id = (int) Branch::query()->min('id');
        } else {
            $id = (int) $raw;
            if ($id <= 0 || ! Branch::whereKey($id)->exists()) {
                return response()->json([
                    'message' => 'Unknown branch — reload the app and pick a branch again.',
                ], 400);
            }
        }

        app()->instance(self::CONTAINER_KEY, $id);

        return $next($request);
    }

    /** The request's branch id — only callable once the middleware has run. */
    public static function id(): int
    {
        return (int) app(self::CONTAINER_KEY);
    }
}
