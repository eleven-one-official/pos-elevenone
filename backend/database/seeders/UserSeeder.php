<?php

namespace Database\Seeders;

use App\Models\Role;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class UserSeeder extends Seeder
{
    public function run(): void
    {
        $admin = Role::where('slug', 'admin')->first();
        $cashier = Role::where('slug', 'cashier')->first();

        User::updateOrCreate(
            ['username' => 'admin'],
            [
                'name' => 'Administrator',
                'email' => 'admin@elevenone-kitchen.com',
                'password' => Hash::make('password'),
                'role_id' => $admin?->id,
                'is_active' => true,
            ]
        );

        User::updateOrCreate(
            ['username' => 'cashier'],
            [
                'name' => 'Cashier One',
                'email' => 'cashier@elevenone-kitchen.com',
                'password' => Hash::make('password'),
                'role_id' => $cashier?->id,
                'is_active' => true,
            ]
        );
    }
}
