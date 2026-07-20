<?php

namespace Tests\Feature;

use App\Models\MenuItem;
use App\Models\Pricelist;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\CreatesStaff;
use Tests\TestCase;

class PricelistUpdateTest extends TestCase
{
    use CreatesStaff, RefreshDatabase;

    public function test_partial_put_keeps_omitted_header_fields(): void
    {
        $item = MenuItem::factory()->create();
        $list = Pricelist::create(['name' => 'Happy Hour', 'currency' => 'KHR']);
        Sanctum::actingAs($this->staff('manager'));

        // Only the rules are sent — name/currency must survive untouched.
        $this->putJson("/api/pricelists/{$list->id}", [
            'rules' => [['menu_item_id' => $item->id, 'fixed_price' => 4000]],
        ])
            ->assertOk()
            ->assertJsonPath('name', 'Happy Hour')
            ->assertJsonPath('currency', 'KHR')
            ->assertJsonCount(1, 'rules');
    }

    public function test_sent_header_fields_still_cannot_be_blank(): void
    {
        $list = Pricelist::create(['name' => 'Happy Hour', 'currency' => 'USD']);
        Sanctum::actingAs($this->staff('manager'));

        $this->putJson("/api/pricelists/{$list->id}", ['name' => ''])->assertStatus(422);
    }
}
