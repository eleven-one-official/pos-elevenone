<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * A single dish can be cooked by more than one person — a whole fish goes
     * through the fry and the grill sections at once. Until now the per-dish
     * picker forced one name, so the second cook's work vanished from the Chef
     * Performance KPI. Same move the tickets made in `order_round_chef`: the
     * dish↔cook link becomes many-to-many, and `order_items.chef_id` stays as
     * the *lead* (the first name ticked) so every existing read keeps working.
     */
    public function up(): void
    {
        Schema::create('order_item_chef', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_item_id')->constrained('order_items')->cascadeOnDelete();
            // A removed cook takes their credit with them — the report already
            // folds the gap into "Unknown", like the roster's other links.
            $table->foreignId('chef_id')->constrained('chefs')->cascadeOnDelete();
            $table->timestamps();

            $table->unique(['order_item_id', 'chef_id']);
            // The KPI's other direction: every dish one cook worked on.
            $table->index('chef_id');
        });

        // Backfill: every dish already attributed keeps its cook, now as a
        // one-name crew, so old lines read the same before and after.
        DB::table('order_items')
            ->whereNotNull('chef_id')
            ->orderBy('id')
            ->chunkById(500, function ($items) {
                DB::table('order_item_chef')->insert(
                    collect($items)->map(fn ($item) => [
                        'order_item_id' => $item->id,
                        'chef_id' => $item->chef_id,
                        'created_at' => $item->started_at ?? $item->created_at,
                        'updated_at' => $item->updated_at,
                    ])->all()
                );
            });
    }

    public function down(): void
    {
        Schema::dropIfExists('order_item_chef');
    }
};
