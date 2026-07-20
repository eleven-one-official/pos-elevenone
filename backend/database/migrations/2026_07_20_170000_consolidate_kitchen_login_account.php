<?php

use App\Models\Role;
use App\Models\User;
use Illuminate\Database\Migrations\Migration;

return new class extends Migration
{
    /**
     * One shared "Kitchen" tap-in account, like the waiter. The previous
     * migration seeded that canonical account, but this venue's production DB
     * already carried a second kitchen-role account from before the display
     * existed — leaving two entries in the tap-a-name roster. Retire the extras
     * so only the canonical "Kitchen" login remains.
     *
     * Guarded on the canonical account being present and active first, so the
     * roster is never left with no kitchen login at all. Deactivates rather
     * than deletes — the rows are kept in case any record references them, and
     * an admin can hard-delete or re-activate from the Employees screen.
     */
    public function up(): void
    {
        $roleId = Role::where('slug', 'kitchen')->value('id');
        if (! $roleId) {
            return;
        }

        $canonicalActive = User::where('username', 'kitchen')
            ->where('role_id', $roleId)
            ->where('is_active', true)
            ->exists();
        if (! $canonicalActive) {
            return;
        }

        User::where('role_id', $roleId)
            ->where('username', '!=', 'kitchen')
            ->where('is_active', true)
            ->update(['is_active' => false]);
    }

    public function down(): void
    {
        // One-way consolidation — re-activating a retired account is a
        // deliberate admin action, not an automatic rollback.
    }
};
