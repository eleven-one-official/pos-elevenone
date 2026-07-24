<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Where each table sits on its floor tab, as percentages of the canvas, plus
 * an optional shape ('wide' = double-width room card, 'round' = garden pill,
 * 'tall' = full-height pill). Tables without coordinates flow into the plain
 * grid, so TTP's floor keeps its current look untouched.
 *
 * BKK's coordinates are read off their old Odoo floor designer, so the screen
 * mirrors where the tables physically stand: the E block left with VIPs
 * right and the private Room 1 bottom-centre; the garden's scattered pills
 * with the long G12 down the left edge.
 */
return new class extends Migration
{
    private const BKK = 2;

    /** name => [x%, y%, shape]. */
    private const LAYOUT = [
        // BKK Eat In — E block (4 columns) left, VIP block (3 columns) right.
        'E1' => [1, 4], 'E2' => [13, 4], 'E3' => [25, 4], 'E4' => [37, 4],
        'E5' => [1, 27], 'E6' => [13, 27], 'E7' => [25, 27], 'E8' => [37, 27],
        'E9' => [1, 50], 'E10' => [13, 50], 'E11' => [25, 50], 'E12' => [37, 50],
        'E13' => [1, 73], 'E14' => [13, 73], 'E15' => [25, 73],
        'VIP1' => [63, 4], 'VIP2' => [75, 4], 'VIP3' => [87, 4],
        'VIP4' => [63, 27], 'VIP5' => [75, 27], 'VIP6' => [87, 27],
        'VIP7' => [63, 50], 'VIP8' => [75, 50], 'VIP9' => [87, 50],
        'VIP10' => [87, 73],
        'Room 1' => [42, 76, 'wide'],

        // Eat In Gaden — scattered pills; G12 is the long table down the left.
        'G13' => [1, 3, 'round'], 'G14' => [15, 6, 'round'], 'G15' => [29, 4, 'round'],
        'G16' => [43, 3, 'round'], 'G17' => [56, 4, 'round'],
        'G21' => [74, 22, 'round'],
        'G12' => [2, 30, 'tall'],
        'G24' => [32, 42, 'round'], 'G23' => [45, 40, 'round'], 'G22' => [58, 37, 'round'],
        'G20' => [7, 75, 'round'], 'G19' => [34, 72, 'round'], 'G18' => [58, 68, 'round'],
    ];

    public function up(): void
    {
        Schema::table('tables', function (Blueprint $table) {
            $table->decimal('pos_x', 5, 2)->nullable()->after('zone');
            $table->decimal('pos_y', 5, 2)->nullable()->after('pos_x');
            $table->string('shape')->nullable()->after('pos_y');
        });

        foreach (self::LAYOUT as $name => $pos) {
            DB::table('tables')->where('branch_id', self::BKK)->where('name', $name)
                ->update([
                    'pos_x' => $pos[0],
                    'pos_y' => $pos[1],
                    'shape' => $pos[2] ?? null,
                ]);
        }
    }

    public function down(): void
    {
        Schema::table('tables', function (Blueprint $table) {
            $table->dropColumn(['pos_x', 'pos_y', 'shape']);
        });
    }
};
