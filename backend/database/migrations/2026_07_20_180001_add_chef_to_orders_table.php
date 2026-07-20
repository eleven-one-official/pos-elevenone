<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Chef attribution + kitchen-flow timestamps for the Chef Performance KPI.
     * A cook stamps `started_at` (and their `chef_id`) when they tap "Start",
     * then `ready_at` when they tap "Ready" — the gap is the actual cook time.
     * All nullable: pre-feature orders and orders no cook ever picked up simply
     * carry no chef, and dropping a chef just nulls the reference (keeps the
     * order's money history intact).
     */
    public function up(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->foreignId('chef_id')->nullable()->after('user_id')->constrained('chefs')->nullOnDelete();
            $table->timestamp('started_at')->nullable()->after('note');
            $table->timestamp('ready_at')->nullable()->after('started_at');
        });
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->dropConstrainedForeignId('chef_id');
            $table->dropColumn(['started_at', 'ready_at']);
        });
    }
};
