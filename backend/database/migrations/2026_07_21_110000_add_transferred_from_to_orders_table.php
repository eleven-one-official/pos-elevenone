<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Where a transferred bill started out, so the POS header and the kitchen
     * ticket can read "E1 → E2" instead of silently relabelling themselves —
     * a cook who already plated for E1 needs to see the food moved.
     *
     * Holds the *original* table, not the previous hop: E1 → E3 → E7 still
     * reports E1. It stays null for orders that never moved, and is cleared
     * again if the bill is transferred back to where it began.
     */
    public function up(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->foreignId('transferred_from_table_id')
                ->nullable()
                ->after('table_id')
                ->constrained('tables')
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->dropConstrainedForeignId('transferred_from_table_id');
        });
    }
};
