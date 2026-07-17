<?php

namespace App\Http\Controllers;

use App\Models\AuditLog;
use App\Models\MenuItem;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class MenuItemController extends Controller
{
    /**
     * List menu items. Filter by ?category_id= and ?is_available=.
     */
    public function index(Request $request): JsonResponse
    {
        $query = MenuItem::query()->with('category')->orderBy('sort_order')->orderBy('name');

        if ($request->filled('category_id')) {
            $query->where('category_id', $request->integer('category_id'));
        }

        if ($request->has('is_available')) {
            $query->where('is_available', $request->boolean('is_available'));
        }

        if ($request->filled('search')) {
            $query->where('name', 'like', '%'.$request->string('search').'%');
        }

        return response()->json($query->get());
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'category_id' => ['required', 'exists:categories,id'],
            'name' => ['required', 'string', 'max:255'],
            'slug' => ['nullable', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'price' => ['required', 'numeric', 'min:0'],
            'image' => ['nullable', 'image', 'mimes:jpg,jpeg,png,webp', 'max:4096'],
            'is_available' => ['boolean'],
            'sort_order' => ['nullable', 'integer'],
        ]);

        $data['slug'] ??= Str::slug($data['name']);

        if ($request->hasFile('image')) {
            $data['image'] = '/storage/'.$request->file('image')->store('menu-items', 'public');
        } else {
            unset($data['image']);
        }

        $item = MenuItem::create($data);

        return response()->json($item->load('category'), 201);
    }

    public function show(MenuItem $menuItem): JsonResponse
    {
        return response()->json($menuItem->load('category'));
    }

    public function update(Request $request, MenuItem $menuItem): JsonResponse
    {
        $data = $request->validate([
            'category_id' => ['sometimes', 'required', 'exists:categories,id'],
            'name' => ['sometimes', 'required', 'string', 'max:255'],
            'slug' => ['nullable', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'price' => ['sometimes', 'required', 'numeric', 'min:0'],
            'image' => ['nullable', 'image', 'mimes:jpg,jpeg,png,webp', 'max:4096'],
            'is_available' => ['boolean'],
            'sort_order' => ['nullable', 'integer'],
        ]);

        // Uploaded file replaces (and deletes) the old one; an explicit null
        // clears it; an absent key leaves the current image untouched.
        if ($request->hasFile('image')) {
            self::deleteStoredImage($menuItem->image);
            $data['image'] = '/storage/'.$request->file('image')->store('menu-items', 'public');
        } elseif (array_key_exists('image', $data) && $data['image'] === null) {
            self::deleteStoredImage($menuItem->image);
        } else {
            unset($data['image']);
        }

        $menuItem->update($data);

        return response()->json($menuItem->load('category'));
    }

    public function destroy(MenuItem $menuItem): JsonResponse
    {
        self::deleteStoredImage($menuItem->image);
        $menuItem->delete();

        return response()->json(['message' => 'Menu item deleted.']);
    }

    /**
     * Adjust stock by a signed amount (e.g. +10 delivery, -3 waste). Untracked
     * stock (null) counts as 0. The quiet update keeps the generic "updated"
     * row out — the dedicated "stock_adjustment" row below is the record.
     */
    public function adjustStock(Request $request, MenuItem $menuItem): JsonResponse
    {
        $data = $request->validate([
            'adjustment' => ['required', 'integer', 'not_in:0'],
            'reason' => ['nullable', 'string', 'max:255'],
        ]);

        $old = (int) ($menuItem->stock_quantity ?? 0);
        $new = $old + (int) $data['adjustment'];

        $menuItem->updateQuietly(['stock_quantity' => $new]);

        AuditLog::record('stock_adjustment', $menuItem, ['stock_quantity' => $old], [
            'stock_quantity' => $new,
            'adjustment' => (int) $data['adjustment'],
            'reason' => $data['reason'] ?? null,
        ], $menuItem->name);

        return response()->json($menuItem->load('category'));
    }

    /** Remove an uploaded image from the public disk; external URLs are left alone. */
    private static function deleteStoredImage(?string $image): void
    {
        if ($image && str_starts_with($image, '/storage/')) {
            Storage::disk('public')->delete(substr($image, strlen('/storage/')));
        }
    }
}
