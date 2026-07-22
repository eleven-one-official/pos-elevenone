<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Per-dish tracking. A ticket used to be taken and plated as a whole — one
     * Start, one Ready, one crew — so nobody could say how long *a dish* took,
     * or which cook actually made it when a card was shared. Now every line
     * carries its own cook and its own two stamps: the kitchen taps the dish,
     * names its maker (starting that dish's clock), and taps Ready on the dish
     * itself when it's plated. The round stays as the ticket the board shows,
     * rolling itself up from its dishes: preparing once any dish is started,
     * ready once every dish is.
     */
    public function up(): void
    {
        Schema::table('order_items', function (Blueprint $table) {
            // Who cooked this dish. Nulled rather than cascaded when a cook
            // leaves the roster — the line (and the bill) must survive them.
            $table->foreignId('chef_id')->nullable()->after('note')
                ->constrained('chefs')->nullOnDelete();
            $table->timestamp('started_at')->nullable()->after('chef_id');
            $table->timestamp('ready_at')->nullable()->after('started_at');
        });

        // Backfill: lines from the ticket-level era inherit their round's lead
        // cook and its two stamps, so old rows read the same as they always
        // did — the ticket's clock was the only clock a dish had back then.
        // Chunked PHP rather than UPDATE…JOIN: the test suite runs on SQLite.
        DB::table('order_rounds')
            ->where(fn ($q) => $q
                ->whereNotNull('chef_id')
                ->orWhereNotNull('started_at')
                ->orWhereNotNull('ready_at'))
            ->orderBy('id')
            ->chunkById(500, function ($rounds) {
                foreach ($rounds as $round) {
                    DB::table('order_items')
                        ->where('order_round_id', $round->id)
                        ->update([
                            'chef_id' => $round->chef_id,
                            'started_at' => $round->started_at,
                            'ready_at' => $round->ready_at,
                        ]);
                }
            });
    }

    public function down(): void
    {
        Schema::table('order_items', function (Blueprint $table) {
            $table->dropConstrainedForeignId('chef_id');
            $table->dropColumn(['started_at', 'ready_at']);
        });
    }
};
