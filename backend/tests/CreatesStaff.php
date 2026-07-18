<?php

namespace Tests;

use App\Models\Role;
use App\Models\User;

/**
 * Helpers for feature tests that need signed-in staff. Roles are created on
 * demand with the same slugs the RoleSeeder uses, so `role:` middleware and
 * hasRole() checks behave exactly like production.
 */
trait CreatesStaff
{
    protected function role(string $slug): Role
    {
        return Role::firstOrCreate(
            ['slug' => $slug],
            ['name' => ucfirst($slug), 'description' => $slug.' test role'],
        );
    }

    /**
     * Create an active user with the given role slug. Attributes pass through
     * to the factory — note the model's `hashed` casts, so pass plain-text
     * `password`/`pin` values.
     */
    protected function staff(string $roleSlug, array $attributes = []): User
    {
        return User::factory()->create(
            $attributes + ['role_id' => $this->role($roleSlug)->id],
        );
    }
}
