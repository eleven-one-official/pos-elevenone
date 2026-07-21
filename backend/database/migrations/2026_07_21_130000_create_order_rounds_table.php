<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Kitchen rounds. A table orders once, eats, then orders again on the same
     * bill — and the second batch is a *separate job* for the kitchen: its own
     * ticket, its own cook, its own clock. Until now a re-send rewrote the one
     * order's items, so the extra dishes slid into the card already on the pass
     * (no chime, no timer reset) — or vanished entirely when that card had
     * already been bumped.
     *
     * So the bill (`orders`) and the kitchen job (`order_rounds`) split apart:
     * one order still holds one bill for one table, but carries one round per
     * send. `orders.status` becomes the roll-up of its rounds; each round keeps
     * the cook and the timestamps the Chef Performance KPI reads.
     */
    public function up(): void
    {
        Schema::create('order_rounds', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->constrained('orders')->cascadeOnDelete();
            // 1 for the first send, 2 for the next… shown on the ticket as "R2".
            $table->unsignedTinyInteger('round_no')->default(1);
            // Only the kitchen flow lives here — a round is never paid or
            // cancelled on its own, that stays a property of the bill.
            $table->string('status', 20)->default('new');
            $table->foreignId('chef_id')->nullable()->constrained('chefs')->nullOnDelete();
            $table->timestamp('started_at')->nullable();
            $table->timestamp('ready_at')->nullable();
            $table->timestamps();

            $table->unique(['order_id', 'round_no']);
            // The kitchen board's one query: open rounds, oldest first.
            $table->index(['status', 'created_at']);
        });

        Schema::table('order_items', function (Blueprint $table) {
            // Null only for the blink between insert and assignment; every line
            // belongs to the round that fired it. Nulled rather than cascaded on
            // delete so a round can never silently take paid lines with it.
            $table->foreignId('order_round_id')->nullable()->after('order_id')
                ->constrained('order_rounds')->nullOnDelete();
        });

        // Backfill: every existing order becomes a single round 1 holding all
        // its lines, so the board and the KPI read the same before and after.
        DB::table('orders')->orderBy('id')->chunkById(500, function ($orders) {
            foreach ($orders as $order) {
                $roundId = DB::table('order_rounds')->insertGetId([
                    'order_id' => $order->id,
                    'round_no' => 1,
                    // Anything past cooking (served/completed/cancelled) left the
                    // kitchen long ago, so its round is done.
                    'status' => in_array($order->status, ['new', 'preparing'], true)
                        ? $order->status
                        : 'ready',
                    'chef_id' => $order->chef_id,
                    'started_at' => $order->started_at,
                    'ready_at' => $order->ready_at,
                    // The round inherits the order's clock — a ticket that has
                    // been waiting 20 minutes must not reset to "just now".
                    'created_at' => $order->created_at,
                    'updated_at' => $order->updated_at,
                ]);

                DB::table('order_items')
                    ->where('order_id', $order->id)
                    ->update(['order_round_id' => $roundId]);
            }
        });
    }

    public function down(): void
    {
        Schema::table('order_items', function (Blueprint $table) {
            $table->dropConstrainedForeignId('order_round_id');
        });

        Schema::dropIfExists('order_rounds');
    }
};
