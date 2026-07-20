<?php

namespace Database\Seeders;

use App\Models\Table;
use Illuminate\Database\Seeder;

class TableSeeder extends Seeder
{
    public function run(): void
    {
        // Normal tables E1..E16
        for ($i = 1; $i <= 16; $i++) {
            Table::updateOrCreate(
                ['name' => "E{$i}"],
                ['type' => 'normal', 'capacity' => 4, 'status' => 'available']
            );
        }

        // VIP tables VIP1..VIP6
        for ($i = 1; $i <= 6; $i++) {
            Table::updateOrCreate(
                ['name' => "VIP{$i}"],
                ['type' => 'vip', 'capacity' => 8, 'status' => 'available']
            );
        }
    }
}
