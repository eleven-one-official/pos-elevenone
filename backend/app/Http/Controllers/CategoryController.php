<?php

namespace App\Http\Controllers;

use App\Models\Category;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class CategoryController extends Controller
{
    /**
     * List categories. Pass ?with_items=1 to include menu items.
     */
    public function index(Request $request): JsonResponse
    {
        $query = Category::query()->orderBy('sort_order')->orderBy('name');

        if ($request->boolean('with_items')) {
            $query->with('menuItems');
        }

        if ($request->has('is_active')) {
            $query->where('is_active', $request->boolean('is_active'));
        }

        return response()->json($query->get());
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            // Unique within the branch — each shop needs its own "drink" slug
            // (that slug routes products to the bar board).
            'slug' => ['nullable', 'string', 'max:255',
                \Illuminate\Validation\Rule::unique('categories', 'slug')
                    ->where('branch_id', \App\Http\Middleware\SetCurrentBranch::id())],
            'description' => ['nullable', 'string'],
            'image' => ['nullable', 'string'],
            'sort_order' => ['nullable', 'integer'],
            'is_active' => ['boolean'],
        ]);

        $data['slug'] ??= Str::slug($data['name']);

        // The column is NOT NULL — an omitted sequence lands at the end.
        $data['sort_order'] ??= ((int) Category::max('sort_order')) + 1;

        $category = Category::create($data);

        return response()->json($category, 201);
    }

    public function show(Category $category): JsonResponse
    {
        return response()->json($category->load('menuItems'));
    }

    public function update(Request $request, Category $category): JsonResponse
    {
        $data = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:255'],
            'slug' => ['nullable', 'string', 'max:255',
                \Illuminate\Validation\Rule::unique('categories', 'slug')
                    ->where('branch_id', \App\Http\Middleware\SetCurrentBranch::id())
                    ->ignore($category->id)],
            'description' => ['nullable', 'string'],
            'image' => ['nullable', 'string'],
            'sort_order' => ['nullable', 'integer'],
            'is_active' => ['boolean'],
        ]);

        // NOT NULL column — clearing the sequence keeps the current position.
        if (array_key_exists('sort_order', $data) && $data['sort_order'] === null) {
            unset($data['sort_order']);
        }

        $category->update($data);

        return response()->json($category);
    }

    public function destroy(Category $category): JsonResponse
    {
        $category->delete();

        return response()->json(['message' => 'Category deleted.']);
    }
}
