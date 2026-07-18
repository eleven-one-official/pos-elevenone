<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Fields the Odoo-style admin product form edits. product_type mirrors Odoo's
// detailed_type values: consu (consumable), product (storable), service.
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('menu_items', function (Blueprint $table) {
            $table->string('product_type', 10)->default('consu')->after('category_id');
            $table->boolean('can_be_sold')->default(true)->after('is_available');
            $table->boolean('can_be_purchased')->default(false)->after('can_be_sold');
            $table->boolean('is_archived')->default(false)->after('can_be_purchased');
            $table->decimal('cost', 10, 2)->default(0)->after('price');
            $table->string('barcode')->nullable()->after('image');
            $table->string('internal_reference')->nullable()->after('barcode');
            $table->text('internal_notes')->nullable()->after('internal_reference');
        });
    }

    public function down(): void
    {
        Schema::table('menu_items', function (Blueprint $table) {
            $table->dropColumn([
                'product_type',
                'can_be_sold',
                'can_be_purchased',
                'is_archived',
                'cost',
                'barcode',
                'internal_reference',
                'internal_notes',
            ]);
        });
    }
};
