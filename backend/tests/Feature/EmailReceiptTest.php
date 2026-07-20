<?php

namespace Tests\Feature;

use App\Mail\ReceiptMail;
use App\Models\Customer;
use App\Models\Order;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Laravel\Sanctum\Sanctum;
use Tests\CreatesStaff;
use Tests\TestCase;

class EmailReceiptTest extends TestCase
{
    use CreatesStaff, RefreshDatabase;

    public function test_cashier_emails_a_settled_bill(): void
    {
        Mail::fake();
        $order = Order::factory()->completed()->create();
        Sanctum::actingAs($this->staff('cashier'));

        $this->postJson("/api/orders/{$order->id}/email-receipt", ['email' => 'guest@example.com'])
            ->assertOk();

        Mail::assertSent(ReceiptMail::class, fn (ReceiptMail $mail) => $mail->hasTo('guest@example.com'));
    }

    public function test_defaults_to_the_customer_email(): void
    {
        Mail::fake();
        $customer = Customer::create(['name' => 'Dara', 'email' => 'dara@example.com']);
        $order = Order::factory()->completed()->create(['customer_id' => $customer->id]);
        Sanctum::actingAs($this->staff('cashier'));

        $this->postJson("/api/orders/{$order->id}/email-receipt")->assertOk();

        Mail::assertSent(ReceiptMail::class, fn (ReceiptMail $mail) => $mail->hasTo('dara@example.com'));
    }

    public function test_open_bills_and_missing_addresses_are_rejected(): void
    {
        Mail::fake();
        Sanctum::actingAs($this->staff('cashier'));

        $open = Order::factory()->create();
        $this->postJson("/api/orders/{$open->id}/email-receipt", ['email' => 'guest@example.com'])
            ->assertStatus(422);

        $done = Order::factory()->completed()->create();
        $this->postJson("/api/orders/{$done->id}/email-receipt")->assertStatus(422);

        Mail::assertNothingSent();
    }

    public function test_waiter_cannot_email_receipts(): void
    {
        Mail::fake();
        $order = Order::factory()->completed()->create();
        Sanctum::actingAs($this->staff('waiter'));

        $this->postJson("/api/orders/{$order->id}/email-receipt", ['email' => 'guest@example.com'])
            ->assertForbidden();
    }
}
