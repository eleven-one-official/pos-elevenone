<?php

use App\Models\Role;
use App\Models\User;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Hash;

return new class extends Migration
{
    /**
     * The Bar Display screen needs a tap-in account of its own. Production runs
     * `migrate` and not the seeders, so the role + account are introduced here
     * exactly like the kitchen's were — idempotent (keyed on slug/username) and
     * touching nothing else. Mirrors RoleSeeder + UserSeeder so a freshly
     * seeded dev DB and a migrated production DB end up identical.
     */
    public function up(): void
    {
        $role = Role::updateOrCreate(
            ['slug' => 'bar'],
            ['name' => 'Bar', 'description' => 'View and update bar tickets'],
        );

        User::updateOrCreate(
            ['username' => 'bar'],
            [
                'name' => 'Bar',
                'email' => 'bar@elevenone-kitchen.com',
                // Schema requires a password; this account signs in by tap (no
                // PIN), like the kitchen — it never uses password login.
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
        User::where('username', 'bar')->update(['is_active' => false]);
    }
};
