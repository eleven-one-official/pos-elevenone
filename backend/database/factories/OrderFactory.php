<?php

namespace Database\Factories;

use App\Models\Order;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<Order> */
class OrderFactory extends Factory
{
    protected $model = Order::class;

    public function definition(): array
    {
        return [
            'order_number' => 'ORD-TEST-'.str_pad((string) fake()->unique()->numberBetween(1, 9999), 4, '0', STR_PAD_LEFT),
            'order_type' => 'dine_in',
            'status' => 'new',
            'guest_count' => 2,
            'subtotal' => 10.00,
            'discount' => 0,
            'tax' => 0,
            'total' => 10.00,
        ];
    }

    public function completed(): static
    {
        return $this->state(['status' => 'completed']);
    }
}
