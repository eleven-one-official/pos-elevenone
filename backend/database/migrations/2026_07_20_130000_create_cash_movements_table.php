<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Server-side cash drawer log — the Cash In/Out screen used to keep these
// only in browser state, so terminals couldn't see each other's movements
// and nothing reached the audit trail.
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('cash_movements', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->enum('type', ['in', 'out']);
            $table->decimal('amount', 10, 2);
            $table->string('reason');
            // The drawer day this movement belongs to — the list filters on it.
            $table->date('business_date')->index();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('cash_movements');
    }
};
