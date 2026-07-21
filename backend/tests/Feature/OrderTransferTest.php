<?php

namespace Tests\Feature;

use App\Models\MenuItem;
use App\Models\Table;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\CreatesStaff;
use Tests\TestCase;

/**
 * Transferring a bill to another table. The floor grid reads its occupied
 * badge from `tables.status` but its guest pill from `orders.table_id`, so a
 * transfer that moves only the order leaves the two disagreeing — the source
 * table keeps a badge with no bill behind it and can never be re-seated.
 */
class OrderTransferTest extends TestCase
{
    use CreatesStaff, RefreshDatabase;

    /** Open a dine-in bill on $table over the API; returns its id. */
    private function seat(Table $table, MenuItem $item): int
    {
        return $this->postJson('/api/orders', [
            'order_type' => 'dine_in',
            'table_id' => $table->id,
            'guest_count' => 2,
            'items' => [['menu_item_id' => $item->id, 'quantity' => 1]],
        ])->assertCreated()->json('id');
    }

    public function test_transfer_moves_the_order_and_the_table_status(): void
    {
        $item = MenuItem::factory()->create();
        $from = Table::factory()->create(['name' => 'E1']);
        $to = Table::factory()->create(['name' => 'E5']);

        Sanctum::actingAs($this->staff('cashier'));
        $id = $this->seat($from, $item);
        $this->assertSame('occupied', $from->fresh()->status);

        $this->putJson("/api/orders/{$id}", ['order_type' => 'dine_in', 'table_id' => $to->id])
            ->assertOk()
            ->assertJsonPath('table_id', $to->id)
            ->assertJsonPath('table.name', 'E5');

        // The bill left E1 and landed on E5 — both flags follow it.
        $this->assertSame('available', $from->fresh()->status);
        $this->assertSame('occupied', $to->fresh()->status);
    }

    public function test_transfer_to_takeaway_releases_the_table(): void
    {
        $item = MenuItem::factory()->create();
        $from = Table::factory()->create(['name' => 'E2']);

        Sanctum::actingAs($this->staff('cashier'));
        $id = $this->seat($from, $item);

        $this->putJson("/api/orders/{$id}", ['order_type' => 'take_away', 'table_id' => null])
            ->assertOk()
            ->assertJsonPath('table_id', null);

        $this->assertSame('available', $from->fresh()->status);
    }

    public function test_transfer_onto_an_occupied_table_is_refused(): void
    {
        $item = MenuItem::factory()->create();
        $from = Table::factory()->create(['name' => 'E3']);
        $busy = Table::factory()->create(['name' => 'E4']);

        Sanctum::actingAs($this->staff('cashier'));
        $id = $this->seat($from, $item);
        $this->seat($busy, $item);

        // Two live bills on one table would double-charge the guests, exactly
        // what store() refuses when a bill is first opened.
        $this->putJson("/api/orders/{$id}", ['order_type' => 'dine_in', 'table_id' => $busy->id])
            ->assertStatus(422);

        // The refusal is total: the order never left E3.
        $this->assertSame($from->id, $this->getJson("/api/orders/{$id}")->json('table_id'));
        $this->assertSame('occupied', $from->fresh()->status);
    }

    public function test_updating_an_order_without_moving_it_leaves_the_table_alone(): void
    {
        $item = MenuItem::factory()->create();
        $table = Table::factory()->create(['name' => 'E6']);

        Sanctum::actingAs($this->staff('cashier'));
        $id = $this->seat($table, $item);

        // Re-sending the same table (the POS does this on every save) must not
        // free and re-seat it — nor may an unrelated edit touch the flag.
        $this->putJson("/api/orders/{$id}", ['table_id' => $table->id])->assertOk();
        $this->putJson("/api/orders/{$id}", ['guest_count' => 4])->assertOk();

        $this->assertSame('occupied', $table->fresh()->status);
    }

    public function test_repeated_transfers_keep_naming_the_original_table(): void
    {
        $item = MenuItem::factory()->create();
        $first = Table::factory()->create(['name' => 'E1']);
        $middle = Table::factory()->create(['name' => 'E3']);
        $last = Table::factory()->create(['name' => 'E7']);

        Sanctum::actingAs($this->staff('cashier'));
        $id = $this->seat($first, $item);

        // A fresh bill has no origin to report.
        $this->assertNull($this->getJson("/api/orders/{$id}")->json('transferred_from'));

        $this->putJson("/api/orders/{$id}", ['table_id' => $middle->id])
            ->assertOk()
            ->assertJsonPath('transferred_from.name', 'E1');

        // Second hop: E1 → E3 → E7 still reports where the guests started.
        $this->putJson("/api/orders/{$id}", ['table_id' => $last->id])
            ->assertOk()
            ->assertJsonPath('table.name', 'E7')
            ->assertJsonPath('transferred_from.name', 'E1');

        // Sent back home, the bill is no longer "transferred" at all.
        $this->putJson("/api/orders/{$id}", ['table_id' => $first->id])
            ->assertOk()
            ->assertJsonPath('transferred_from', null);
    }

    public function test_the_origin_is_server_owned_and_not_client_settable(): void
    {
        $item = MenuItem::factory()->create();
        $table = Table::factory()->create(['name' => 'E9']);
        $other = Table::factory()->create(['name' => 'E10']);

        Sanctum::actingAs($this->staff('cashier'));
        $id = $this->seat($table, $item);

        // A terminal can't invent a transfer that never happened.
        $this->putJson("/api/orders/{$id}", ['transferred_from_table_id' => $other->id])
            ->assertOk()
            ->assertJsonPath('transferred_from', null);
    }

    public function test_the_kitchen_sees_the_new_table_on_a_transferred_ticket(): void
    {
        $item = MenuItem::factory()->create();
        $from = Table::factory()->create(['name' => 'E7']);
        $to = Table::factory()->create(['name' => 'E8']);

        Sanctum::actingAs($this->staff('cashier'));
        $id = $this->seat($from, $item);
        $this->putJson("/api/orders/{$id}", ['order_type' => 'dine_in', 'table_id' => $to->id])
            ->assertOk();

        // The kitchen display labels a ticket from the live `table` relation,
        // so the board must relabel itself on its next poll.
        Sanctum::actingAs($this->staff('kitchen'));
        $this->getJson('/api/orders?status=new,preparing')
            ->assertOk()
            ->assertJsonPath('0.id', $id)
            ->assertJsonPath('0.table.name', 'E8')
            // …and it says where the food was ordered, so a cook already
            // plating for E7 knows the guests moved.
            ->assertJsonPath('0.transferred_from.name', 'E7');
    }
}
