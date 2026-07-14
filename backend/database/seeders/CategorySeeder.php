<?php

namespace Database\Seeders;

use App\Models\Category;
use Illuminate\Database\Seeder;

class CategorySeeder extends Seeder
{
    public function run(): void
    {
        $categories = [
            ['name' => 'Food', 'slug' => 'food', 'sort_order' => 1],
            ['name' => 'Drink', 'slug' => 'drink', 'sort_order' => 2],
            ['name' => 'Dessert', 'slug' => 'dessert', 'sort_order' => 3],
        ];

        foreach ($categories as $category) {
            Category::updateOrCreate(['slug' => $category['slug']], $category);
        }
    }
}
