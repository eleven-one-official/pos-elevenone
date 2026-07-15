<?php

namespace Database\Seeders;

use App\Models\Customer;
use Illuminate\Database\Seeder;

class CustomerSeeder extends Seeder
{
    public function run(): void
    {
        $customers = [
            ['name' => 'Sok Dara', 'phone' => '012 345 678'],
            ['name' => 'Chan Thida', 'phone' => '011 222 333'],
            ['name' => 'Kim Seyha', 'phone' => '017 888 999'],
            ['name' => 'Lucas Martin', 'phone' => '093 444 555'],
            ['name' => 'Emma Nguyen', 'phone' => '096 777 111'],
        ];

        foreach ($customers as $customer) {
            Customer::updateOrCreate(['name' => $customer['name']], $customer);
        }
    }
}
