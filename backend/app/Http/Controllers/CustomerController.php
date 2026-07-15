<?php

namespace App\Http\Controllers;

use App\Models\Customer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CustomerController extends Controller
{
    /** List customers; filter with ?search= (name or phone). Any authed user. */
    public function index(Request $request): JsonResponse
    {
        $query = Customer::query()->orderBy('name');

        if ($request->filled('search')) {
            $term = '%'.$request->string('search').'%';
            $query->where(fn ($q) => $q->where('name', 'like', $term)->orWhere('phone', 'like', $term));
        }

        return response()->json($query->get());
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'phone' => ['nullable', 'string', 'max:50'],
            'email' => ['nullable', 'email', 'max:255'],
            'note' => ['nullable', 'string'],
        ]);

        return response()->json(Customer::create($data), 201);
    }

    public function show(Customer $customer): JsonResponse
    {
        return response()->json($customer);
    }

    public function update(Request $request, Customer $customer): JsonResponse
    {
        $data = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:255'],
            'phone' => ['nullable', 'string', 'max:50'],
            'email' => ['nullable', 'email', 'max:255'],
            'note' => ['nullable', 'string'],
        ]);

        $customer->update($data);

        return response()->json($customer);
    }

    public function destroy(Customer $customer): JsonResponse
    {
        $customer->delete();

        return response()->json(['message' => 'Customer deleted.']);
    }
}
