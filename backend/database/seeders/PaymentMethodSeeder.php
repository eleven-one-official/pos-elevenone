<?php

namespace Database\Seeders;

use App\Models\PaymentMethod;
use Illuminate\Database\Seeder;

class PaymentMethodSeeder extends Seeder
{
    public function run(): void
    {
        $methods = [
            ['label' => 'Cash USD', 'channel' => 'cash', 'sort_order' => 1],
            ['label' => 'Cash KHR', 'channel' => 'cash', 'sort_order' => 2],
            ['label' => 'NHAM24Cash', 'channel' => 'cash', 'sort_order' => 3],
            ['label' => 'Wrong Order Dish', 'channel' => 'cash', 'sort_order' => 4],
            ['label' => 'Bloc Cash', 'channel' => 'cash', 'sort_order' => 5],
            ['label' => 'ABA PAY', 'channel' => 'aba_qr', 'sort_order' => 6],
            ['label' => 'ABANHAM24', 'channel' => 'aba_qr', 'sort_order' => 7],
        ];

        foreach ($methods as $method) {
            PaymentMethod::updateOrCreate(['label' => $method['label']], $method);
        }
    }
}
