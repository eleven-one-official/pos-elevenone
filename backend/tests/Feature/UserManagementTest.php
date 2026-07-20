<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\CreatesStaff;
use Tests\TestCase;

class UserManagementTest extends TestCase
{
    use CreatesStaff, RefreshDatabase;

    private function actingAsAdmin(): User
    {
        $admin = $this->staff('admin');
        Sanctum::actingAs($admin);

        return $admin;
    }

    // ------------------------------------------------------------------
    // Authorization
    // ------------------------------------------------------------------

    public function test_non_admins_cannot_touch_staff_management(): void
    {
        Sanctum::actingAs($this->staff('manager'));
        $other = $this->staff('cashier');

        $this->getJson('/api/users')->assertForbidden();
        $this->postJson('/api/users', [])->assertForbidden();
        $this->putJson("/api/users/{$other->id}", [])->assertForbidden();
        $this->deleteJson("/api/users/{$other->id}")->assertForbidden();
        $this->getJson('/api/roles')->assertForbidden();
    }

    public function test_admin_lists_users_with_role_and_pin_flag(): void
    {
        $this->actingAsAdmin();
        $cashier = $this->staff('cashier', ['name' => 'Pin Cashier', 'pin' => '1234']);

        $response = $this->getJson('/api/users')->assertOk();

        $response->assertJsonFragment([
            'id' => $cashier->id,
            'has_pin' => true,
            // Admins see the PIN itself — that's how staff get handed theirs.
            'pin' => '1234',
        ]);
        // Passwords (hashes included) never leave the server.
        $this->assertStringNotContainsString('password', $response->getContent());
    }

    // ------------------------------------------------------------------
    // Create
    // ------------------------------------------------------------------

    public function test_admin_creates_a_cashier_with_a_pin(): void
    {
        $this->actingAsAdmin();

        $response = $this->postJson('/api/users', [
            'name' => 'New Cashier',
            'username' => 'new-cashier',
            'role_id' => $this->role('cashier')->id,
            'password' => 'secret-123',
            'pin' => '5678',
        ]);

        $response->assertCreated()
            ->assertJsonPath('has_pin', true)
            ->assertJsonPath('role.slug', 'cashier');

        $user = User::where('username', 'new-cashier')->firstOrFail();
        $this->assertSame('5678', $user->pin);
        $this->assertTrue(Hash::check('secret-123', $user->password));
    }

    public function test_create_validates_pin_and_password(): void
    {
        $this->actingAsAdmin();
        $base = ['name' => 'X', 'username' => 'x-user', 'password' => 'secret-123'];

        $this->postJson('/api/users', $base + ['pin' => '12'])
            ->assertUnprocessable()->assertJsonValidationErrors('pin');
        $this->postJson('/api/users', $base + ['pin' => 'abcd'])
            ->assertUnprocessable()->assertJsonValidationErrors('pin');
        $this->postJson('/api/users', ['name' => 'X', 'username' => 'x-user', 'password' => 'short'])
            ->assertUnprocessable()->assertJsonValidationErrors('password');
    }

    // ------------------------------------------------------------------
    // Update — PIN semantics: value sets, '' clears, absent keeps
    // ------------------------------------------------------------------

    public function test_update_resets_a_cashier_pin(): void
    {
        $this->actingAsAdmin();
        $cashier = $this->staff('cashier', ['pin' => '1111']);

        $this->putJson("/api/users/{$cashier->id}", ['pin' => '2222'])
            ->assertOk()
            ->assertJsonPath('has_pin', true);

        $this->assertSame('2222', $cashier->fresh()->pin);
    }

    public function test_update_clears_the_pin_with_an_empty_string(): void
    {
        $this->actingAsAdmin();
        $cashier = $this->staff('cashier', ['pin' => '1111']);

        $this->putJson("/api/users/{$cashier->id}", ['pin' => ''])
            ->assertOk()
            ->assertJsonPath('has_pin', false);

        $this->assertNull($cashier->fresh()->pin);
    }

    public function test_update_keeps_the_pin_when_omitted(): void
    {
        $this->actingAsAdmin();
        $cashier = $this->staff('cashier', ['pin' => '1111']);

        $this->putJson("/api/users/{$cashier->id}", ['name' => 'Renamed'])
            ->assertOk()
            ->assertJsonPath('has_pin', true);

        $this->assertSame('1111', $cashier->fresh()->pin);
    }

    // ------------------------------------------------------------------
    // Lock-out guards
    // ------------------------------------------------------------------

    public function test_last_active_admin_cannot_deactivate_themselves(): void
    {
        $admin = $this->actingAsAdmin();

        $this->putJson("/api/users/{$admin->id}", ['is_active' => false])
            ->assertStatus(422);

        $this->assertTrue($admin->fresh()->is_active);
    }

    public function test_last_active_admin_cannot_drop_their_admin_role(): void
    {
        $admin = $this->actingAsAdmin();

        $this->putJson("/api/users/{$admin->id}", ['role_id' => $this->role('cashier')->id])
            ->assertStatus(422);
    }

    public function test_admin_can_be_deactivated_when_another_admin_remains(): void
    {
        $this->actingAsAdmin();
        $secondAdmin = $this->staff('admin');

        $this->putJson("/api/users/{$secondAdmin->id}", ['is_active' => false])
            ->assertOk()
            ->assertJsonPath('is_active', false);
    }

    public function test_admin_cannot_delete_their_own_account(): void
    {
        $admin = $this->actingAsAdmin();

        $this->deleteJson("/api/users/{$admin->id}")->assertStatus(422);
        $this->assertNotNull(User::find($admin->id));
    }

    public function test_admin_deletes_another_user(): void
    {
        $this->actingAsAdmin();
        $cashier = $this->staff('cashier');

        $this->deleteJson("/api/users/{$cashier->id}")->assertOk();
        $this->assertNull(User::find($cashier->id));
    }
}
