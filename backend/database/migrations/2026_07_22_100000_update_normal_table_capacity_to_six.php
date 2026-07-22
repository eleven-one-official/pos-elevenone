<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::table('tables')
            ->where('type', 'normal')
            ->where('capacity', 4)
            ->update(['capacity' => 6]);
    }

    public function down(): void
    {
        DB::table('tables')
            ->where('type', 'normal')
            ->where('capacity', 6)
            ->update(['capacity' => 4]);
    }
};
