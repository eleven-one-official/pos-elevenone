<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            // Seated guests on the table. 0 = not recorded (take-away, or
            // orders that predate this column).
            $table->unsignedSmallInteger('guest_count')->default(0)->after('status');
        });
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->dropColumn('guest_count');
        });
    }
};
