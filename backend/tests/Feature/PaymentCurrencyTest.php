<?php

namespace Tests\Feature;

use App\Models\Order;
use App\Models\PaymentMethod;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\CreatesStaff;
use Tests\TestCase;

class PaymentCurrencyTest extends TestCase
{
    use CreatesStaff, RefreshDatabase;

    public function test_payment_records_journal_currency_and_rate(): void
    {
        $order = Order::factory()->create(['subtotal' => 10, 'total' => 10]);
        $journal = PaymentMethod::create(['label' => 'Cash KHR', 'channel' => 'cash']);
        Sanctum::actingAs($this->staff('cashier'));

        $this->postJson('/api/payments', [
            'order_id' => $order->id,
            'method' => 'cash',
            'payment_method_id' => $journal->id,
            'amount' => 10.00, // USD base — the guest handed over 41 000 riel
            'currency' => 'KHR',
            'exchange_rate' => 4100,
        ])
            ->assertCreated()
            ->assertJsonPath('currency', 'KHR')
            ->assertJsonPath('payment_method_id', $journal->id)
            ->assertJsonPath('exchange_rate', '4100.00');
    }

    public function test_khr_payment_without_a_rate_is_rejected(): void
    {
        $order = Order::factory()->create(['subtotal' => 10, 'total' => 10]);
        Sanctum::actingAs($this->staff('cashier'));

        $this->postJson('/api/payments', [
            'order_id' => $order->id,
            'method' => 'cash',
            'amount' => 10.00,
            'currency' => 'KHR',
        ])->assertStatus(422);
    }

    public function test_currency_defaults_to_usd(): void
    {
        $order = Order::factory()->create(['subtotal' => 10, 'total' => 10]);
        Sanctum::actingAs($this->staff('cashier'));

        $this->postJson('/api/payments', [
            'order_id' => $order->id,
            'method' => 'khqr',
            'amount' => 10.00,
        ])
            ->assertCreated()
            ->assertJsonPath('currency', 'USD');
    }
}
