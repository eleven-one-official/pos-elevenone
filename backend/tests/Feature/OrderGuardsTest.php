<?php

namespace Tests\Feature;

use App\Models\MenuItem;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\CreatesStaff;
use Tests\TestCase;

class OrderGuardsTest extends TestCase
{
    use CreatesStaff, RefreshDatabase;

    private function payload(MenuItem $item, array $extra = []): array
    {
        return $extra + [
            'order_type' => 'take_away',
            'items' => [['menu_item_id' => $item->id, 'quantity' => 1]],
        ];
    }

    /** Create an order over the API as the given role; returns its id. */
    private function makeOrder(MenuItem $item, string $role = 'cashier'): int
    {
        Sanctum::actingAs($this->staff($role));

        return $this->postJson('/api/orders', $this->payload($item))->assertCreated()->json('id');
    }

    // ------------------------------------------------------------------
    // Role gates
    // ------------------------------------------------------------------

    public function test_kitchen_reads_orders_and_advances_status_only(): void
    {
        $item = MenuItem::factory()->create();
        $id = $this->makeOrder($item);

        Sanctum::actingAs($this->staff('kitchen'));
        // The kitchen display reads the queue and bumps tickets through the
        // cooking flow — but never creates an order or edits its contents.
        $this->getJson('/api/orders')->assertOk();
        $this->postJson('/api/orders', $this->payload($item))->assertForbidden();

        // Advancing status within the kitchen flow is allowed…
        $this->putJson("/api/orders/{$id}", ['status' => 'preparing'])->assertOk();
        $this->putJson("/api/orders/{$id}", ['status' => 'ready'])->assertOk();

        // …but nothing else: no item edits, no discounts, no closing the bill.
        $this->putJson("/api/orders/{$id}", $this->payload($item))->assertForbidden();
        $this->putJson("/api/orders/{$id}", ['discount' => 1])->assertForbidden();
        $this->putJson("/api/orders/{$id}", ['status' => 'completed'])->assertForbidden();
        $this->putJson("/api/orders/{$id}", ['status' => 'cancelled'])->assertForbidden();
    }

    public function test_waiter_cannot_apply_or_change_discounts(): void
    {
        $item = MenuItem::factory()->create(['price' => 5.00]);

        Sanctum::actingAs($this->staff('waiter'));
        $this->postJson('/api/orders', $this->payload($item, ['discount' => 1]))->assertForbidden();

        $id = $this->postJson('/api/orders', $this->payload($item))->assertCreated()->json('id');
        $this->putJson("/api/orders/{$id}", ['discount' => 2])->assertForbidden();
        // Kitchen-flow updates stay open to waiters.
        $this->putJson("/api/orders/{$id}", ['status' => 'preparing'])->assertOk();
    }

    public function test_waiter_cannot_close_or_cancel_an_order(): void
    {
        $item = MenuItem::factory()->create();
        Sanctum::actingAs($this->staff('waiter'));
        $id = $this->postJson('/api/orders', $this->payload($item))->assertCreated()->json('id');

        $this->putJson("/api/orders/{$id}", ['status' => 'completed'])->assertForbidden();
        $this->putJson("/api/orders/{$id}", ['status' => 'cancelled'])->assertForbidden();
    }

    // ------------------------------------------------------------------
    // Completing needs the money
    // ------------------------------------------------------------------

    public function test_cashier_cannot_complete_an_unpaid_order_directly(): void
    {
        $item = MenuItem::factory()->create(['price' => 10.00]);
        $id = $this->makeOrder($item);

        $this->putJson("/api/orders/{$id}", ['status' => 'completed'])->assertStatus(422);
    }

    public function test_cashier_completes_once_payments_cover_the_bill(): void
    {
        $item = MenuItem::factory()->create(['price' => 10.00]);
        $id = $this->makeOrder($item);

        // complete_order=false leaves the status open — the POS's split flow
        // then closes it explicitly (possibly a rounding cent short).
        $this->postJson('/api/payments', [
            'order_id' => $id, 'method' => 'cash', 'amount' => 9.99, 'complete_order' => false,
        ])->assertCreated();

        $this->putJson("/api/orders/{$id}", ['status' => 'completed'])
            ->assertOk()
            ->assertJsonPath('status', 'completed');
    }

    // ------------------------------------------------------------------
    // Closed orders are immutable
    // ------------------------------------------------------------------

    /** Create + fully pay an order as a cashier; returns its id (status completed). */
    private function paidOrder(MenuItem $item): int
    {
        $id = $this->makeOrder($item);
        $this->postJson('/api/payments', [
            'order_id' => $id, 'method' => 'cash', 'amount' => (float) $item->price,
        ])->assertCreated();

        return $id;
    }

    public function test_paid_order_items_and_discount_cannot_be_edited(): void
    {
        $item = MenuItem::factory()->create(['price' => 10.00]);
        $id = $this->paidOrder($item);

        $this->putJson("/api/orders/{$id}", [
            'items' => [['menu_item_id' => $item->id, 'quantity' => 5]],
        ])->assertStatus(422);

        $this->putJson("/api/orders/{$id}", ['discount' => 3])->assertStatus(422);

        // Even the back office edits history through refunds, not rewrites.
        Sanctum::actingAs($this->staff('admin'));
        $this->putJson("/api/orders/{$id}", [
            'items' => [['menu_item_id' => $item->id, 'quantity' => 5]],
        ])->assertStatus(422);
    }

    public function test_idempotent_completed_ping_after_final_split_passes(): void
    {
        $item = MenuItem::factory()->create(['price' => 10.00]);
        $id = $this->paidOrder($item);

        // The POS sends this right after the final split payment already
        // completed the order — a no-op, not an edit.
        $this->putJson("/api/orders/{$id}", ['status' => 'completed'])
            ->assertOk()
            ->assertJsonPath('status', 'completed');
    }

    public function test_back_office_can_correct_the_status_of_a_closed_order(): void
    {
        $item = MenuItem::factory()->create(['price' => 10.00]);
        $id = $this->paidOrder($item);

        Sanctum::actingAs($this->staff('manager'));
        $this->putJson("/api/orders/{$id}", ['status' => 'cancelled'])
            ->assertOk()
            ->assertJsonPath('status', 'cancelled');

        // Cashiers get no such correction power.
        Sanctum::actingAs($this->staff('cashier'));
        $this->putJson("/api/orders/{$id}", ['status' => 'served'])->assertStatus(422);
    }

    // ------------------------------------------------------------------
    // Discount ceiling
    // ------------------------------------------------------------------

    public function test_a_table_carries_only_one_open_order(): void
    {
        $item = MenuItem::factory()->create();
        $table = \App\Models\Table::factory()->create();
        Sanctum::actingAs($this->staff('cashier'));

        $dineIn = ['order_type' => 'dine_in', 'table_id' => $table->id];
        $this->postJson('/api/orders', $this->payload($item, $dineIn))->assertCreated();
        $this->postJson('/api/orders', $this->payload($item, $dineIn))->assertStatus(422);
    }

    public function test_discount_cannot_exceed_the_subtotal(): void
    {
        $item = MenuItem::factory()->create(['price' => 5.00]);
        Sanctum::actingAs($this->staff('cashier'));

        $this->postJson('/api/orders', $this->payload($item, ['discount' => 9.99]))->assertStatus(422);

        // A full 100% discount is still legitimate.
        $this->postJson('/api/orders', $this->payload($item, ['discount' => 5.00]))
            ->assertCreated()
            ->assertJsonPath('total', '0.00');
    }
}
