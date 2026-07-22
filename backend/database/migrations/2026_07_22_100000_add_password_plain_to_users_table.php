<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * A recoverable (encrypted) copy of each password so admins can view it on
     * the Employees screen — mirrors how PINs became viewable. The `password`
     * column stays a one-way bcrypt hash for login; this column only feeds the
     * admin display. Encrypted payloads run ~250 chars, so it's text.
     *
     * Existing passwords predate this copy and stay null (bcrypt can't be
     * reversed) until the admin resets each one on the Employees screen.
     */
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->text('password_plain')->nullable()->after('password');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('password_plain');
        });
    }
};
