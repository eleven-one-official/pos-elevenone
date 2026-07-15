<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\CategoryController;
use App\Http\Controllers\CustomerController;
use App\Http\Controllers\MenuItemController;
use App\Http\Controllers\OrderController;
use App\Http\Controllers\PaymentController;
use App\Http\Controllers\PaymentMethodController;
use App\Http\Controllers\ReportController;
use App\Http\Controllers\SettingController;
use App\Http\Controllers\TableController;
use App\Http\Controllers\UserController;
use App\Models\Role;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Public routes
|--------------------------------------------------------------------------
*/
Route::post('/login', [AuthController::class, 'login']);

// PIN login for POS terminals / waiter tablets: fetch the tappable roster, then
// authenticate with the chosen staff id + PIN.
Route::get('/staff', [AuthController::class, 'staffRoster']);
Route::post('/staff-login', [AuthController::class, 'staffLogin']);

/*
|--------------------------------------------------------------------------
| Protected routes (require a valid Sanctum bearer token)
|--------------------------------------------------------------------------
*/
Route::middleware('auth:sanctum')->group(function () {
    // Auth
    Route::get('/me', [AuthController::class, 'me']);
    Route::post('/logout', [AuthController::class, 'logout']);

    // Menu
    Route::apiResource('categories', CategoryController::class);
    Route::apiResource('menu-items', MenuItemController::class);

    // Tables
    Route::apiResource('tables', TableController::class);

    // Orders & payments
    Route::apiResource('orders', OrderController::class);
    // Payments are immutable once recorded (refund by creating a new record), so no update route.
    Route::apiResource('payments', PaymentController::class)->except(['update']);

    // Reports
    Route::get('/reports/dashboard', [ReportController::class, 'dashboard']);
    Route::get('/reports/daily-sales', [ReportController::class, 'dailySales']);
    Route::get('/reports/top-items', [ReportController::class, 'topItems']);

    // Staff management (admin only — enforced in UserController)
    Route::get('/roles', fn () => Role::orderBy('name')->get(['id', 'name', 'slug']));
    Route::apiResource('users', UserController::class);

    // Store settings — any authed user may read (POS/receipt need them); only
    // admins may write (enforced in SettingController).
    Route::get('/settings', [SettingController::class, 'index']);
    Route::put('/settings', [SettingController::class, 'update']);

    // Customer directory (cashiers may add on the fly) and the venue's payment
    // journals (read by the POS; admin-only writes, enforced in the controller).
    Route::apiResource('customers', CustomerController::class);
    Route::apiResource('payment-methods', PaymentMethodController::class);
});
