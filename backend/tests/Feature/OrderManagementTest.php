<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\MenuItem;
use App\Models\Pricelist;
use App\Models\Setting;
use App\Models\Table;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\CreatesStaff;
use Tests\TestCase;

class OrderManagementTest extends TestCase
{
    use CreatesStaff, RefreshDatabase;

    private function payload(MenuItem $item, int $qty = 1, array $extra = []): array
    {
        return $extra + [
            'order_type' => 'take_away',
            'items' => [['menu_item_id' => $item->id, 'quantity' => $qty]],
        ];
    }

    // ------------------------------------------------------------------
    // Core pricing + totals
    // ------------------------------------------------------------------

    public function test_create_prices_lines_from_the_menu_and_totals(): void
    {
        $item = MenuItem::factory()->create(['price' => 4.50]);
        Sanctum::actingAs($this->staff('cashier'));

        $this->postJson('/api/orders', $this->payload($item, 3, ['discount' => 1.50]))
            ->assertCreated()
            ->assertJsonPath('subtotal', '13.50')
            ->assertJsonPath('discount', '1.50')
            ->assertJsonPath('total', '12.00');
    }

    public function test_dine_in_occupies_the_table_and_links_the_customer(): void
    {
        $item = MenuItem::factory()->create();
        $table = Table::factory()->create();
        $customer = Customer::create(['name' => 'Dara']);
        Sanctum::actingAs($this->staff('cashier'));

        $this->postJson('/api/orders', $this->payload($item, 1, [
            'order_type' => 'dine_in',
            'table_id' => $table->id,
            'customer_id' => $customer->id,
        ]))
            ->assertCreated()
            ->assertJsonPath('customer.name', 'Dara');

        $this->assertSame('occupied', $table->fresh()->status);
    }

    public function test_item_note_longer_than_the_column_is_rejected(): void
    {
        $item = MenuItem::factory()->create();
        Sanctum::actingAs($this->staff('cashier'));

        $payload = $this->payload($item);
        $payload['items'][0]['note'] = str_repeat('a', 256);

        $this->postJson('/api/orders', $payload)->assertStatus(422);
    }

    // ------------------------------------------------------------------
    // Pricelists
    // ------------------------------------------------------------------

    public function test_pricelist_rule_overrides_the_menu_price(): void
    {
        $item = MenuItem::factory()->create(['price' => 5.00]);
        $list = Pricelist::create(['name' => 'Happy Hour', 'currency' => 'USD']);
        $list->rules()->create(['menu_item_id' => $item->id, 'min_quantity' => 1, 'fixed_price' => 3.00]);
        Sanctum::actingAs($this->staff('cashier'));

        $this->postJson('/api/orders', $this->payload($item, 2, ['pricelist_id' => $list->id]))
            ->assertCreated()
            ->assertJsonPath('pricelist_id', $list->id)
            ->assertJsonPath('items.0.price', '3.00')
            ->assertJsonPath('total', '6.00');
    }

    public function test_quantity_break_applies_only_from_its_min_quantity(): void
    {
        $item = MenuItem::factory()->create(['price' => 5.00]);
        $list = Pricelist::create(['name' => 'Bulk', 'currency' => 'USD']);
        $list->rules()->create(['menu_item_id' => $item->id, 'min_quantity' => 3, 'fixed_price' => 4.00]);
        Sanctum::actingAs($this->staff('cashier'));

        // Below the break: menu price.
        $this->postJson('/api/orders', $this->payload($item, 2, ['pricelist_id' => $list->id]))
            ->assertCreated()
            ->assertJsonPath('items.0.price', '5.00');

        // At the break: rule price.
        $this->postJson('/api/orders', $this->payload($item, 3, ['pricelist_id' => $list->id]))
            ->assertCreated()
            ->assertJsonPath('items.0.price', '4.00');
    }

    public function test_product_rule_beats_catch_all_and_expired_rules_are_skipped(): void
    {
        $item = MenuItem::factory()->create(['price' => 5.00]);
        $list = Pricelist::create(['name' => 'Mixed', 'currency' => 'USD']);
        $list->rules()->create(['menu_item_id' => null, 'min_quantity' => 1, 'fixed_price' => 4.50]);
        $list->rules()->create(['menu_item_id' => $item->id, 'min_quantity' => 1, 'fixed_price' => 4.00]);
        // Product rule that ended yesterday must not win.
        $list->rules()->create([
            'menu_item_id' => $item->id, 'min_quantity' => 1, 'fixed_price' => 1.00,
            'date_end' => now()->subDay()->toDateString(),
        ]);
        Sanctum::actingAs($this->staff('cashier'));

        $this->postJson('/api/orders', $this->payload($item, 1, ['pricelist_id' => $list->id]))
            ->assertCreated()
            ->assertJsonPath('items.0.price', '4.00');
    }

    public function test_khr_pricelist_converts_at_the_settings_rate(): void
    {
        $item = MenuItem::factory()->create(['price' => 5.00]);
        Setting::updateOrCreate(['key' => 'currency_khr_rate'], ['value' => '4000']);
        $list = Pricelist::create(['name' => 'Riel Menu', 'currency' => 'KHR']);
        $list->rules()->create(['menu_item_id' => $item->id, 'min_quantity' => 1, 'fixed_price' => 8000]);
        Sanctum::actingAs($this->staff('cashier'));

        // 8000 riel / 4000 = 2.00 USD
        $this->postJson('/api/orders', $this->payload($item, 1, ['pricelist_id' => $list->id]))
            ->assertCreated()
            ->assertJsonPath('items.0.price', '2.00');
    }

    public function test_default_pricelist_setting_applies_when_none_sent(): void
    {
        $item = MenuItem::factory()->create(['price' => 5.00]);
        $list = Pricelist::create(['name' => 'House', 'currency' => 'USD']);
        $list->rules()->create(['menu_item_id' => $item->id, 'min_quantity' => 1, 'fixed_price' => 4.20]);
        Setting::updateOrCreate(['key' => 'default_pricelist_id'], ['value' => (string) $list->id]);
        Sanctum::actingAs($this->staff('cashier'));

        $this->postJson('/api/orders', $this->payload($item))
            ->assertCreated()
            ->assertJsonPath('pricelist_id', $list->id)
            ->assertJsonPath('items.0.price', '4.20');
    }

    public function test_update_replaces_items_and_reprices_through_the_order_pricelist(): void
    {
        $item = MenuItem::factory()->create(['price' => 5.00]);
        $other = MenuItem::factory()->create(['price' => 7.00]);
        $list = Pricelist::create(['name' => 'House', 'currency' => 'USD']);
        $list->rules()->create(['menu_item_id' => $other->id, 'min_quantity' => 1, 'fixed_price' => 6.00]);
        Sanctum::actingAs($this->staff('cashier'));

        $orderId = $this->postJson('/api/orders', $this->payload($item, 1, ['pricelist_id' => $list->id]))
            ->assertCreated()
            ->json('id');

        $this->putJson("/api/orders/{$orderId}", [
            'items' => [['menu_item_id' => $other->id, 'quantity' => 2]],
        ])
            ->assertOk()
            ->assertJsonPath('items.0.price', '6.00')
            ->assertJsonPath('total', '12.00');
    }
}
