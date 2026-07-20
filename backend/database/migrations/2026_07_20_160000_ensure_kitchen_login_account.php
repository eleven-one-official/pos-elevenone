<?php

use App\Models\Role;
use App\Models\User;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Hash;

return new class extends Migration
{
    /**
     * The Kitchen Display screen needs a tap-in account, but production deploys
     * run `migrate` and NOT the seeders (re-seeding would resurrect default
     * `password` logins). So the account is introduced here instead: a
     * migration runs exactly once on deploy.
     *
     * Idempotent (updateOrCreate keyed on the slug/username) and surgical — it
     * touches only the kitchen role + user, never resetting any other account.
     * Mirrors RoleSeeder + UserSeeder so a freshly seeded dev DB and a migrated
     * production DB end up identical.
     */
    public function up(): void
    {
        $role = Role::updateOrCreate(
            ['slug' => 'kitchen'],
            ['name' => 'Kitchen', 'description' => 'View and update kitchen tickets'],
        );

        User::updateOrCreate(
            ['username' => 'kitchen'],
            [
                'name' => 'Kitchen',
                'email' => 'kitchen@elevenone-kitchen.com',
                // Schema requires a password; this account signs in by tap (no
                // PIN), like the waiter — it never uses password login.
                'password' => Hash::make('password'),
                'pin' => null,
                'role_id' => $role->id,
                'is_active' => true,
            ],
        );
    }

    public function down(): void
    {
        // Non-destructive reverse: drop the account out of the login roster
        // without deleting it (kept in case any record ever references it).
        User::where('username', 'kitchen')->update(['is_active' => false]);
    }
};
