<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Level the garden's rows: the coordinates read off the Odoo designer had
 * each row's tables at slightly different heights (3/6/4/3/4, 42/40/37 and
 * 75/72/68) which looks like a mistake on screen — line each row up and give
 * it equal horizontal gaps. The bottom row sits at y=75 so G20 stays clear
 * of the tall G12 pill, which reaches down to y=74.
 */
return new class extends Migration
{
    private const BKK = 2;

    /** name => [x%, y%]. */
    private const ALIGNED = [
        'G13' => [1, 4], 'G14' => [15, 4], 'G15' => [29, 4], 'G16' => [43, 4], 'G17' => [57, 4],
        'G24' => [32, 40], 'G23' => [45, 40], 'G22' => [58, 40],
        'G20' => [7, 75], 'G19' => [32.5, 75], 'G18' => [58, 75],
    ];

    /** name => [x%, y%]. */
    private const ORIGINAL = [
        'G13' => [1, 3], 'G14' => [15, 6], 'G15' => [29, 4], 'G16' => [43, 3], 'G17' => [56, 4],
        'G24' => [32, 42], 'G23' => [45, 40], 'G22' => [58, 37],
        'G20' => [7, 75], 'G19' => [34, 72], 'G18' => [58, 68],
    ];

    public function up(): void
    {
        $this->apply(self::ALIGNED);
    }

    public function down(): void
    {
        $this->apply(self::ORIGINAL);
    }

    private function apply(array $layout): void
    {
        foreach ($layout as $name => $pos) {
            DB::table('tables')->where('branch_id', self::BKK)->where('name', $name)
                ->update(['pos_x' => $pos[0], 'pos_y' => $pos[1]]);
        }
    }
};
