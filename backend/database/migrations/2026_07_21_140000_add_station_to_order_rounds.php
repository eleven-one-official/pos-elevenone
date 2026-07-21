<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Split a round by the station that makes it. Drinks are poured at the bar,
     * not cooked on the line: until now they rode along on the kitchen ticket,
     * so a cook read "2 Iced Coffee" they can't make and the bar learned about
     * an order only when someone shouted it across the room.
     *
     * A send still produces one round *number* — "R2" means the table's second
     * fire, on both screens — but now one round row per station involved, each
     * with its own status, its own clock and its own Ready button. The kitchen
     * board shows kitchen rounds, the bar board bar rounds, and neither sees
     * the other's lines.
     */
    public function up(): void
    {
        Schema::table('order_rounds', function (Blueprint $table) {
            // 'kitchen' or 'bar'. Defaulted so any row written before the
            // backfill (and every historical round) reads as kitchen work.
            $table->string('station', 10)->default('kitchen')->after('round_no');
            // One send can now fire two rounds under the same number — one per
            // station — so the number alone is no longer unique per bill.
            $table->unique(['order_id', 'round_no', 'station']);
            // Each board's one query: its own open rounds, oldest first.
            $table->index(['station', 'status', 'created_at']);
        });

        // Only once the replacement exists: the old unique is the index the
        // order_id foreign key rides on, and MySQL refuses to drop the last
        // index covering a constraint. The new one leads on order_id too, so it
        // takes that job over.
        Schema::table('order_rounds', function (Blueprint $table) {
            $table->dropUnique(['order_id', 'round_no']);
        });

        $drinkItemIds = DB::table('menu_items')
            ->whereIn('category_id', DB::table('categories')->where('slug', 'drink')->pluck('id'))
            ->pluck('id');
        if ($drinkItemIds->isEmpty()) {
            return;
        }

        // Only rounds still on a board are re-routed. Finished ones are history
        // the Chef Performance KPI already counted — re-cutting them would move
        // items out from under a cook's completed ticket.
        $openRounds = DB::table('order_rounds')->whereIn('status', ['new', 'preparing'])->get();

        foreach ($openRounds as $round) {
            $drinkLineIds = DB::table('order_items')
                ->where('order_round_id', $round->id)
                ->whereIn('menu_item_id', $drinkItemIds)
                ->pluck('id');
            if ($drinkLineIds->isEmpty()) {
                continue;
            }

            $lineCount = DB::table('order_items')->where('order_round_id', $round->id)->count();
            if ($lineCount === $drinkLineIds->count()) {
                // Nothing for the kitchen on this one — hand the whole round over.
                DB::table('order_rounds')->where('id', $round->id)->update(['station' => 'bar']);

                continue;
            }

            // Mixed: the drinks leave for a bar round of the same number. It
            // starts fresh ("new", no clock) — whoever was cooking the food was
            // never making these, so the bar still has to pick them up.
            $barRoundId = DB::table('order_rounds')->insertGetId([
                'order_id' => $round->order_id,
                'round_no' => $round->round_no,
                'station' => 'bar',
                'status' => 'new',
                'chef_id' => null,
                'started_at' => null,
                'ready_at' => null,
                'created_at' => $round->created_at,
                'updated_at' => $round->updated_at,
            ]);

            DB::table('order_items')
                ->whereIn('id', $drinkLineIds)
                ->update(['order_round_id' => $barRoundId]);
        }
    }

    public function down(): void
    {
        // Fold the bar rounds back into their kitchen sibling of the same
        // number, so one send is one round again.
        $barRounds = DB::table('order_rounds')->where('station', 'bar')->get();
        foreach ($barRounds as $round) {
            $kitchenRoundId = DB::table('order_rounds')
                ->where('order_id', $round->order_id)
                ->where('round_no', $round->round_no)
                ->where('station', 'kitchen')
                ->value('id');

            if ($kitchenRoundId === null) {
                DB::table('order_rounds')->where('id', $round->id)->update(['station' => 'kitchen']);

                continue;
            }

            DB::table('order_items')
                ->where('order_round_id', $round->id)
                ->update(['order_round_id' => $kitchenRoundId]);
            DB::table('order_rounds')->where('id', $round->id)->delete();
        }

        // Same dance in reverse: the old unique goes back first so the order_id
        // foreign key is never left without an index to stand on.
        Schema::table('order_rounds', function (Blueprint $table) {
            $table->unique(['order_id', 'round_no']);
        });

        Schema::table('order_rounds', function (Blueprint $table) {
            $table->dropIndex(['station', 'status', 'created_at']);
            $table->dropUnique(['order_id', 'round_no', 'station']);
            $table->dropColumn('station');
        });
    }
};
