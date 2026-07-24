<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The venue now runs two branches (ElevenOne TTP and ElevenOne BKK) on one
 * install, with every branch's data fully separate. Each data table gains a
 * branch_id; every existing row belongs to branch 1 (TTP — the shop that has
 * been trading), and BKK starts empty apart from the config a screen breaks
 * without (store name, KHR rate, payment journals).
 *
 * Users are the one nullable case: NULL means "works at every branch" —
 * admins and the shared station accounts (Waiter / Kitchen / Bar); real staff
 * (cashiers, managers) belong to the branch that hired them.
 */
return new class extends Migration
{
    /** Every table whose rows belong to exactly one branch. */
    private const BRANCH_TABLES = [
        'categories', 'menu_items', 'tables', 'orders', 'order_rounds',
        'payments', 'customers', 'payment_methods', 'pricelists', 'chefs',
        'cash_movements', 'settings', 'audit_logs',
    ];

    /** Roles that stay global (NULL branch): back office + shared stations. */
    private const GLOBAL_ROLE_SLUGS = ['admin', 'waiter', 'kitchen', 'bar'];

    public function up(): void
    {
        Schema::create('branches', function (Blueprint $table) {
            $table->id();
            $table->string('name')->unique();
            $table->timestamps();
        });

        DB::table('branches')->insert([
            ['id' => 1, 'name' => 'ElevenOne TTP', 'created_at' => now(), 'updated_at' => now()],
            ['id' => 2, 'name' => 'ElevenOne BKK', 'created_at' => now(), 'updated_at' => now()],
        ]);

        // Default 1 claims every existing row for TTP, and doubles as a net for
        // any console-side insert that carries no request branch.
        foreach (self::BRANCH_TABLES as $name) {
            Schema::table($name, function (Blueprint $table) {
                $table->foreignId('branch_id')->default(1)
                    ->constrained('branches')->restrictOnDelete();
            });
        }

        Schema::table('users', function (Blueprint $table) {
            $table->foreignId('branch_id')->nullable()
                ->constrained('branches')->nullOnDelete();
        });

        // Existing real staff are TTP hires; NULL role rows stay global too
        // (whereNotIn already skips them).
        DB::table('users')
            ->whereNotIn('role_id', fn ($q) => $q->select('id')->from('roles')
                ->whereIn('slug', self::GLOBAL_ROLE_SLUGS))
            ->update(['branch_id' => 1]);

        // These three uniques were global; each becomes per-branch so both
        // shops can have a "drink" category, a daily ORD-… sequence of their
        // own, and their own copy of every setting key.
        Schema::table('categories', function (Blueprint $table) {
            $table->dropUnique('categories_slug_unique');
            $table->unique(['branch_id', 'slug']);
        });
        Schema::table('orders', function (Blueprint $table) {
            $table->dropUnique('orders_order_number_unique');
            $table->unique(['branch_id', 'order_number']);
        });
        Schema::table('settings', function (Blueprint $table) {
            $table->dropUnique('settings_key_unique');
            $table->unique(['branch_id', 'key']);
        });

        // BKK's starter config: its own name, TTP's rates/float (numbers an
        // admin can change, but without which receipts and the drawer break),
        // and TTP's payment journals. Menu, tables, staff all start empty.
        $now = now();
        $starter = [[
            'branch_id' => 2, 'key' => 'store_name', 'value' => 'ElevenOne BKK',
            'created_at' => $now, 'updated_at' => $now,
        ]];
        $copied = DB::table('settings')->where('branch_id', 1)
            ->whereIn('key', ['currency_khr_rate', 'tax_rate', 'opening_float'])
            ->get(['key', 'value']);
        foreach ($copied as $setting) {
            $starter[] = [
                'branch_id' => 2, 'key' => $setting->key, 'value' => $setting->value,
                'created_at' => $now, 'updated_at' => $now,
            ];
        }
        DB::table('settings')->insert($starter);

        $journals = DB::table('payment_methods')->where('branch_id', 1)
            ->get(['label', 'channel', 'is_active', 'sort_order']);
        foreach ($journals as $journal) {
            DB::table('payment_methods')->insert([
                'branch_id' => 2,
                'label' => $journal->label,
                'channel' => $journal->channel,
                'is_active' => $journal->is_active,
                'sort_order' => $journal->sort_order,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }
    }

    public function down(): void
    {
        // Non-TTP rows must go first or the restored global uniques collide.
        // FK order: money and kitchen rows before orders, order rows before
        // the tables/menu they point at.
        foreach ([
            'payments', 'order_rounds', 'orders', 'menu_items', 'categories',
            'tables', 'customers', 'payment_methods', 'pricelists', 'chefs',
            'cash_movements', 'settings', 'audit_logs',
        ] as $name) {
            DB::table($name)->where('branch_id', '!=', 1)->delete();
        }

        Schema::table('categories', function (Blueprint $table) {
            $table->dropUnique(['branch_id', 'slug']);
            $table->unique('slug');
        });
        Schema::table('orders', function (Blueprint $table) {
            $table->dropUnique(['branch_id', 'order_number']);
            $table->unique('order_number');
        });
        Schema::table('settings', function (Blueprint $table) {
            $table->dropUnique(['branch_id', 'key']);
            $table->unique('key');
        });

        foreach ([...self::BRANCH_TABLES, 'users'] as $name) {
            Schema::table($name, function (Blueprint $table) {
                $table->dropConstrainedForeignId('branch_id');
            });
        }

        Schema::dropIfExists('branches');
    }
};
