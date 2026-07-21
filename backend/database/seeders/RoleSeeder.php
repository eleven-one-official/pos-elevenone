<?php

namespace Database\Seeders;

use App\Models\Role;
use Illuminate\Database\Seeder;

class RoleSeeder extends Seeder
{
    public function run(): void
    {
        $roles = [
            ['name' => 'Admin', 'slug' => 'admin', 'description' => 'Full system access'],
            ['name' => 'Manager', 'slug' => 'manager', 'description' => 'Manage menu, reports and staff'],
            ['name' => 'Cashier', 'slug' => 'cashier', 'description' => 'Take orders and process payments'],
            ['name' => 'Waiter', 'slug' => 'waiter', 'description' => 'Take orders and serve tables'],
            ['name' => 'Kitchen', 'slug' => 'kitchen', 'description' => 'View and update kitchen tickets'],
            ['name' => 'Bar', 'slug' => 'bar', 'description' => 'View and update bar tickets'],
        ];

        foreach ($roles as $role) {
            Role::updateOrCreate(['slug' => $role['slug']], $role);
        }
    }
}
