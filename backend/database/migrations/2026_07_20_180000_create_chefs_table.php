<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * The roster of kitchen cooks. The Kitchen Display signs in on one shared
     * PIN-less station account, so it can't tell who cooked what — the cook
     * picks their name when they tap "Start" on a ticket. That attribution is
     * what the Chef Performance KPI report counts. Managed from the admin side
     * (Configuration › Chefs); the picker on the display shows the active ones.
     */
    public function up(): void
    {
        Schema::create('chefs', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->boolean('is_active')->default(true);
            $table->integer('sort_order')->default(0);
            $table->timestamps();
        });

        // Production deploys run `migrate` and NOT the seeders, so a starter
        // roster is seeded here (mirrors ChefSeeder) — the display is usable the
        // moment the feature ships; an admin renames/deactivates from there.
        // DB-level upsert so it stays idempotent and skips model-event auditing.
        $now = now();
        foreach (['Bopha', 'Rithy', 'Vichea'] as $i => $name) {
            DB::table('chefs')->updateOrInsert(
                ['name' => $name],
                ['is_active' => true, 'sort_order' => $i + 1, 'updated_at' => $now, 'created_at' => $now],
            );
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('chefs');
    }
};
