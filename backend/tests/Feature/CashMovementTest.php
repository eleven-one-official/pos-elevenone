<?php

namespace Tests\Feature;

use App\Models\CashMovement;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\CreatesStaff;
use Tests\TestCase;

class CashMovementTest extends TestCase
{
    use CreatesStaff, RefreshDatabase;

    public function test_cashier_records_and_lists_todays_movements(): void
    {
        Sanctum::actingAs($this->staff('cashier', ['name' => 'Sok']));

        $this->postJson('/api/cash-movements', [
            'type' => 'in', 'amount' => 25.50, 'reason' => 'Change added',
        ])
            ->assertCreated()
            ->assertJsonPath('reason', 'Change added')
            ->assertJsonPath('user.name', 'Sok');

        // Another terminal (another cashier) sees the same drawer log.
        Sanctum::actingAs($this->staff('cashier'));
        $this->getJson('/api/cash-movements')
            ->assertOk()
            ->assertJsonCount(1)
            ->assertJsonFragment(['reason' => 'Change added']);
    }

    public function test_list_is_scoped_to_the_requested_day(): void
    {
        CashMovement::create([
            'type' => 'out', 'amount' => 10, 'reason' => 'Bank drop',
            'business_date' => now()->subDay()->toDateString(),
        ]);
        Sanctum::actingAs($this->staff('cashier'));

        $this->getJson('/api/cash-movements')->assertOk()->assertJsonCount(0);
        $this->getJson('/api/cash-movements?date='.now()->subDay()->toDateString())
            ->assertOk()
            ->assertJsonCount(1);
    }

    public function test_waiter_cannot_touch_the_drawer(): void
    {
        Sanctum::actingAs($this->staff('waiter'));

        $this->getJson('/api/cash-movements')->assertForbidden();
        $this->postJson('/api/cash-movements', [
            'type' => 'in', 'amount' => 5, 'reason' => 'x',
        ])->assertForbidden();
    }

    public function test_movements_land_in_the_audit_trail(): void
    {
        Sanctum::actingAs($this->staff('cashier'));

        $this->postJson('/api/cash-movements', [
            'type' => 'out', 'amount' => 40, 'reason' => 'Supplier payment',
        ])->assertCreated();

        $this->assertDatabaseHas('audit_logs', [
            'event' => 'created',
            'auditable_type' => CashMovement::class,
        ]);
    }
}
