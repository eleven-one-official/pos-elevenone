<?php

namespace Database\Factories;

use App\Models\Table;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<Table> */
class TableFactory extends Factory
{
    protected $model = Table::class;

    public function definition(): array
    {
        return [
            'name' => 'T-'.fake()->unique()->numberBetween(1, 999),
            'type' => 'normal',
            'capacity' => 4,
            'status' => 'available',
        ];
    }
}
