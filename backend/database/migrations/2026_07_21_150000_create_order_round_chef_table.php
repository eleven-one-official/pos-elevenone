<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * A ticket can be cooked by more than one person. One card often carries a
     * grill dish and a wok dish, and two cooks split it between them — until now
     * the board made them pick a single name, so whoever tapped it took the
     * credit for the other's work in the Chef Performance KPI.
     *
     * So the round↔cook link becomes many-to-many. `order_rounds.chef_id` stays,
     * now meaning the *lead* cook (the first one picked): it is what the bill
     * rolls up to, so the floor still has one person to ask about a table.
     */
    public function up(): void
    {
        Schema::create('order_round_chef', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_round_id')->constrained('order_rounds')->cascadeOnDelete();
            // A removed cook takes their credit with them, the same as the
            // roster's other links — the report already folds gaps into "Unknown".
            $table->foreignId('chef_id')->constrained('chefs')->cascadeOnDelete();
            $table->timestamps();

            $table->unique(['order_round_id', 'chef_id']);
            // The KPI's other direction: every ticket one cook worked on.
            $table->index('chef_id');
        });

        // Backfill: every ticket already attributed keeps that cook, now as a
        // one-name crew, so the board and the KPI read the same before and after.
        DB::table('order_rounds')
            ->whereNotNull('chef_id')
            ->orderBy('id')
            ->chunkById(500, function ($rounds) {
                DB::table('order_round_chef')->insert(
                    collect($rounds)->map(fn ($round) => [
                        'order_round_id' => $round->id,
                        'chef_id' => $round->chef_id,
                        'created_at' => $round->started_at ?? $round->created_at,
                        'updated_at' => $round->updated_at,
                    ])->all()
                );
            });
    }

    public function down(): void
    {
        Schema::dropIfExists('order_round_chef');
    }
};
