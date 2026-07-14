<?php

namespace Database\Seeders;

use App\Models\Table;
use Illuminate\Database\Seeder;

class TableSeeder extends Seeder
{
    public function run(): void
    {
        // Normal tables T1..T8
        for ($i = 1; $i <= 8; $i++) {
            Table::updateOrCreate(
                ['name' => "T{$i}"],
                ['type' => 'normal', 'capacity' => 4, 'status' => 'available']
            );
        }

        // VIP tables VIP1..VIP3
        for ($i = 1; $i <= 3; $i++) {
            Table::updateOrCreate(
                ['name' => "VIP{$i}"],
                ['type' => 'vip', 'capacity' => 8, 'status' => 'available']
            );
        }
    }
}
