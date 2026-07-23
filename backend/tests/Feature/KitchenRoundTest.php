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

    public function test_two_cooks_share_one_ticket_and_both_are_credited(): void
    {
        $table = Table::create(['name' => 'E8', 'seats' => 4, 'type' => 'normal', 'status' => 'available']);
        $grill = MenuItem::factory()->create(['price' => 9]);
        $wok = MenuItem::factory()->create(['price' => 6]);
        $bopha = Chef::create(['name' => 'Bopha', 'is_active' => true, 'sort_order' => 1]);
        $rithy = Chef::create(['name' => 'Rithy', 'is_active' => true, 'sort_order' => 2]);

        Sanctum::actingAs($this->staff('waiter'));
        $id = $this->postJson('/api/orders', $this->dineIn($table, [
            ['menu_item_id' => $grill->id, 'quantity' => 1],
            ['menu_item_id' => $wok->id, 'quantity' => 1],
        ]))->assertCreated()->json('id');

        // One card, two sections — the cooks tick both names and split it.
        Sanctum::actingAs($this->staff('kitchen'));
        $ticket = $this->getJson('/api/kitchen/tickets')->assertOk()->json('0.id');
        $this->putJson("/api/kitchen/tickets/{$ticket}", [
            'status' => 'preparing',
            'chef_ids' => [$bopha->id, $rithy->id],
        ])
            ->assertOk()
            ->assertJsonCount(2, 'chefs')
            // The first ticked leads, and that is what the bill rolls up to.
            ->assertJsonPath('chef.id', $bopha->id);

        $this->assertSame($bopha->id, Order::find($id)->chef_id);

        // Plating names nobody — it must not wipe the crew off the ticket.
        $this->putJson("/api/kitchen/tickets/{$ticket}", ['status' => 'ready'])->assertOk();
        $this->getJson('/api/kitchen/tickets/history')
            ->assertOk()
            ->assertJsonCount(2, '0.chefs');

        // The KPI credits the shared ticket in full to each of them, so the
        // per-cook rows add up to more than the one ticket the board fired.
        Sanctum::actingAs($this->staff('admin'));
        $report = $this->getJson('/api/reports/chef-performance')->assertOk()->json();
        $this->assertSame(1, $report['overview']['rounds']);
        $this->assertSame(2, $report['overview']['chefs']);
        $this->assertSame(
            ['Bopha' => 1, 'Rithy' => 1],
            collect($report['chefs'])->pluck('rounds', 'chef')->all(),
        );
        $this->assertSame('Bopha + Rithy', $report['details'][0]['chef']);

        // Filtering to one cook keeps the tickets they only shared.
        $this->getJson("/api/reports/chef-performance?chef_id={$rithy->id}")
            ->assertOk()
            ->assertJsonPath('overview.rounds', 1);
    }

    public function test_two_cooks_share_one_dish_and_both_are_credited(): void
    {
        $table = Table::create(['name' => 'E9', 'seats' => 4, 'type' => 'normal', 'status' => 'available']);
        $fish = MenuItem::factory()->create(['price' => 12]);
        $bopha = Chef::create(['name' => 'Bopha', 'is_active' => true, 'sort_order' => 1]);
        $rithy = Chef::create(['name' => 'Rithy', 'is_active' => true, 'sort_order' => 2]);

        Sanctum::actingAs($this->staff('waiter'));
        $this->postJson('/api/orders', $this->dineIn($table, [
            ['menu_item_id' => $fish->id, 'quantity' => 1],
        ]))->assertCreated();

        // One plate through two sections — both names ticked on the dish itself.
        Sanctum::actingAs($this->staff('kitchen'));
        $ticket = $this->getJson('/api/kitchen/tickets')->assertOk()->json('0');
        $this->putJson("/api/kitchen/tickets/{$ticket['id']}/items/{$ticket['items'][0]['id']}", [
            'status' => 'preparing',
            'chef_ids' => [$bopha->id, $rithy->id],
        ])
            ->assertOk()
            ->assertJsonCount(2, 'items.0.chefs')
            // The first ticked leads the dish…
            ->assertJsonPath('items.0.chef.id', $bopha->id)
            // …and the ticket's crew rolls up from its dishes.
            ->assertJsonCount(2, 'chefs')
            ->assertJsonPath('chef.id', $bopha->id)
            ->assertJsonPath('status', 'preparing');

        // Plating names nobody — the crew must survive the Ready tap.
        $this->putJson("/api/kitchen/tickets/{$ticket['id']}/items/{$ticket['items'][0]['id']}", [
            'status' => 'ready',
        ])
            ->assertOk()
            ->assertJsonPath('status', 'ready')
            ->assertJsonCount(2, 'items.0.chefs');

        // The KPI credits the shared dish in full to each of them — on the
        // leaderboard, in the per-cook per-dish cut and on the detail line.
        Sanctum::actingAs($this->staff('admin'));
        $report = $this->getJson('/api/reports/chef-performance')->assertOk()->json();
        $this->assertSame(2, $report['overview']['chefs']);
        $this->assertSame(
            ['Bopha' => 1, 'Rithy' => 1],
            collect($report['chefs'])->pluck('rounds', 'chef')->all(),
        );
        $this->assertSame(
            ['Bopha', 'Rithy'],
            collect($report['by_chef_item'])->pluck('chef')->sort()->values()->all(),
        );
        $this->assertSame('Bopha + Rithy', $report['details'][0]['lines'][0]['chef']);
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

    public function test_history_keeps_todays_plated_tickets_after_they_leave_the_board(): void
    {
        $table = Table::create(['name' => 'E7', 'seats' => 4, 'type' => 'normal', 'status' => 'available']);
        $soup = MenuItem::factory()->create(['price' => 5]);
        $cake = MenuItem::factory()->create(['price' => 3]);
        $chef = Chef::create(['name' => 'Bopha', 'is_active' => true, 'sort_order' => 1]);

        Sanctum::actingAs($this->staff('waiter'));
        $id = $this->postJson('/api/orders', $this->dineIn($table, [
            ['menu_item_id' => $soup->id, 'quantity' => 1],
        ]))->assertCreated()->json('id');
        // A second fire that nobody has plated yet — outstanding work belongs on
        // the board, never in the history.
        $this->putJson("/api/orders/{$id}", $this->dineIn($table, [
            ['menu_item_id' => $soup->id, 'quantity' => 1],
            ['menu_item_id' => $cake->id, 'quantity' => 1],
        ]))->assertOk();

        Sanctum::actingAs($this->staff('kitchen'));
        $this->getJson('/api/kitchen/tickets/history')->assertOk()->assertJsonCount(0);

        [$r1] = array_column($this->getJson('/api/kitchen/tickets')->json(), 'id');
        $this->putJson("/api/kitchen/tickets/{$r1}", ['status' => 'preparing', 'chef_id' => $chef->id])
            ->assertOk();
        $this->putJson("/api/kitchen/tickets/{$r1}", ['status' => 'ready'])->assertOk();

        // Off the board, on the record — with who cooked it and when it went out.
        $this->getJson('/api/kitchen/tickets')->assertOk()->assertJsonCount(1);
        $this->getJson('/api/kitchen/tickets/history')
            ->assertOk()
            ->assertJsonCount(1)
            ->assertJsonPath('0.id', $r1)
            ->assertJsonPath('0.chef.name', 'Bopha')
            ->assertJsonPath('0.order.table.name', 'E7');

        // Paying up closes the bill, but what the kitchen cooked still happened.
        Order::find($id)->update(['status' => 'completed']);
        $this->getJson('/api/kitchen/tickets/history')->assertOk()->assertJsonCount(1);

        // Yesterday's service is a different day's board.
        Order::find($id)->rounds()->where('id', $r1)->update(['ready_at' => now()->subDay()]);
        $this->getJson('/api/kitchen/tickets/history')->assertOk()->assertJsonCount(0);
    }
}
