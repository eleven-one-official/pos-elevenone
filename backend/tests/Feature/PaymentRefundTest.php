<?php

namespace Tests\Feature;

use App\Models\Order;
use App\Models\Payment;
use App\Models\Table;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\CreatesStaff;
use Tests\TestCase;

class PaymentRefundTest extends TestCase
{
    use CreatesStaff, RefreshDatabase;

    /** An open dine-in order sitting on an occupied table, ready to be paid. */
    private function openOrder(float $total = 10.00, ?Table $table = null): Order
    {
        $table ??= Table::create([
            'name' => 'B1', 'type' => 'normal', 'capacity' => 4, 'status' => 'occupied',
        ]);

        return Order::create([
            'order_number' => Order::generateOrderNumber(),
            'order_type' => 'dine_in',
            'table_id' => $table->id,
            'status' => 'new',
            'subtotal' => $total,
            'discount' => 0,
            'tax' => 0,
            'total' => $total,
        ]);
    }

    private function pay(Order $order, float $amount): Payment
    {
        return Payment::create([
            'order_id' => $order->id,
            'method' => 'cash',
            'amount' => $amount,
            'status' => 'paid',
            'paid_at' => now(),
        ]);
    }

    // ------------------------------------------------------------------
    // Recording payments
    // ------------------------------------------------------------------

    public function test_full_payment_completes_the_order_and_frees_the_table(): void
    {
        $order = $this->openOrder(12.50);
        Sanctum::actingAs($this->staff('cashier'));

        $this->postJson('/api/payments', [
            'order_id' => $order->id, 'method' => 'cash', 'amount' => 12.50,
        ])->assertCreated();

        $this->assertSame('completed', $order->fresh()->status);
        $this->assertSame('available', $order->table->fresh()->status);
    }

    public function test_completed_order_rejects_a_second_payment(): void
    {
        $order = $this->openOrder(10.00);
        Sanctum::actingAs($this->staff('cashier'));

        $this->postJson('/api/payments', [
            'order_id' => $order->id, 'method' => 'cash', 'amount' => 10.00,
        ])->assertCreated();

        $this->postJson('/api/payments', [
            'order_id' => $order->id, 'method' => 'cash', 'amount' => 10.00,
        ])->assertStatus(422);

        $this->assertSame(1, $order->payments()->count());
    }

    public function test_fully_paid_but_uncompleted_order_rejects_more_money(): void
    {
        // complete_order=false leaves the status open — the paid-total guard
        // still has to stop another tender from landing on top.
        $order = $this->openOrder(10.00);
        Sanctum::actingAs($this->staff('cashier'));

        $this->postJson('/api/payments', [
            'order_id' => $order->id, 'method' => 'cash', 'amount' => 10.00, 'complete_order' => false,
        ])->assertCreated();

        $this->postJson('/api/payments', [
            'order_id' => $order->id, 'method' => 'khqr', 'amount' => 5.00,
        ])->assertStatus(422);
    }

    public function test_cancelled_order_takes_no_payment(): void
    {
        $order = $this->openOrder(10.00);
        $order->update(['status' => 'cancelled']);
        Sanctum::actingAs($this->staff('cashier'));

        $this->postJson('/api/payments', [
            'order_id' => $order->id, 'method' => 'cash', 'amount' => 10.00,
        ])->assertStatus(422);
    }

    public function test_split_payments_settle_an_order_in_stages(): void
    {
        $order = $this->openOrder(20.00);
        Sanctum::actingAs($this->staff('cashier'));

        $this->postJson('/api/payments', [
            'order_id' => $order->id, 'method' => 'cash', 'amount' => 8.00,
        ])->assertCreated();
        $this->assertSame('new', $order->fresh()->status);

        $this->postJson('/api/payments', [
            'order_id' => $order->id, 'method' => 'khqr', 'amount' => 12.00,
        ])->assertCreated();
        $this->assertSame('completed', $order->fresh()->status);
    }

    // ------------------------------------------------------------------
    // Refunds
    // ------------------------------------------------------------------

    public function test_refunding_the_only_payment_marks_the_order_refunded(): void
    {
        $order = $this->openOrder(10.00);
        $order->update(['status' => 'completed']);
        $payment = $this->pay($order, 10.00);
        Sanctum::actingAs($this->staff('manager'));

        $this->postJson("/api/payments/{$payment->id}/refund", ['reason' => 'guest complaint'])
            ->assertOk()
            ->assertJsonFragment(['status' => 'refunded']);

        $this->assertSame('refunded', $payment->fresh()->status);
        $this->assertSame('refunded', $order->fresh()->status);
    }

    public function test_partial_refund_keeps_the_order_completed(): void
    {
        $order = $this->openOrder(20.00);
        $order->update(['status' => 'completed']);
        $first = $this->pay($order, 8.00);
        $this->pay($order, 12.00);
        Sanctum::actingAs($this->staff('manager'));

        $this->postJson("/api/payments/{$first->id}/refund")->assertOk();

        $this->assertSame('refunded', $first->fresh()->status);
        $this->assertSame('completed', $order->fresh()->status);
    }

    public function test_refund_is_a_supervisor_action(): void
    {
        $order = $this->openOrder(10.00);
        $order->update(['status' => 'completed']);
        $payment = $this->pay($order, 10.00);
        Sanctum::actingAs($this->staff('cashier'));

        $this->postJson("/api/payments/{$payment->id}/refund")->assertForbidden();
    }

    public function test_refunded_payment_cannot_be_refunded_twice(): void
    {
        $order = $this->openOrder(10.00);
        $order->update(['status' => 'completed']);
        $payment = $this->pay($order, 10.00);
        $payment->update(['status' => 'refunded']);
        Sanctum::actingAs($this->staff('manager'));

        $this->postJson("/api/payments/{$payment->id}/refund")->assertStatus(422);
    }

    public function test_refunded_order_leaves_the_sales_figures(): void
    {
        $order = $this->openOrder(15.00);
        $order->update(['status' => 'completed']);
        $payment = $this->pay($order, 15.00);
        Sanctum::actingAs($this->staff('manager'));

        $this->getJson('/api/reports/dashboard')
            ->assertOk()
            ->assertJsonPath('today_sales', 15);

        $this->postJson("/api/payments/{$payment->id}/refund")->assertOk();

        $this->getJson('/api/reports/dashboard')
            ->assertOk()
            ->assertJsonPath('today_sales', 0);
    }
}
