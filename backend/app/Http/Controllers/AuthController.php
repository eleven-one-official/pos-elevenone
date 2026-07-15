<?php

namespace App\Http\Controllers;

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
            throw ValidationException::withMessages([
                'username' => ['The provided credentials are incorrect.'],
            ]);
        }

        if (! $user->is_active) {
            throw ValidationException::withMessages([
                'username' => ['This account is disabled.'],
            ]);
        }

        $token = $user->createToken('pos-token')->plainTextToken;

        return response()->json([
            'token' => $token,
            'user' => $user->load('role'),
        ]);
    }

    /**
     * Public login roster for the tap-a-name POS/tablet screen. Returns only the
     * active staff who have a PIN set (never passwords, emails, or the PIN hash).
     * Filter by role slug with ?role=waiter|cashier|...
     */
    public function staffRoster(Request $request): JsonResponse
    {
        $query = User::query()
            ->where('is_active', true)
            ->whereNotNull('pin')
            ->with('role:id,name,slug')
            ->orderBy('name');

        if ($request->filled('role')) {
            $slug = (string) $request->string('role');
            $query->whereHas('role', fn ($q) => $q->where('slug', $slug));
        }

        $staff = $query->get(['id', 'name', 'username', 'role_id'])->map(fn (User $u) => [
            'id' => $u->id,
            'name' => $u->name,
            'username' => $u->username,
            'role' => $u->role?->slug,
            'role_name' => $u->role?->name,
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
            'pin' => ['required', 'string'],
        ]);

        $user = User::find($credentials['user_id']);

        // One generic message whether the account has no PIN or the PIN is wrong,
        // so we don't reveal which staff have PIN login enabled.
        if (! $user || ! $user->pin || ! Hash::check($credentials['pin'], $user->pin)) {
            throw ValidationException::withMessages([
                'pin' => ['The PIN is incorrect.'],
            ]);
        }

        if (! $user->is_active) {
            throw ValidationException::withMessages([
                'pin' => ['This account is disabled.'],
            ]);
        }

        $token = $user->createToken('pos-token')->plainTextToken;

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

        return response()->json(['message' => 'Logged out successfully.']);
    }
}
