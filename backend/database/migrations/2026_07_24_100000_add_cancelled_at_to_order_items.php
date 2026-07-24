<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * A dish the kitchen struck off — "we can't make this" (out of stock,
     * usually), tapped on the dish itself at the kitchen display. The line
     * stays on the bill as the trace the floor reads ("the kitchen says Fish
     * Amok is off"), but it counts nowhere money or work is counted: the
     * order's totals, the ticket's roll-up, the sales reports and the chef
     * KPI all skip it, and a re-send neither re-fires nor trims it.
     */
    public function up(): void
    {
        Schema::table('order_items', function (Blueprint $table) {
            $table->timestamp('cancelled_at')->nullable()->after('ready_at');
        });
    }

    public function down(): void
    {
        Schema::table('order_items', function (Blueprint $table) {
            $table->dropColumn('cancelled_at');
        });
    }
};
