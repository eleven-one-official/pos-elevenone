<?php

namespace Tests\Feature;

use App\Models\MenuItem;
use App\Models\Order;
use App\Models\Payment;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\CreatesStaff;
use Tests\TestCase;

class ReportsTest extends TestCase
{
    use CreatesStaff, RefreshDatabase;

    public function test_daily_sales_sums_completed_orders_and_paid_payments(): void
    {
        $done = Order::factory()->completed()->create(['subtotal' => 20, 'total' => 20]);
        Payment::factory()->create(['order_id' => $done->id, 'amount' => 12, 'method' => 'cash']);
        Payment::factory()->create(['order_id' => $done->id, 'amount' => 8, 'method' => 'khqr']);
        // A partial refund on a still-completed order deducts from net sales.
        Payment::factory()->create(['order_id' => $done->id, 'amount' => 5, 'status' => 'refunded']);
        // Open orders don't count as sales yet.
        Order::factory()->create(['subtotal' => 99, 'total' => 99]);
        Sanctum::actingAs($this->staff('manager'));

        $res = $this->getJson('/api/reports/daily-sales')->assertOk();

        $this->assertSame(1, $res->json('orders_count'));
        $this->assertEqualsWithDelta(5.0, (float) $res->json('refunds'), 0.001);
        $this->assertEqualsWithDelta(15.0, (float) $res->json('net_sales'), 0.001);
        $byMethod = collect($res->json('payment_summary'))->keyBy('method');
        $this->assertEqualsWithDelta(12.0, (float) $byMethod['cash']['total'], 0.001);
        $this->assertEqualsWithDelta(8.0, (float) $byMethod['khqr']['total'], 0.001);
        $this->assertArrayNotHasKey('refunded', $byMethod->all());
    }

    public function test_top_items_excludes_cancelled_and_refunded_orders(): void
    {
        $item = MenuItem::factory()->create(['name' => 'Beef Lok Lak']);

        $live = Order::factory()->completed()->create();
        $live->items()->create([
            'menu_item_id' => $item->id, 'name' => $item->name,
            'price' => 5, 'quantity' => 2, 'line_total' => 10,
        ]);

        $dead = Order::factory()->create(['status' => 'cancelled']);
        $dead->items()->create([
            'menu_item_id' => $item->id, 'name' => $item->name,
            'price' => 5, 'quantity' => 50, 'line_total' => 250,
        ]);
        Sanctum::actingAs($this->staff('manager'));

        $res = $this->getJson('/api/reports/top-items')->assertOk();

        $this->assertCount(1, $res->json());
        $this->assertSame(2, (int) $res->json('0.total_quantity'));
    }

    public function test_reports_are_back_office_only(): void
    {
        Sanctum::actingAs($this->staff('cashier'));

        $this->getJson('/api/reports/daily-sales')->assertForbidden();
    }

    public function test_sales_details_filters_by_register_side(): void
    {
        $item = MenuItem::factory()->create(['name' => 'Iced Latte']);
        $waiter = $this->staff('waiter');
        $cashier = $this->staff('cashier');

        $mk = function (int $userId, int $qty) use ($item) {
            $order = Order::factory()->completed()->create([
                'user_id' => $userId, 'subtotal' => 5 * $qty, 'total' => 5 * $qty,
            ]);
            $order->items()->create([
                'menu_item_id' => $item->id, 'name' => $item->name,
                'price' => 5, 'quantity' => $qty, 'line_total' => 5 * $qty,
            ]);
        };
        $mk($waiter->id, 2);
        $mk($cashier->id, 3);

        Sanctum::actingAs($this->staff('manager'));
        $range = 'start='.now()->startOfDay()->toDateTimeString().'&end='.now()->endOfDay()->toDateTimeString();

        $all = $this->getJson("/api/reports/sales-details?{$range}")->assertOk();
        $this->assertSame(5, $all->json('products.0.quantity'));

        $waiterOnly = $this->getJson("/api/reports/sales-details?{$range}&sides=waiter")->assertOk();
        $this->assertSame(2, $waiterOnly->json('products.0.quantity'));

        $cashierOnly = $this->getJson("/api/reports/sales-details?{$range}&sides=cashier")->assertOk();
        $this->assertSame(3, $cashierOnly->json('products.0.quantity'));
    }

    public function test_sales_details_range_honours_the_clients_utc_offset(): void
    {
        // The admin dialog sends the picked wall-clock as an absolute instant.
        // An order at 23:30 UTC is 01:30 the next morning for a +02:00 client,
        // so it belongs to that client's day — and only to that day.
        $item = MenuItem::factory()->create();
        $order = Order::factory()->completed()->create([
            'subtotal' => 8, 'total' => 8, 'created_at' => '2026-07-20 23:30:00',
        ]);
        $order->items()->create([
            'menu_item_id' => $item->id, 'name' => $item->name,
            'price' => 8, 'quantity' => 1, 'line_total' => 8,
        ]);

        Sanctum::actingAs($this->staff('manager'));

        $today = $this->getJson('/api/reports/sales-details?start=2026-07-21T00:00:00%2B02:00&end=2026-07-21T09:29:00%2B02:00')
            ->assertOk();
        $this->assertSame(1, $today->json('orders_count'));

        $yesterday = $this->getJson('/api/reports/sales-details?start=2026-07-20T00:00:00%2B02:00&end=2026-07-20T23:59:00%2B02:00')
            ->assertOk();
        $this->assertSame(0, $yesterday->json('orders_count'));
    }

    public function test_sales_details_shows_partial_refunds_as_a_negative_line(): void
    {
        $item = MenuItem::factory()->create();
        $order = Order::factory()->completed()->create(['subtotal' => 10, 'total' => 10]);
        $order->items()->create([
            'menu_item_id' => $item->id, 'name' => $item->name,
            'price' => 10, 'quantity' => 1, 'line_total' => 10,
        ]);
        Payment::factory()->create(['order_id' => $order->id, 'amount' => 6]);
        Payment::factory()->create(['order_id' => $order->id, 'amount' => 4, 'status' => 'refunded']);

        Sanctum::actingAs($this->staff('manager'));
        $range = 'start='.now()->startOfDay()->toDateTimeString().'&end='.now()->endOfDay()->toDateTimeString();

        $res = $this->getJson("/api/reports/sales-details?{$range}")->assertOk();

        $refundRow = collect($res->json('payments'))->firstWhere('method', 'refunds');
        $this->assertNotNull($refundRow);
        $this->assertEqualsWithDelta(-4.0, (float) $refundRow['amount'], 0.001);
        $this->assertEqualsWithDelta(6.0, (float) $res->json('total'), 0.001);
    }

    public function test_dashboard_deducts_partial_refunds(): void
    {
        $order = Order::factory()->completed()->create(['subtotal' => 30, 'total' => 30]);
        Payment::factory()->create(['order_id' => $order->id, 'amount' => 30]);
        Payment::factory()->create(['order_id' => $order->id, 'amount' => 12, 'status' => 'refunded']);
        Sanctum::actingAs($this->staff('manager'));

        $this->getJson('/api/reports/dashboard')
            ->assertOk()
            ->assertJsonPath('today_sales', 18);
    }
}
