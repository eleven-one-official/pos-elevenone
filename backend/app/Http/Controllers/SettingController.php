<?php

namespace App\Http\Controllers;

use App\Models\Setting;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SettingController extends Controller
{
    /**
     * The editable settings and their validation rules. Anything outside this
     * whitelist is ignored so the table can't be polluted with arbitrary keys.
     * `tax_rate` is stored as a fraction (0.10 = 10%); the KHR rate is riel/USD.
     */
    private const RULES = [
        'store_name' => ['nullable', 'string', 'max:255'],
        'store_address' => ['nullable', 'string', 'max:255'],
        'store_phone' => ['nullable', 'string', 'max:255'],
        'currency_khr_rate' => ['nullable', 'numeric', 'min:0'],
        'tax_rate' => ['nullable', 'numeric', 'min:0', 'max:1'],
    ];

    /** Public-to-authed read: the POS and receipt need store info + tax rate. */
    public function index(): JsonResponse
    {
        return response()->json((object) Setting::pluck('value', 'key'));
    }

    /** Admin-only write. Upserts just the whitelisted keys that were sent. */
    public function update(Request $request): JsonResponse
    {
        abort_unless($request->user()?->hasRole('admin'), 403, 'Only admins can change settings.');

        $rules = collect(self::RULES)
            ->mapWithKeys(fn ($rule, $key) => [$key => array_merge(['sometimes'], $rule)])
            ->all();

        $data = $request->validate($rules);

        foreach ($data as $key => $value) {
            Setting::updateOrCreate(
                ['key' => $key],
                ['value' => is_null($value) ? null : (string) $value],
            );
        }

        return response()->json((object) Setting::pluck('value', 'key'));
    }
}
