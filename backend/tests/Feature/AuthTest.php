<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\CreatesStaff;
use Tests\TestCase;

class AuthTest extends TestCase
{
    use CreatesStaff, RefreshDatabase;

    // ------------------------------------------------------------------
    // Username + password login
    // ------------------------------------------------------------------

    public function test_login_returns_token_and_user_for_valid_credentials(): void
    {
        $this->staff('admin', ['username' => 'soklim', 'password' => 'secret-123']);

        $response = $this->postJson('/api/login', [
            'username' => 'soklim',
            'password' => 'secret-123',
        ]);

        $response->assertOk()
            ->assertJsonStructure(['token', 'user' => ['id', 'name', 'username', 'role']])
            ->assertJsonPath('user.role.slug', 'admin');
    }

    public function test_login_rejects_wrong_password(): void
    {
        $this->staff('cashier', ['username' => 'dara', 'password' => 'secret-123']);

        $this->postJson('/api/login', ['username' => 'dara', 'password' => 'wrong-pass'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('username');
    }

    public function test_login_rejects_disabled_account(): void
    {
        $this->staff('cashier', [
            'username' => 'dara',
            'password' => 'secret-123',
            'is_active' => false,
        ]);

        $this->postJson('/api/login', ['username' => 'dara', 'password' => 'secret-123'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('username');
    }

    // ------------------------------------------------------------------
    // Tap-a-name roster + PIN login
    // ------------------------------------------------------------------

    public function test_staff_roster_lists_waiters_and_pin_staff_only(): void
    {
        $waiter = $this->staff('waiter', ['name' => 'Waiter']);
        $pinCashier = $this->staff('cashier', ['name' => 'Pin Cashier', 'pin' => '1234']);
        $passwordOnly = $this->staff('cashier', ['name' => 'Password-only Cashier']);
        $goneWaiter = $this->staff('waiter', ['name' => 'Gone Waiter', 'is_active' => false]);

        $response = $this->getJson('/api/staff')->assertOk();

        // Tappable accounts show: PIN-less stations (waiter/kitchen) and any
        // staff with a PIN. (A baseline PIN-less Kitchen account is seeded by
        // migration, so this asserts the filter rules rather than a fixed count.)
        $response->assertJsonFragment(['id' => $waiter->id, 'requires_pin' => false])
            ->assertJsonFragment(['id' => $pinCashier->id, 'requires_pin' => true]);

        // Password-only and inactive accounts never appear.
        $response->assertJsonMissing(['id' => $passwordOnly->id])
            ->assertJsonMissing(['id' => $goneWaiter->id]);

        // Never leak credentials through the public roster.
        $this->assertStringNotContainsString('"pin"', $response->getContent());
        $this->assertStringNotContainsString('password', $response->getContent());
    }

    public function test_staff_login_succeeds_with_correct_pin(): void
    {
        $cashier = $this->staff('cashier', ['pin' => '4321']);

        $this->postJson('/api/staff-login', ['user_id' => $cashier->id, 'pin' => '4321'])
            ->assertOk()
            ->assertJsonStructure(['token', 'user']);
    }

    public function test_staff_login_rejects_wrong_pin(): void
    {
        $cashier = $this->staff('cashier', ['pin' => '4321']);

        $this->postJson('/api/staff-login', ['user_id' => $cashier->id, 'pin' => '9999'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('pin');
    }

    public function test_waiter_taps_in_without_a_pin(): void
    {
        $waiter = $this->staff('waiter');

        $this->postJson('/api/staff-login', ['user_id' => $waiter->id])
            ->assertOk()
            ->assertJsonStructure(['token', 'user']);
    }

    public function test_pinless_non_waiter_cannot_tap_in(): void
    {
        $admin = $this->staff('admin');

        $this->postJson('/api/staff-login', ['user_id' => $admin->id])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('pin');
    }

    // ------------------------------------------------------------------
    // Session lifecycle
    // ------------------------------------------------------------------

    public function test_logout_revokes_the_token(): void
    {
        $user = $this->staff('cashier');
        $token = $user->createToken('pos-token')->plainTextToken;
        $headers = ['Authorization' => 'Bearer '.$token];

        $this->getJson('/api/me', $headers)->assertOk()->assertJsonPath('id', $user->id);
        $this->postJson('/api/logout', [], $headers)->assertOk();

        // The token row is revoked server-side. The guard caches the resolved
        // user within a single app instance, so reset it before re-checking.
        $this->assertDatabaseCount('personal_access_tokens', 0);
        $this->app['auth']->forgetGuards();
        $this->getJson('/api/me', $headers)->assertUnauthorized();
    }

    public function test_protected_routes_require_a_token(): void
    {
        $this->getJson('/api/me')->assertUnauthorized();
        $this->getJson('/api/users')->assertUnauthorized();
    }
}
