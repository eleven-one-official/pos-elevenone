<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Fully refunded orders must leave the sales figures without masquerading
     * as cancelled, so the status enum gains a dedicated `refunded` value.
     * Only PaymentController@refund sets it — it is not accepted on the
     * regular order update endpoint.
     */
    public function up(): void
    {
        if (in_array(DB::getDriverName(), ['mysql', 'mariadb'], true)) {
            DB::statement("ALTER TABLE orders MODIFY COLUMN status ENUM('new', 'preparing', 'ready', 'served', 'completed', 'cancelled', 'refunded') NOT NULL DEFAULT 'new'");

            return;
        }

        Schema::table('orders', function (Blueprint $table) {
            $table->enum('status', ['new', 'preparing', 'ready', 'served', 'completed', 'cancelled', 'refunded'])
                ->default('new')
                ->change();
        });
    }

    public function down(): void
    {
        // Rows holding the value being dropped would violate the narrowed enum.
        DB::table('orders')->where('status', 'refunded')->update(['status' => 'completed']);

        if (in_array(DB::getDriverName(), ['mysql', 'mariadb'], true)) {
            DB::statement("ALTER TABLE orders MODIFY COLUMN status ENUM('new', 'preparing', 'ready', 'served', 'completed', 'cancelled') NOT NULL DEFAULT 'new'");

            return;
        }

        Schema::table('orders', function (Blueprint $table) {
            $table->enum('status', ['new', 'preparing', 'ready', 'served', 'completed', 'cancelled'])
                ->default('new')
                ->change();
        });
    }
};
