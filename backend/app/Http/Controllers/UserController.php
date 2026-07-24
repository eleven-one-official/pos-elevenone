<?php

namespace App\Http\Controllers;

use App\Http\Middleware\SetCurrentBranch;
use App\Models\Role;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

class UserController extends Controller
{
    /**
     * Roles whose accounts work at every branch (NULL branch_id): the back
     * office, and the shared per-device station accounts. Everyone else —
     * cashiers, managers — is hired by one branch and belongs to it.
     */
    private const GLOBAL_ROLE_SLUGS = ['admin', 'waiter', 'kitchen', 'bar'];

    /**
     * Staff management is admin-only. (The whole controller sits behind
     * auth:sanctum via the route group; this narrows it to the admin role.)
     */
    private function authorizeAdmin(Request $request): void
    {
        abort_unless($request->user()?->hasRole('admin'), 403, 'Only admins can manage staff.');
    }

    /** The branch a user with this role should carry (null = every branch). */
    private function branchIdForRole(?int $roleId): ?int
    {
        $slug = $roleId ? Role::find($roleId)?->slug : null;

        return in_array($slug, self::GLOBAL_ROLE_SLUGS, true) ? null : SetCurrentBranch::id();
    }

    /**
     * Shape one user for the admin screen. The password and PIN are exposed in
     * clear here by design — this controller is admin-only, and both are stored
     * recoverably so admins can read credentials back. The password is a copy;
     * login still checks the one-way hash. It's null for accounts whose
     * password was set before recoverable copies existed (bcrypt is one-way).
     */
    private function present(User $user): array
    {
        $user->loadMissing(['role:id,name,slug', 'branch:id,name']);

        return [
            'id' => $user->id,
            'name' => $user->name,
            'username' => $user->username,
            'email' => $user->email,
            'phone' => $user->phone,
            'is_active' => (bool) $user->is_active,
            // null = works at every branch (admins, shared station accounts).
            'branch' => $user->branch?->only(['id', 'name']),
            'role' => $user->role ? [
                'id' => $user->role->id,
                'name' => $user->role->name,
                'slug' => $user->role->slug,
            ] : null,
            'password' => $user->password_plain,
            'has_password' => ! is_null($user->password_plain),
            // The PIN is admin-viewable by design (encrypted cast, admin-only
            // controller): admins hand PINs to staff and look them up here.
            'pin' => $user->pin,
            'has_pin' => ! is_null($user->pin),
        ];
    }

    public function index(Request $request): JsonResponse
    {
        $this->authorizeAdmin($request);

        // The Employees screen shows the branch the admin is switched to: its
        // own hires plus the global accounts. Another branch's staff are that
        // branch's business.
        $users = User::with('role:id,name,slug')
            ->where(fn ($q) => $q->whereNull('branch_id')->orWhere('branch_id', SetCurrentBranch::id()))
            ->orderBy('name')->get();

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

        $user = new User([
            'name' => $data['name'],
            'username' => $data['username'],
            'email' => $data['email'] ?? null,
            'phone' => $data['phone'] ?? null,
            'role_id' => $data['role_id'] ?? null,
            'password' => Hash::make($data['password']),
            'password_plain' => $data['password'],
            'pin' => $data['pin'] ?? null,
            'is_active' => $data['is_active'] ?? true,
        ]);

        // A new hire belongs to the branch the admin is switched to; global
        // roles (admin, shared stations) work everywhere. Not mass-assigned —
        // the client never chooses a branch directly.
        $user->branch_id = $this->branchIdForRole($user->role_id);
        $user->save();

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

        // A role change can move an account between "one branch" and "every
        // branch" — e.g. promoting a cashier to admin frees them from TTP.
        if (array_key_exists('role_id', $data)) {
            $user->branch_id = $this->branchIdForRole($user->role_id);
        }

        if (! empty($data['password'])) {
            $user->password = Hash::make($data['password']);
            $user->password_plain = $data['password'];
        }
        if (array_key_exists('pin', $data)) {
            // Empty string clears PIN login; a value sets it; absent leaves it as-is.
            $user->pin = ! empty($data['pin']) ? $data['pin'] : null;
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
