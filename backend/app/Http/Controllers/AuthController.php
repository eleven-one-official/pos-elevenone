<?php

namespace App\Http\Controllers;

use App\Models\AuditLog;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    /**
     * Authenticate a user by username + password and issue an API token.
     */
    public function login(Request $request): JsonResponse
    {
        $credentials = $request->validate([
            'username' => ['required', 'string'],
            'password' => ['required', 'string'],
        ]);

        $user = User::where('username', $credentials['username'])->first();

        if (! $user || ! Hash::check($credentials['password'], $user->password)) {
            AuditLog::record('login_failed', $user, [], [
                'username' => $credentials['username'],
                'method' => 'password',
            ], $credentials['username']);

            throw ValidationException::withMessages([
                'username' => ['The provided credentials are incorrect.'],
            ]);
        }

        if (! $user->is_active) {
            AuditLog::record('login_failed', $user, [], [
                'username' => $credentials['username'],
                'method' => 'password',
                'reason' => 'account disabled',
            ], $credentials['username']);

            throw ValidationException::withMessages([
                'username' => ['This account is disabled.'],
            ]);
        }

        $token = $user->createToken('pos-token')->plainTextToken;

        AuditLog::record('login', $user, [], ['method' => 'password'], $user->username, $user);

        return response()->json([
            'token' => $token,
            'user' => $user->load('role'),
        ]);
    }

    /**
     * Public login roster for the tap-a-name POS/tablet screen. Waiters sign in
     * with a single tap (no PIN); other staff appear only when a PIN is set.
     * Never returns passwords, emails, or the PIN hash. Filter by role slug
     * with ?role=waiter|cashier|...
     */
    public function staffRoster(Request $request): JsonResponse
    {
        $query = User::query()
            ->where('is_active', true)
            ->where(function ($q) {
                $q->whereNotNull('pin')
                    ->orWhereHas('role', fn ($r) => $r->where('slug', 'waiter'));
            })
            ->with('role:id,name,slug')
            ->orderBy('name');

        if ($request->filled('role')) {
            $slug = (string) $request->string('role');
            $query->whereHas('role', fn ($q) => $q->where('slug', $slug));
        }

        $staff = $query->get(['id', 'name', 'username', 'role_id', 'pin'])->map(fn (User $u) => [
            'id' => $u->id,
            'name' => $u->name,
            'username' => $u->username,
            'role' => $u->role?->slug,
            'role_name' => $u->role?->name,
            'requires_pin' => $u->pin !== null,
        ]);

        return response()->json($staff);
    }

    /**
     * Authenticate a staff member by user id + PIN and issue an API token.
     * The frontend gets the id by first tapping a name from staffRoster().
     */
    public function staffLogin(Request $request): JsonResponse
    {
        $credentials = $request->validate([
            'user_id' => ['required', 'integer', 'exists:users,id'],
            'pin' => ['nullable', 'string'],
        ]);

        $user = User::with('role')->find($credentials['user_id']);

        if (! $user) {
            throw ValidationException::withMessages([
                'pin' => ['The PIN is incorrect.'],
            ]);
        }

        if ($user->pin !== null) {
            // One generic message whether the PIN is missing or wrong, so we
            // don't reveal which staff have PIN login enabled.
            if (! Hash::check((string) ($credentials['pin'] ?? ''), $user->pin)) {
                AuditLog::record('login_failed', $user, [], ['method' => 'pin'], $user->username);

                throw ValidationException::withMessages([
                    'pin' => ['The PIN is incorrect.'],
                ]);
            }
        } elseif ($user->role?->slug !== 'waiter') {
            // PIN-less tap login is reserved for waiters; password accounts
            // (admin, back-office cashier) must go through /login instead.
            AuditLog::record('login_failed', $user, [], ['method' => 'pin'], $user->username);

            throw ValidationException::withMessages([
                'pin' => ['The PIN is incorrect.'],
            ]);
        }

        if (! $user->is_active) {
            AuditLog::record('login_failed', $user, [], [
                'method' => 'pin',
                'reason' => 'account disabled',
            ], $user->username);

            throw ValidationException::withMessages([
                'pin' => ['This account is disabled.'],
            ]);
        }

        $token = $user->createToken('pos-token')->plainTextToken;

        AuditLog::record('login', $user, [], ['method' => 'pin'], $user->username, $user);

        return response()->json([
            'token' => $token,
            'user' => $user->load('role'),
        ]);
    }

    /**
     * Return the currently authenticated user.
     */
    public function me(Request $request): JsonResponse
    {
        return response()->json($request->user()->load('role'));
    }

    /**
     * Revoke the current access token (logout).
     */
    public function logout(Request $request): JsonResponse
    {
        $request->user()->currentAccessToken()->delete();

        AuditLog::record('logout', $request->user(), [], [], $request->user()->username);

        return response()->json(['message' => 'Logged out successfully.']);
    }
}
