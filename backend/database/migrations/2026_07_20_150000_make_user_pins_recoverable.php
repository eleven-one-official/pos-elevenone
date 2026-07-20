<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * PINs move from bcrypt hashes to Laravel encrypted casts so admins can
     * view them on the Employees screen. Encrypted payloads run ~250 chars,
     * so the column becomes text.
     */
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->text('pin')->nullable()->change();
        });

        // Old hashed PINs are one-way — they can't be decrypted or displayed.
        // Clear them; the admin re-enters each staff PIN once in Employees.
        DB::table('users')
            ->where(function ($q) {
                $q->where('pin', 'like', '$2y$%')
                    ->orWhere('pin', 'like', '$2a$%')
                    ->orWhere('pin', 'like', '$2b$%')
                    ->orWhere('pin', 'like', '$argon2%');
            })
            ->update(['pin' => null]);
    }

    public function down(): void
    {
        // Encrypted values can't turn back into hashes; drop them with the column width.
        DB::table('users')->update(['pin' => null]);

        Schema::table('users', function (Blueprint $table) {
            $table->string('pin')->nullable()->change();
        });
    }
};
