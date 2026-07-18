<?php

namespace Tests\Feature;

use App\Models\Customer;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\CreatesStaff;
use Tests\TestCase;

class CustomerTest extends TestCase
{
    use CreatesStaff, RefreshDatabase;

    // ------------------------------------------------------------------
    // Directory reads + walk-in creation — open to cashiers
    // ------------------------------------------------------------------

    public function test_cashier_lists_and_searches_customers(): void
    {
        Customer::create(['name' => 'Chan Vuthy', 'phone' => '012345678']);
        Customer::create(['name' => 'Sok Dara', 'phone' => '098765432']);
        Sanctum::actingAs($this->staff('cashier'));

        $this->getJson('/api/customers')->assertOk()->assertJsonCount(2);

        // ?search= matches name or phone.
        $this->getJson('/api/customers?search=vuthy')
            ->assertOk()->assertJsonCount(1)->assertJsonFragment(['name' => 'Chan Vuthy']);
        $this->getJson('/api/customers?search=0987')
            ->assertOk()->assertJsonCount(1)->assertJsonFragment(['name' => 'Sok Dara']);
    }

    public function test_cashier_adds_a_walk_in_customer(): void
    {
        Sanctum::actingAs($this->staff('cashier'));

        $this->postJson('/api/customers', ['name' => 'Walk In', 'phone' => '011222333'])
            ->assertCreated()
            ->assertJsonPath('name', 'Walk In');

        $this->assertDatabaseHas('customers', ['name' => 'Walk In']);
    }

    public function test_create_requires_a_name_and_valid_email(): void
    {
        Sanctum::actingAs($this->staff('cashier'));

        $this->postJson('/api/customers', ['phone' => '011222333'])
            ->assertUnprocessable()->assertJsonValidationErrors('name');
        $this->postJson('/api/customers', ['name' => 'X', 'email' => 'not-an-email'])
            ->assertUnprocessable()->assertJsonValidationErrors('email');
    }

    // ------------------------------------------------------------------
    // Edits + deletes — back office only (admin/manager)
    // ------------------------------------------------------------------

    public function test_cashier_cannot_update_or_delete_customers(): void
    {
        $customer = Customer::create(['name' => 'Chan Vuthy']);
        Sanctum::actingAs($this->staff('cashier'));

        $this->putJson("/api/customers/{$customer->id}", ['name' => 'Renamed'])->assertForbidden();
        $this->deleteJson("/api/customers/{$customer->id}")->assertForbidden();
    }

    public function test_manager_updates_a_customer(): void
    {
        $customer = Customer::create(['name' => 'Chan Vuthy']);
        Sanctum::actingAs($this->staff('manager'));

        $this->putJson("/api/customers/{$customer->id}", [
            'name' => 'Chan Vuthy',
            'phone' => '012999888',
            'note' => 'No sugar',
        ])
            ->assertOk()
            ->assertJsonPath('phone', '012999888')
            ->assertJsonPath('note', 'No sugar');
    }

    public function test_admin_deletes_a_customer(): void
    {
        $customer = Customer::create(['name' => 'Chan Vuthy']);
        Sanctum::actingAs($this->staff('admin'));

        $this->deleteJson("/api/customers/{$customer->id}")->assertOk();
        $this->assertDatabaseMissing('customers', ['id' => $customer->id]);
    }
}
