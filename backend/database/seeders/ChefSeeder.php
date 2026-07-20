<?php

namespace Database\Seeders;

use App\Models\Chef;
use Illuminate\Database\Seeder;

class ChefSeeder extends Seeder
{
    /**
     * A small starter roster of kitchen cooks. Mirrors the seed baked into the
     * create_chefs migration so a freshly seeded dev DB and a migrated
     * production DB end up identical. Idempotent (keyed on name).
     */
    public function run(): void
    {
        foreach (['Bopha', 'Rithy', 'Vichea'] as $i => $name) {
            Chef::updateOrCreate(
                ['name' => $name],
                ['is_active' => true, 'sort_order' => $i + 1],
            );
        }
    }
}
