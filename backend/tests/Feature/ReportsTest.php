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
        // Refunded money must not count.
        Payment::factory()->create(['order_id' => $done->id, 'amount' => 5, 'status' => 'refunded']);
        // Open orders don't count as sales yet.
        Order::factory()->create(['subtotal' => 99, 'total' => 99]);
        Sanctum::actingAs($this->staff('manager'));

        $res = $this->getJson('/api/reports/daily-sales')->assertOk();

        $this->assertSame(1, $res->json('orders_count'));
        $this->assertEqualsWithDelta(20.0, (float) $res->json('net_sales'), 0.001);
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
}
