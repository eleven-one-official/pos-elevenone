<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Pricelists for the Odoo-style admin: a header (name/currency/policy) plus
// price rules. A rule pins a fixed price for one product — or all of them —
// above a minimum quantity, optionally within a date range.
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('pricelists', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('currency', 3)->default('USD');
            // 'included' = discount folded into the price; 'public' = show
            // the public price and the discount separately.
            $table->string('discount_policy', 10)->default('included');
            $table->timestamps();
        });

        Schema::create('pricelist_rules', function (Blueprint $table) {
            $table->id();
            $table->foreignId('pricelist_id')->constrained('pricelists')->cascadeOnDelete();
            $table->foreignId('menu_item_id')->nullable()->constrained('menu_items')->nullOnDelete();
            $table->unsignedInteger('min_quantity')->default(1);
            $table->decimal('fixed_price', 10, 2);
            $table->date('date_start')->nullable();
            $table->date('date_end')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('pricelist_rules');
        Schema::dropIfExists('pricelists');
    }
};
