<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\MenuItem;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\CreatesStaff;
use Tests\TestCase;

/**
 * The admin forms send `sort_order: null` when the Sequence field is left
 * blank, but the column is NOT NULL — a blank must fall back to "end of the
 * list" on create and "keep the current position" on update.
 */
class CatalogSortOrderTest extends TestCase
{
    use CreatesStaff, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Sanctum::actingAs($this->staff('admin'));
    }

    public function test_category_created_with_null_sort_order_lands_at_the_end(): void
    {
        Category::factory()->create(['sort_order' => 4]);

        $this->postJson('/api/categories', ['name' => 'Drink', 'sort_order' => null])
            ->assertCreated()
            ->assertJsonPath('sort_order', 5);
    }

    public function test_category_updated_with_null_sort_order_keeps_its_position(): void
    {
        $category = Category::factory()->create(['sort_order' => 3]);

        $this->putJson("/api/categories/{$category->id}", ['sort_order' => null])
            ->assertOk()
            ->assertJsonPath('sort_order', 3);
    }

    public function test_menu_item_created_with_null_sort_order_lands_at_the_end(): void
    {
        MenuItem::factory()->create(['sort_order' => 7]);

        $this->postJson('/api/menu-items', [
            'category_id' => Category::factory()->create()->id,
            'name' => 'Iced Latte',
            'price' => 2.5,
            'sort_order' => null,
        ])
            ->assertCreated()
            ->assertJsonPath('sort_order', 8);
    }

    public function test_menu_item_updated_with_null_sort_order_keeps_its_position(): void
    {
        $item = MenuItem::factory()->create(['sort_order' => 6]);

        $this->putJson("/api/menu-items/{$item->id}", ['sort_order' => null])
            ->assertOk()
            ->assertJsonPath('sort_order', 6);
    }
}
