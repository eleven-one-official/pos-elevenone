<?php

namespace Tests\Feature;

use App\Models\MenuItem;
use App\Models\Order;
use App\Models\Table;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\CreatesStaff;
use Tests\TestCase;

/**
 * A take-away bill has no table, so the floor slot it was started on (T1…T8) is
 * what puts it back on the POS floor. These cover that binding.
 */
class TakeawaySlotTest extends TestCase
{
    use CreatesStaff, RefreshDatabase;

    private function payload(MenuItem $item, array $extra = []): array
    {
        return $extra + [
            'order_type' => 'take_away',
            'items' => [['menu_item_id' => $item->id, 'quantity' => 1]],
        ];
    }

    public function test_a_takeaway_order_keeps_its_slot_and_comes_back_on_the_floor_query(): void
    {
        $item = MenuItem::factory()->create();
        Sanctum::actingAs($this->staff('cashier'));

        $this->postJson('/api/orders', $this->payload($item, ['takeaway_slot' => 3]))
            ->assertCreated()
            ->assertJsonPath('takeaway_slot', 3)
            ->assertJsonPath('table_id', null);

        // This is the call the floor polls to light up its take-away cards.
        $floor = $this->getJson('/api/orders?order_type=take_away&status=new,preparing,ready,served')
            ->assertOk()
            ->json();

        $this->assertCount(1, $floor);
        $this->assertSame(3, $floor[0]['takeaway_slot']);
    }

    public function test_a_second_bill_cannot_open_on_a_busy_slot(): void
    {
        $item = MenuItem::factory()->create();
        Sanctum::actingAs($this->staff('cashier'));

        $this->postJson('/api/orders', $this->payload($item, ['takeaway_slot' => 2]))->assertCreated();
        // A stale floor tapping T2 again must not fork the guest's bill.
        $this->postJson('/api/orders', $this->payload($item, ['takeaway_slot' => 2]))
            ->assertStatus(422);

        // A different slot is free, and so is T2 once its bill is closed.
        $this->postJson('/api/orders', $this->payload($item, ['takeaway_slot' => 5]))->assertCreated();
        Order::where('takeaway_slot', 2)->update(['status' => 'completed']);
        $this->postJson('/api/orders', $this->payload($item, ['takeaway_slot' => 2]))->assertCreated();
    }

    public function test_transferring_to_a_table_releases_the_slot(): void
    {
        $item = MenuItem::factory()->create();
        $table = Table::create(['name' => 'E1', 'type' => 'normal', 'capacity' => 4, 'status' => 'available']);
        Sanctum::actingAs($this->staff('cashier'));

        $id = $this->postJson('/api/orders', $this->payload($item, ['takeaway_slot' => 1]))
            ->assertCreated()->json('id');

        // Take-away → dine-in: the bill belongs to the table now, so the slot
        // must clear or the floor would show it in both places.
        $this->putJson("/api/orders/{$id}", [
            'order_type' => 'dine_in',
            'table_id' => $table->id,
            'takeaway_slot' => null,
        ])->assertOk()->assertJsonPath('takeaway_slot', null);

        // And back out to T1 — the slot is bound again.
        $this->putJson("/api/orders/{$id}", [
            'order_type' => 'take_away',
            'table_id' => null,
            'takeaway_slot' => 1,
        ])->assertOk()->assertJsonPath('takeaway_slot', 1);
    }

    public function test_a_bill_cannot_be_moved_onto_an_occupied_slot(): void
    {
        $item = MenuItem::factory()->create();
        Sanctum::actingAs($this->staff('cashier'));

        $this->postJson('/api/orders', $this->payload($item, ['takeaway_slot' => 4]))->assertCreated();
        $id = $this->postJson('/api/orders', $this->payload($item, ['takeaway_slot' => 6]))
            ->assertCreated()->json('id');

        $this->putJson("/api/orders/{$id}", ['takeaway_slot' => 4])->assertStatus(422);
        $this->assertSame(6, Order::find($id)->takeaway_slot);
    }
}
