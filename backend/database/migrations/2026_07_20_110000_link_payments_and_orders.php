<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Wire the money trail together:
// - payments learn which journal took the money (payment_method_id), what
//   currency the guest actually handed over, and the riel rate at that moment.
//   `amount` itself stays in USD — the base currency every report sums.
// - orders learn who they were for (customer_id) and which pricelist priced
//   them (pricelist_id).
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('payments', function (Blueprint $table) {
            $table->foreignId('payment_method_id')
                ->nullable()
                ->after('method')
                ->constrained('payment_methods')
                ->nullOnDelete();
            $table->string('currency', 3)->default('USD')->after('amount');
            // Riel per USD when currency = KHR; null for USD tenders.
            $table->decimal('exchange_rate', 10, 2)->nullable()->after('currency');
        });

        Schema::table('orders', function (Blueprint $table) {
            $table->foreignId('customer_id')
                ->nullable()
                ->after('user_id')
                ->constrained('customers')
                ->nullOnDelete();
            $table->foreignId('pricelist_id')
                ->nullable()
                ->after('customer_id')
                ->constrained('pricelists')
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->dropConstrainedForeignId('pricelist_id');
            $table->dropConstrainedForeignId('customer_id');
        });

        Schema::table('payments', function (Blueprint $table) {
            $table->dropColumn(['currency', 'exchange_rate']);
            $table->dropConstrainedForeignId('payment_method_id');
        });
    }
};
