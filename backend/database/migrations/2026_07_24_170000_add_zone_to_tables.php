<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Floors ("zones") for the POS table screen. A branch whose tables carry zone
 * names gets an Odoo-style tab per zone — BKK splits into "BKK Eat In" and
 * "Eat In Gaden" (their historical spelling, kept so staff read what they've
 * always read) plus the Take Out / Delivery slot tabs. NULL everywhere (TTP)
 * keeps the classic single-screen floor.
 */
return new class extends Migration
{
    private const BKK = 2;

    public function up(): void
    {
        Schema::table('tables', function (Blueprint $table) {
            $table->string('zone')->nullable()->after('type');
        });

        // BKK's two dine-in floors, mirroring their old Odoo install. The G
        // tables are the garden; everything else eats inside.
        DB::table('tables')->where('branch_id', self::BKK)
            ->where('name', 'like', 'G%')
            ->update(['zone' => 'Eat In Gaden']);
        DB::table('tables')->where('branch_id', self::BKK)
            ->whereNull('zone')
            ->update(['zone' => 'BKK Eat In']);
    }

    public function down(): void
    {
        Schema::table('tables', function (Blueprint $table) {
            $table->dropColumn('zone');
        });
    }
};
