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
            // House / partner settlement accounts — the venue books them all
            // as cash journals.
            ['label' => 'Mr.Sathy (owner)', 'channel' => 'cash', 'sort_order' => 8],
            ['label' => 'Mr.Nal', 'channel' => 'cash', 'sort_order' => 9],
            ['label' => 'DulSokhy', 'channel' => 'cash', 'sort_order' => 10],
            ['label' => 'Grab Merchant', 'channel' => 'cash', 'sort_order' => 11],
            ['label' => 'SOKLIM', 'channel' => 'cash', 'sort_order' => 12],
            ['label' => 'Food Panda', 'channel' => 'cash', 'sort_order' => 13],
            ['label' => 'Wow Now', 'channel' => 'cash', 'sort_order' => 14],
            ['label' => 'Elevenone BKK', 'channel' => 'cash', 'sort_order' => 15],
            ['label' => 'Mr.Vivath (Assistant General Manager)', 'channel' => 'cash', 'sort_order' => 16],
            ['label' => 'UCB CARD', 'channel' => 'cash', 'sort_order' => 17],
            ['label' => 'Food Panda B&C', 'channel' => 'cash', 'sort_order' => 18],
            ['label' => 'Wow Now B&C', 'channel' => 'cash', 'sort_order' => 19],
            ['label' => 'AEONPAY', 'channel' => 'cash', 'sort_order' => 20],
            ['label' => 'Hatta Bank', 'channel' => 'cash', 'sort_order' => 21],
            ['label' => 'Food Testing', 'channel' => 'cash', 'sort_order' => 22],
            ['label' => 'Sathyka & Viseth', 'channel' => 'cash', 'sort_order' => 23],
            ['label' => 'Umami', 'channel' => 'cash', 'sort_order' => 24],
        ];

        foreach ($methods as $method) {
            PaymentMethod::updateOrCreate(['label' => $method['label']], $method);
        }
    }
}
