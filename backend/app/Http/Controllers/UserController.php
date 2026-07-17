<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

class UserController extends Controller
{
    /**
     * Staff management is admin-only. (The whole controller sits behind
     * auth:sanctum via the route group; this narrows it to the admin role.)
     */
    private function authorizeAdmin(Request $request): void
    {
        abort_unless($request->user()?->hasRole('admin'), 403, 'Only admins can manage staff.');
    }

    /** Shape one user for the admin table — never exposes the password or PIN hash. */
    private function present(User $user): array
    {
        $user->loadMissing('role:id,name,slug');

        return [
            'id' => $user->id,
            'name' => $user->name,
            'username' => $user->username,
            'email' => $user->email,
            'phone' => $user->phone,
            'is_active' => (bool) $user->is_active,
            'role' => $user->role ? [
                'id' => $user->role->id,
                'name' => $user->role->name,
                'slug' => $user->role->slug,
            ] : null,
            // Whether PIN login is enabled, without revealing the PIN itself.
            'has_pin' => ! is_null($user->pin),
        ];
    }

    public function index(Request $request): JsonResponse
    {
        $this->authorizeAdmin($request);

        $users = User::with('role:id,name,slug')->orderBy('name')->get();

        return response()->json($users->map(fn (User $u) => $this->present($u))->values());
    }

    public function store(Request $request): JsonResponse
    {
        $this->authorizeAdmin($request);

        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'username' => ['required', 'string', 'max:255', 'alpha_dash', 'unique:users,username'],
            'email' => ['nullable', 'email', 'max:255', 'unique:users,email'],
            'phone' => ['nullable', 'string', 'max:50'],
            'role_id' => ['nullable', 'exists:roles,id'],
            'password' => ['required', 'string', 'min:8'],
            'pin' => ['nullable', 'string', 'digits_between:4,6'],
            'is_active' => ['boolean'],
        ]);

        $user = User::create([
            'name' => $data['name'],
            'username' => $data['username'],
            'email' => $data['email'] ?? null,
            'phone' => $data['phone'] ?? null,
            'role_id' => $data['role_id'] ?? null,
            'password' => Hash::make($data['password']),
            'pin' => isset($data['pin']) ? Hash::make($data['pin']) : null,
            'is_active' => $data['is_active'] ?? true,
        ]);

        return response()->json($this->present($user), 201);
    }

    public function show(Request $request, User $user): JsonResponse
    {
        $this->authorizeAdmin($request);

        return response()->json($this->present($user));
    }

    public function update(Request $request, User $user): JsonResponse
    {
        $this->authorizeAdmin($request);

        $data = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:255'],
            'username' => ['sometimes', 'required', 'string', 'max:255', 'alpha_dash', 'unique:users,username,'.$user->id],
            'email' => ['nullable', 'email', 'max:255', 'unique:users,email,'.$user->id],
            'phone' => ['nullable', 'string', 'max:50'],
            'role_id' => ['nullable', 'exists:roles,id'],
            // Password / PIN are only changed when a non-empty value is sent.
            'password' => ['nullable', 'string', 'min:8'],
            'pin' => ['nullable', 'string', 'digits_between:4,6'],
            'is_active' => ['boolean'],
        ]);

        // Don't let the last active admin lock everyone out of the back office by
        // deactivating themselves or dropping their admin role. Staff management is
        // admin-only, so reaching zero admins is unrecoverable through the UI.
        $isActiveAdmin = $user->is_active && $user->role?->slug === 'admin';
        if ($isActiveAdmin) {
            $willDeactivate = array_key_exists('is_active', $data) && ! $data['is_active'];
            $willChangeRole = array_key_exists('role_id', $data) && (int) $data['role_id'] !== (int) $user->role_id;
            if ($willDeactivate || $willChangeRole) {
                $otherActiveAdmins = User::where('id', '!=', $user->id)
                    ->where('is_active', true)
                    ->whereHas('role', fn ($q) => $q->where('slug', 'admin'))
                    ->count();
                abort_if($otherActiveAdmins === 0, 422, 'This is the last active admin — assign another admin first.');
            }
        }

        $user->fill(collect($data)->only(['name', 'username', 'email', 'phone', 'role_id', 'is_active'])->all());

        if (! empty($data['password'])) {
            $user->password = Hash::make($data['password']);
        }
        if (array_key_exists('pin', $data)) {
            // Empty string clears PIN login; a value sets it; absent leaves it as-is.
            $user->pin = ! empty($data['pin']) ? Hash::make($data['pin']) : null;
        }

        $user->save();

        return response()->json($this->present($user));
    }

    public function destroy(Request $request, User $user): JsonResponse
    {
        $this->authorizeAdmin($request);

        if ($request->user()->id === $user->id) {
            abort(422, 'You cannot delete your own account.');
        }

        $user->delete();

        return response()->json(['message' => 'User deleted.']);
    }
}
