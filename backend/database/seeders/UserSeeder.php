<?php

namespace Database\Seeders;

use App\Models\Role;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class UserSeeder extends Seeder
{
    public function run(): void
    {
        $roles = Role::pluck('id', 'slug');

        // Password accounts — sign in with username + password (no PIN, so they
        // never appear in the tap-a-name login roster).
        User::updateOrCreate(
            ['username' => 'admin'],
            [
                'name' => 'Administrator',
                'email' => 'admin@elevenone-kitchen.com',
                'password' => Hash::make('password'),
                'role_id' => $roles['admin'] ?? null,
                'is_active' => true,
            ]
        );

        User::updateOrCreate(
            ['username' => 'cashier'],
            [
                'name' => 'Cashier One',
                'email' => 'cashier@elevenone-kitchen.com',
                'password' => Hash::make('password'),
                'role_id' => $roles['cashier'] ?? null,
                'is_active' => true,
            ]
        );

        // Staff tap-login accounts — tap a name on the POS/tablet. Cashiers then
        // enter their PIN; the waiter account has no PIN and signs in on tap.
        $staff = [
            ['name' => 'Waiter', 'role' => 'waiter', 'pin' => null],
            ['name' => 'Sok Dara', 'role' => 'cashier', 'pin' => '1234'],
            ['name' => 'Chan Sreymom', 'role' => 'cashier', 'pin' => '2345'],
            ['name' => 'Kim Panha', 'role' => 'cashier', 'pin' => '3456'],
        ];

        foreach ($staff as $member) {
            $username = Str::slug($member['name']); // e.g. "Vann Sok" -> "vann-sok"

            User::updateOrCreate(
                ['username' => $username],
                [
                    'name' => $member['name'],
                    'email' => "{$username}@elevenone-kitchen.com",
                    // A password is required by the schema; PIN staff still get one
                    // so they *could* also sign in the classic way if ever needed.
                    'password' => Hash::make('password'),
                    'pin' => $member['pin'] === null ? null : Hash::make($member['pin']),
                    'role_id' => $roles[$member['role']] ?? null,
                    'is_active' => true,
                ]
            );
        }

        // Retired demo waiters — deactivate (not delete, past orders may
        // reference them) so they drop out of the tap-a-name roster.
        User::whereIn('username', ['vann-sok', 'srey-neath', 'chhay-lida'])
            ->update(['is_active' => false]);
    }
}
