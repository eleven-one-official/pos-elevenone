<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// The venue does not track stock — every product sells regardless of
// inventory, so the counter (and its whole feature) comes out again.
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('menu_items', function (Blueprint $table) {
            $table->dropColumn('stock_quantity');
        });
    }

    public function down(): void
    {
        Schema::table('menu_items', function (Blueprint $table) {
            $table->integer('stock_quantity')->nullable()->after('is_available');
        });
    }
};
