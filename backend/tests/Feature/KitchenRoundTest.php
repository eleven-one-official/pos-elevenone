<?php

namespace Tests\Feature;

use App\Models\Chef;
use App\Models\MenuItem;
use App\Models\Order;
use App\Models\Table;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\CreatesStaff;
use Tests\TestCase;

/**
 * A table eats, then orders again on the same bill. The second batch has to
 * reach the kitchen as a ticket of its own — same table number, own cook, own
 * clock — instead of extra lines appearing on a card already being cooked (or
 * on no card at all, when the first round had been bumped).
 */
class KitchenRoundTest extends TestCase
{
    use CreatesStaff, RefreshDatabase;

    private function dineIn(Table $table, array $items): array
    {
        return [
            'order_type' => 'dine_in',
            'table_id' => $table->id,
            'guest_count' => 2,
            'items' => $items,
        ];
    }

    public function test_adding_to_a_table_fires_a_new_round_with_only_the_new_dishes(): void
    {
        $table = Table::create(['name' => 'E1', 'seats' => 4, 'type' => 'normal', 'status' => 'available']);
        $soup = MenuItem::factory()->create(['price' => 5]);
        $cake = MenuItem::factory()->create(['price' => 3]);

        Sanctum::actingAs($this->staff('waiter'));
        $id = $this->postJson('/api/orders', $this->dineIn($table, [
            ['menu_item_id' => $soup->id, 'quantity' => 2],
        ]))->assertCreated()->json('id');

        // A cook takes round 1, so it is mid-service when the guests order more.
        $chef = Chef::create(['name' => 'Bopha', 'is_active' => true, 'sort_order' => 1]);
        Sanctum::actingAs($this->staff('kitchen'));
        $first = $this->getJson('/api/kitchen/tickets')->assertOk()->assertJsonCount(1)->json('0.id');
        $this->putJson("/api/kitchen/tickets/{$first}", ['status' => 'preparing', 'chef_id' => $chef->id])
            ->assertOk();

        // The waiter re-sends the whole cart — the same soup plus a dessert.
        Sanctum::actingAs($this->staff('waiter'));
        $this->putJson("/api/orders/{$id}", $this->dineIn($table, [
            ['menu_item_id' => $soup->id, 'quantity' => 2],
            ['menu_item_id' => $cake->id, 'quantity' => 1],
        ]))->assertOk();

        Sanctum::actingAs($this->staff('kitchen'));
        $board = $this->getJson('/api/kitchen/tickets')->assertOk()->assertJsonCount(2)->json();

        // Two cards, one table, one bill — and the second carries the dessert
        // alone, not a repeat of the soup already in the pan.
        $this->assertSame('E1', $board[0]['order']['table']['name']);
        $this->assertSame('E1', $board[1]['order']['table']['name']);
        $this->assertSame($board[0]['order']['order_number'], $board[1]['order']['order_number']);

        $this->assertSame(1, $board[0]['round_no']);
        $this->assertSame('preparing', $board[0]['status']);
        $this->assertSame([$soup->id], array_column($board[0]['items'], 'menu_item_id'));

        $this->assertSame(2, $board[1]['round_no']);
        $this->assertSame('new', $board[1]['status']);
        $this->assertSame([$cake->id], array_column($board[1]['items'], 'menu_item_id'));
        $this->assertNull($board[1]['chef']);

        // The bill itself still holds everything, priced once.
        $this->assertSame('13.00', Order::find($id)->total);
    }

    public function test_a_bill_the_kitchen_had_finished_goes_back_on_the_board(): void
    {
        $table = Table::create(['name' => 'E2', 'seats' => 4, 'type' => 'normal', 'status' => 'available']);
        $soup = MenuItem::factory()->create(['price' => 5]);
        $cake = MenuItem::factory()->create(['price' => 3]);

        Sanctum::actingAs($this->staff('waiter'));
        $id = $this->postJson('/api/orders', $this->dineIn($table, [
            ['menu_item_id' => $soup->id, 'quantity' => 1],
        ]))->assertCreated()->json('id');

        Sanctum::actingAs($this->staff('kitchen'));
        $first = $this->getJson('/api/kitchen/tickets')->json('0.id');
        $this->putJson("/api/kitchen/tickets/{$first}", ['status' => 'ready'])->assertOk();
        $this->getJson('/api/kitchen/tickets')->assertJsonCount(0);
        $this->assertSame('ready', Order::find($id)->status);

        // Dessert ordered after the mains were plated: before rounds this
        // vanished, because the ticket had already left the board.
        Sanctum::actingAs($this->staff('waiter'));
        $this->putJson("/api/orders/{$id}", $this->dineIn($table, [
            ['menu_item_id' => $soup->id, 'quantity' => 1],
            ['menu_item_id' => $cake->id, 'quantity' => 2],
        ]))->assertOk();

        Sanctum::actingAs($this->staff('kitchen'));
        $board = $this->getJson('/api/kitchen/tickets')->assertJsonCount(1)->json();
        $this->assertSame(2, $board[0]['round_no']);
        $this->assertSame(2, $board[0]['items'][0]['quantity']);
        // The bill is back in the queue, so the floor sees it as live again.
        $this->assertSame('new', Order::find($id)->status);
    }

    public function test_resending_an_unchanged_cart_fires_nothing(): void
    {
        $table = Table::create(['name' => 'E3', 'seats' => 4, 'type' => 'normal', 'status' => 'available']);
        $soup = MenuItem::factory()->create(['price' => 5]);

        Sanctum::actingAs($this->staff('waiter'));
        $cart = $this->dineIn($table, [['menu_item_id' => $soup->id, 'quantity' => 2]]);
        $id = $this->postJson('/api/orders', $cart)->assertCreated()->json('id');
        $this->putJson("/api/orders/{$id}", $cart)->assertOk();

        $this->assertSame(1, Order::find($id)->rounds()->count());
        $this->assertSame('10.00', Order::find($id)->total);
    }

    public function test_a_cut_quantity_comes_off_the_newest_round(): void
    {
        $table = Table::create(['name' => 'E4', 'seats' => 4, 'type' => 'normal', 'status' => 'available']);
        $soup = MenuItem::factory()->create(['price' => 5]);

        Sanctum::actingAs($this->staff('cashier'));
        $id = $this->postJson('/api/orders', $this->dineIn($table, [
            ['menu_item_id' => $soup->id, 'quantity' => 1],
        ]))->assertCreated()->json('id');

        // Round 2 adds two more of the same dish…
        $this->putJson("/api/orders/{$id}", $this->dineIn($table, [
            ['menu_item_id' => $soup->id, 'quantity' => 3],
        ]))->assertOk();
        $order = Order::find($id);
        $this->assertSame(2, $order->rounds()->count());

        // …and taking one back trims round 2, leaving round 1's dish alone.
        $this->putJson("/api/orders/{$id}", $this->dineIn($table, [
            ['menu_item_id' => $soup->id, 'quantity' => 2],
        ]))->assertOk();

        $order = Order::find($id)->load('rounds.items');
        $this->assertSame(2, $order->rounds()->count());
        $this->assertSame(1, (int) $order->rounds[0]->items->sum('quantity'));
        $this->assertSame(1, (int) $order->rounds[1]->items->sum('quantity'));
        $this->assertSame('10.00', $order->total);
    }

    public function test_each_round_carries_its_own_cook_and_clock(): void
    {
        $table = Table::create(['name' => 'E5', 'seats' => 4, 'type' => 'normal', 'status' => 'available']);
        $soup = MenuItem::factory()->create(['price' => 5]);
        $cake = MenuItem::factory()->create(['price' => 3]);
        $bopha = Chef::create(['name' => 'Bopha', 'is_active' => true, 'sort_order' => 1]);
        $rithy = Chef::create(['name' => 'Rithy', 'is_active' => true, 'sort_order' => 2]);

        Sanctum::actingAs($this->staff('waiter'));
        $id = $this->postJson('/api/orders', $this->dineIn($table, [
            ['menu_item_id' => $soup->id, 'quantity' => 1],
        ]))->assertCreated()->json('id');
        $this->putJson("/api/orders/{$id}", $this->dineIn($table, [
            ['menu_item_id' => $soup->id, 'quantity' => 1],
            ['menu_item_id' => $cake->id, 'quantity' => 1],
        ]))->assertOk();

        Sanctum::actingAs($this->staff('kitchen'));
        [$r1, $r2] = array_column($this->getJson('/api/kitchen/tickets')->json(), 'id');

        $this->putJson("/api/kitchen/tickets/{$r1}", ['status' => 'preparing', 'chef_id' => $bopha->id])
            ->assertOk()->assertJsonPath('chef.id', $bopha->id);
        $this->putJson("/api/kitchen/tickets/{$r2}", ['status' => 'preparing', 'chef_id' => $rithy->id])
            ->assertOk()->assertJsonPath('chef.id', $rithy->id);

        // Two cooks on one bill, each timed on their own round.
        $order = Order::find($id)->load('rounds');
        $this->assertSame($bopha->id, $order->rounds[0]->chef_id);
        $this->assertSame($rithy->id, $order->rounds[1]->chef_id);
        $this->assertNotNull($order->rounds[0]->started_at);
        $this->assertNotNull($order->rounds[1]->started_at);

        // The bill only reads "ready" once every round has left the pass.
        $this->putJson("/api/kitchen/tickets/{$r1}", ['status' => 'ready'])->assertOk();
        $this->assertSame('preparing', Order::find($id)->status);
        $this->putJson("/api/kitchen/tickets/{$r2}", ['status' => 'ready'])->assertOk();
        $this->assertSame('ready', Order::find($id)->status);
    }

    public function test_the_board_is_readable_by_staff_but_closed_bills_are_off_it(): void
    {
        $table = Table::create(['name' => 'E6', 'seats' => 4, 'type' => 'normal', 'status' => 'available']);
        $soup = MenuItem::factory()->create(['price' => 5]);

        Sanctum::actingAs($this->staff('cashier'));
        $id = $this->postJson('/api/orders', $this->dineIn($table, [
            ['menu_item_id' => $soup->id, 'quantity' => 1],
        ]))->assertCreated()->json('id');

        Sanctum::actingAs($this->staff('waiter'));
        $ticket = $this->getJson('/api/kitchen/tickets')->assertOk()->assertJsonCount(1)->json('0.id');

        Order::find($id)->update(['status' => 'cancelled']);

        Sanctum::actingAs($this->staff('kitchen'));
        $this->getJson('/api/kitchen/tickets')->assertOk()->assertJsonCount(0);
        $this->putJson("/api/kitchen/tickets/{$ticket}", ['status' => 'ready'])->assertStatus(422);
    }
}
