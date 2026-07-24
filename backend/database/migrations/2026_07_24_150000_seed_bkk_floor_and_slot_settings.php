<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * BKK's floor, copied from the Odoo install the branch is moving off:
 * Eat In E1–E15 (4 seats) with the private Room 1 (8), VIP1–VIP10 (4), and
 * the garden tables G12–G24 (6 — the venue's numbering, kept so dockets match
 * what staff already call them).
 *
 * Odoo also gave BKK 15 Take Out and 12 Delivery cards; those aren't table
 * rows here (a slot is an order property), so their counts land in the two
 * per-branch settings the floor reads: takeaway_slots and delivery_slots.
 * TTP carries neither key and keeps the defaults (8 / 0 — no Delivery
 * section), so its floor doesn't change.
 *
 * Data migration rather than a seeder because production deploys only run
 * migrate. Every insert skips rows BKK already has, in case staff created
 * some by hand before this deployed.
 */
return new class extends Migration
{
    private const BKK = 2;

    /** @return array<int, array{name: string, type: string, capacity: int}> */
    private function floor(): array
    {
        $tables = [];
        foreach (range(1, 15) as $n) {
            $tables[] = ['name' => "E{$n}", 'type' => 'normal', 'capacity' => 4];
        }
        $tables[] = ['name' => 'Room 1', 'type' => 'normal', 'capacity' => 8];
        foreach (range(1, 10) as $n) {
            $tables[] = ['name' => "VIP{$n}", 'type' => 'vip', 'capacity' => 4];
        }
        foreach (range(12, 24) as $n) {
            $tables[] = ['name' => "G{$n}", 'type' => 'normal', 'capacity' => 6];
        }

        return $tables;
    }

    public function up(): void
    {
        if (! DB::table('branches')->where('id', self::BKK)->exists()) {
            return; // fresh installs without the second branch have no floor to seed
        }

        $now = now();

        $existing = DB::table('tables')->where('branch_id', self::BKK)->pluck('name')->all();
        foreach ($this->floor() as $table) {
            if (in_array($table['name'], $existing, true)) {
                continue;
            }
            DB::table('tables')->insert($table + [
                'branch_id' => self::BKK,
                'status' => 'available',
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }

        foreach (['takeaway_slots' => '15', 'delivery_slots' => '12'] as $key => $value) {
            $has = DB::table('settings')
                ->where('branch_id', self::BKK)->where('key', $key)->exists();
            if (! $has) {
                DB::table('settings')->insert([
                    'branch_id' => self::BKK, 'key' => $key, 'value' => $value,
                    'created_at' => $now, 'updated_at' => $now,
                ]);
            }
        }
    }

    public function down(): void
    {
        DB::table('tables')
            ->where('branch_id', self::BKK)
            ->whereIn('name', array_column($this->floor(), 'name'))
            ->delete();

        DB::table('settings')
            ->where('branch_id', self::BKK)
            ->whereIn('key', ['takeaway_slots', 'delivery_slots'])
            ->delete();
    }
};
