<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('payments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->constrained('orders')->cascadeOnDelete();
            $table->enum('method', ['cash', 'aba_qr', 'khqr', 'card'])->default('cash');
            $table->decimal('amount', 10, 2)->default(0);
            $table->decimal('received', 10, 2)->nullable();
            $table->decimal('change', 10, 2)->default(0);
            $table->string('reference')->nullable();
            $table->enum('status', ['pending', 'paid', 'failed', 'refunded'])->default('paid');
            $table->timestamp('paid_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('payments');
    }
};
