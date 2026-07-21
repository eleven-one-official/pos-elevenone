<?php

use App\Models\Order;
use App\Models\Table;
use Illuminate\Database\Migrations\Migration;

return new class extends Migration
{
    /**
     * Transferring an order used to move `orders.table_id` without touching
     * `tables.status`, so every transfer left the source table flagged
     * `occupied` for good and never lit up the destination. The floor grid
     * reads its occupied badge from that flag, so those tables showed a badge
     * with no bill — and could never be transferred to again.
     *
     * OrderController::update now keeps the flag in step. This repairs the rows
     * the old behaviour already corrupted, on dev and on the VPS alike (deploys
     * run `migrate`, not the seeders).
     *
     * Derives the flag from the orders themselves rather than guessing:
     * occupied exactly when a live bill sits on the table. `reserved` is a
     * front-of-house booking with no order behind it, so it is left alone.
     */
    public function up(): void
    {
        $seated = Order::whereNotNull('table_id')
            ->whereIn('status', ['new', 'preparing', 'ready', 'served'])
            ->distinct()
            ->pluck('table_id');

        Table::whereIn('id', $seated)
            ->where('status', '!=', 'occupied')
            ->update(['status' => 'occupied']);

        Table::whereNotIn('id', $seated)
            ->where('status', 'occupied')
            ->update(['status' => 'available']);
    }

    /**
     * The previous per-table flags aren't recorded anywhere, and they were
     * wrong by definition — there is nothing meaningful to restore.
     */
    public function down(): void
    {
        //
    }
};
