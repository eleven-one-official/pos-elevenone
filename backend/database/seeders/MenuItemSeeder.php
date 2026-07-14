<?php

namespace Database\Seeders;

use App\Models\Category;
use App\Models\MenuItem;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

class MenuItemSeeder extends Seeder
{
    public function run(): void
    {
        $items = [
            'food' => [
                ['name' => 'Beef Lok Lak', 'price' => 6.50],
                ['name' => 'Fried Rice with Chicken', 'price' => 4.50],
                ['name' => 'Fish Amok', 'price' => 7.00],
                ['name' => 'Khmer Beef Noodle Soup', 'price' => 4.00],
            ],
            'drink' => [
                ['name' => 'Iced Coffee', 'price' => 1.75],
                ['name' => 'Fresh Coconut', 'price' => 2.00],
                ['name' => 'Coca-Cola', 'price' => 1.00],
                ['name' => 'Lime Soda', 'price' => 1.50],
            ],
            'dessert' => [
                ['name' => 'Mango Sticky Rice', 'price' => 3.00],
                ['name' => 'Pumpkin Custard', 'price' => 2.50],
                ['name' => 'Banana in Coconut Milk', 'price' => 2.00],
            ],
        ];

        foreach ($items as $slug => $menuItems) {
            $category = Category::where('slug', $slug)->first();
            if (! $category) {
                continue;
            }

            foreach ($menuItems as $index => $item) {
                MenuItem::updateOrCreate(
                    ['category_id' => $category->id, 'name' => $item['name']],
                    [
                        'slug' => Str::slug($item['name']),
                        'price' => $item['price'],
                        'is_available' => true,
                        'sort_order' => $index + 1,
                    ]
                );
            }
        }
    }
}
