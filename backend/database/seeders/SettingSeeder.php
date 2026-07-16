<?php

namespace Database\Seeders;

use App\Models\Setting;
use Illuminate\Database\Seeder;

class SettingSeeder extends Seeder
{
    public function run(): void
    {
        $defaults = [
            'store_name' => 'Elevenone Restaurant',
            'store_address' => 'Street 123, Phnom Penh, Cambodia',
            'store_phone' => '012 345 678',
            'currency_khr_rate' => '4100',
            // The venue charges no tax; kept at 0 for old clients that read it.
            'tax_rate' => '0',
        ];

        foreach ($defaults as $key => $value) {
            Setting::updateOrCreate(['key' => $key], ['value' => $value]);
        }
    }
}
