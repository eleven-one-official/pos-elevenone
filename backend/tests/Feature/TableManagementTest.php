<?php

namespace Tests\Feature;

use App\Models\Order;
use App\Models\Table;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\CreatesStaff;
use Tests\TestCase;

class TableManagementTest extends TestCase
{
    use CreatesStaff, RefreshDatabase;

    // ------------------------------------------------------------------
    // Reads — every signed-in role sees the floor
    // ------------------------------------------------------------------

    public function test_any_authed_role_can_list_tables(): void
    {
        Table::create(['name' => 'B1', 'type' => 'normal', 'capacity' => 4]);
        Sanctum::actingAs($this->staff('waiter'));

        $this->getJson('/api/tables')
            ->assertOk()
            ->assertJsonCount(1)
            ->assertJsonFragment(['name' => 'B1']);
    }

    public function test_index_carries_guest_count_from_the_open_order(): void
    {
        $table = Table::create([
            'name' => 'B2', 'type' => 'normal', 'capacity' => 4, 'status' => 'occupied',
        ]);
        Order::create([
            'order_number' => 'ORD-TEST-0001',
            'table_id' => $table->id,
            'status' => 'new',
            'guest_count' => 3,
        ]);
        Sanctum::actingAs($this->staff('cashier'));

        $this->getJson('/api/tables')
            ->assertOk()
            ->assertJsonFragment(['name' => 'B2', 'guest_count' => 3]);
    }

    public function test_index_filters_by_type_and_status(): void
    {
        Table::create(['name' => 'B1', 'type' => 'normal', 'capacity' => 4]);
        Table::create(['name' => 'VIP 1', 'type' => 'vip', 'capacity' => 8, 'status' => 'reserved']);
        Sanctum::actingAs($this->staff('cashier'));

        $this->getJson('/api/tables?type=vip')->assertOk()->assertJsonCount(1);
        $this->getJson('/api/tables?status=reserved')->assertOk()->assertJsonCount(1);
    }

    // ------------------------------------------------------------------
    // Writes — back office only (admin/manager)
    // ------------------------------------------------------------------

    public function test_cashier_cannot_manage_tables(): void
    {
        $table = Table::create(['name' => 'B1', 'type' => 'normal', 'capacity' => 4]);
        Sanctum::actingAs($this->staff('cashier'));

        $this->postJson('/api/tables', ['name' => 'B9', 'type' => 'normal'])->assertForbidden();
        $this->deleteJson("/api/tables/{$table->id}")->assertForbidden();
    }

    public function test_manager_creates_a_table(): void
    {
        Sanctum::actingAs($this->staff('manager'));

        $this->postJson('/api/tables', ['name' => 'VIP 3', 'type' => 'vip', 'capacity' => 8])
            ->assertCreated()
            ->assertJsonPath('name', 'VIP 3')
            ->assertJsonPath('type', 'vip');

        $this->assertDatabaseHas('tables', ['name' => 'VIP 3', 'capacity' => 8]);
    }

    public function test_create_rejects_duplicate_names_and_bad_types(): void
    {
        Table::create(['name' => 'B1', 'type' => 'normal', 'capacity' => 4]);
        Sanctum::actingAs($this->staff('manager'));

        $this->postJson('/api/tables', ['name' => 'B1', 'type' => 'normal'])
            ->assertUnprocessable()->assertJsonValidationErrors('name');
        $this->postJson('/api/tables', ['name' => 'B9', 'type' => 'outdoor'])
            ->assertUnprocessable()->assertJsonValidationErrors('type');
    }

    public function test_manager_updates_and_deletes_a_table(): void
    {
        $table = Table::create(['name' => 'B1', 'type' => 'normal', 'capacity' => 4]);
        Sanctum::actingAs($this->staff('manager'));

        $this->putJson("/api/tables/{$table->id}", ['capacity' => 6, 'status' => 'reserved'])
            ->assertOk()
            ->assertJsonPath('capacity', 6)
            ->assertJsonPath('status', 'reserved');

        $this->deleteJson("/api/tables/{$table->id}")->assertOk();
        $this->assertDatabaseMissing('tables', ['id' => $table->id]);
    }
}
