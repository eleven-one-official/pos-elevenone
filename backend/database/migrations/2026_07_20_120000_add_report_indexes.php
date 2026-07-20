<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Indexes for the columns the reports and list filters hit on every load
// (dashboard, daily sales, orders list, catalog). FK columns already carry
// indexes via constrained(); these are the plain filter/sort columns.
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->index('status');
            $table->index('created_at');
            $table->index('order_type');
        });

        Schema::table('payments', function (Blueprint $table) {
            $table->index('status');
            $table->index('method');
            $table->index('created_at');
        });

        Schema::table('menu_items', function (Blueprint $table) {
            $table->index('is_archived');
            $table->index('is_available');
            $table->index('sort_order');
        });
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->dropIndex(['status']);
            $table->dropIndex(['created_at']);
            $table->dropIndex(['order_type']);
        });

        Schema::table('payments', function (Blueprint $table) {
            $table->dropIndex(['status']);
            $table->dropIndex(['method']);
            $table->dropIndex(['created_at']);
        });

        Schema::table('menu_items', function (Blueprint $table) {
            $table->dropIndex(['is_archived']);
            $table->dropIndex(['is_available']);
            $table->dropIndex(['sort_order']);
        });
    }
};
