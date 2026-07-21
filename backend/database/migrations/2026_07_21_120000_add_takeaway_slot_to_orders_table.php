<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Take-away orders carry no table, so until now nothing tied a running
 * take-away bill back to the slot (T1…T8) it was started on — the POS floor
 * could never show it again. This column is that binding: the slot number the
 * cashier/waiter tapped, kept only while the bill is a take-away one.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->unsignedTinyInteger('takeaway_slot')->nullable()->after('table_id');
            // The floor polls "open take-away bills" every few seconds.
            $table->index(['takeaway_slot', 'status']);
        });
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->dropIndex(['takeaway_slot', 'status']);
            $table->dropColumn('takeaway_slot');
        });
    }
};
