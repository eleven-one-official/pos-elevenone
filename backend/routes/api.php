<?php

use App\Http\Controllers\AuditLogController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\BackupController;
use App\Http\Controllers\CashMovementController;
use App\Http\Controllers\CategoryController;
use App\Http\Controllers\ChefController;
use App\Http\Controllers\CustomerController;
use App\Http\Controllers\KitchenController;
use App\Http\Controllers\MenuItemController;
use App\Http\Controllers\OrderController;
use App\Http\Controllers\PaymentController;
use App\Http\Controllers\PaymentMethodController;
use App\Http\Controllers\PricelistController;
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
| Credential endpoints are throttled per IP to slow password/PIN brute
| forcing (PINs are only 4-6 digits, so this limit matters).
*/
Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:10,1');

// PIN login for POS terminals / waiter tablets: fetch the tappable roster, then
// authenticate with the chosen staff id + PIN.
Route::get('/staff', [AuthController::class, 'staffRoster'])->middleware('throttle:30,1');
Route::post('/staff-login', [AuthController::class, 'staffLogin'])->middleware('throttle:10,1');

/*
|--------------------------------------------------------------------------
| Protected routes (require a valid Sanctum bearer token)
|--------------------------------------------------------------------------
*/
Route::middleware('auth:sanctum')->group(function () {
    // Auth
    Route::get('/me', [AuthController::class, 'me']);
    Route::post('/logout', [AuthController::class, 'logout']);

    // Catalog & floor reads — every signed-in role needs these to take orders.
    Route::apiResource('categories', CategoryController::class)->only(['index', 'show']);
    Route::apiResource('menu-items', MenuItemController::class)->only(['index', 'show']);
    Route::apiResource('tables', TableController::class)->only(['index', 'show']);
    Route::apiResource('pricelists', PricelistController::class)->only(['index', 'show']);
    // Chef roster — the kitchen display (shared kitchen token) reads it for the
    // "who's cooking?" picker; managing it is back-office work below.
    Route::apiResource('chefs', ChefController::class)->only(['index', 'show']);

    // Orders: every signed-in role may read (floor/kitchen views). Creating and
    // editing an order is till/tablet work; the kitchen may only advance an
    // order's status (mark it ready) — enforced in OrderController::update.
    // Deleting stays a back-office op below.
    Route::apiResource('orders', OrderController::class)->only(['index', 'show']);
    Route::middleware('role:admin,manager,cashier,waiter')->group(function () {
        Route::apiResource('orders', OrderController::class)->only(['store']);
    });
    Route::middleware('role:admin,manager,cashier,waiter,kitchen,bar')->group(function () {
        Route::apiResource('orders', OrderController::class)->only(['update']);
    });

    // Station display boards — tickets are rounds, not bills, so a table that
    // orders again shows up as a second card under the same table number. Each
    // send is split by station: the food lands on /kitchen/tickets, the drinks
    // on /bar/tickets, both under the same round number. Any signed-in role may
    // read a board; advancing a ticket is station work (the floor stations keep
    // it too, to bump a ticket when the screen is out of reach).
    Route::get('/kitchen/tickets', [KitchenController::class, 'tickets']);
    Route::get('/bar/tickets', [KitchenController::class, 'tickets'])->defaults('station', 'bar');
    // Today's plated tickets — the board drops a card the moment it's bumped,
    // so this is the only way back to "did that go out, and when?".
    Route::get('/kitchen/tickets/history', [KitchenController::class, 'history']);
    Route::get('/bar/tickets/history', [KitchenController::class, 'history'])
        ->defaults('station', 'bar');
    Route::middleware('role:admin,manager,cashier,waiter,kitchen,bar')->group(function () {
        Route::put('/kitchen/tickets/{round}', [KitchenController::class, 'update']);
        Route::put('/bar/tickets/{round}', [KitchenController::class, 'update'])
            ->defaults('station', 'bar');
        // One dish at a time — the kitchen names a cook and starts/stops the
        // clock per line; the round rolls itself up from its dishes.
        Route::put('/kitchen/tickets/{round}/items/{item}', [KitchenController::class, 'updateItem']);
        Route::put('/bar/tickets/{round}/items/{item}', [KitchenController::class, 'updateItem'])
            ->defaults('station', 'bar');
    });

    // Customer directory — cashiers may look up and add customers on the fly.
    Route::apiResource('customers', CustomerController::class)->only(['index', 'show', 'store']);

    // Store settings — any authed user may read (POS/receipt need them); only
    // admins may write (enforced in SettingController).
    Route::get('/settings', [SettingController::class, 'index']);
    Route::put('/settings', [SettingController::class, 'update']);

    // Payment journals — reads for the POS; admin-only writes are enforced in
    // the controller.
    Route::apiResource('payment-methods', PaymentMethodController::class);

    // Staff management (admin only — enforced in UserController).
    Route::apiResource('users', UserController::class);

    /*
    | Money handling — cashiers settle bills; waiters only take orders, so a
    | waiter (or kitchen) token can neither record nor browse payments.
    | Payments are immutable once recorded (refund by creating a new record),
    | so there is no update route; deleting one is admin-only below.
    */
    Route::middleware('role:admin,manager,cashier')->group(function () {
        Route::apiResource('payments', PaymentController::class)->only(['index', 'show', 'store']);

        // Cash drawer log — shared across terminals, audited via the model.
        Route::get('/cash-movements', [CashMovementController::class, 'index']);
        Route::post('/cash-movements', [CashMovementController::class, 'store']);

        // Re-send a settled bill to the guest's inbox.
        Route::post('/orders/{order}/email-receipt', [OrderController::class, 'emailReceipt']);
    });

    /*
    | Back office — menu/floor management and sales reporting. Managers "manage
    | menu, reports and staff" per the role seeder; staff management itself
    | stays admin-only inside UserController.
    */
    Route::middleware('role:admin,manager')->group(function () {
        Route::apiResource('categories', CategoryController::class)->only(['store', 'update', 'destroy']);
        Route::apiResource('menu-items', MenuItemController::class)->only(['store', 'update', 'destroy']);
        Route::apiResource('pricelists', PricelistController::class)->only(['store', 'update', 'destroy']);
        Route::apiResource('chefs', ChefController::class)->only(['store', 'update', 'destroy']);

        // Refunds keep the money trail (row flips to refunded, audit row written);
        // they are a supervisor action, not a cashier one.
        Route::post('/payments/{payment}/refund', [PaymentController::class, 'refund']);
        Route::apiResource('tables', TableController::class)->only(['store', 'update', 'destroy']);
        Route::apiResource('orders', OrderController::class)->only(['destroy']);
        Route::apiResource('customers', CustomerController::class)->only(['update', 'destroy']);

        Route::get('/reports/dashboard', [ReportController::class, 'dashboard']);
        Route::get('/reports/daily-sales', [ReportController::class, 'dailySales']);
        Route::get('/reports/top-items', [ReportController::class, 'topItems']);
        Route::get('/reports/orders-analysis', [ReportController::class, 'ordersAnalysis']);
        Route::get('/reports/sales-details', [ReportController::class, 'salesDetails']);
        Route::get('/reports/pos-configs', [ReportController::class, 'posConfigs']);
        Route::get('/reports/chef-performance', [ReportController::class, 'chefPerformance']);

        // Orders list (JSON) behind the admin's "Export Orders" PDF — one row
        // per bill. ?start=&end= are UTC instants; ?tz= (minutes east of UTC)
        // shifts the shown clock to the venue's day. The "Sales Details" PDF
        // reuses /reports/sales-details above.
        Route::get('/reports/orders-list', [ReportController::class, 'ordersList']);
    });

    /*
    | Admin only — deleting a recorded payment erases a money trail, and the
    | roles list backs the admin-only staff form.
    */
    Route::middleware('role:admin')->group(function () {
        Route::apiResource('payments', PaymentController::class)->only(['destroy']);
        Route::get('/roles', fn () => Role::orderBy('name')->get(['id', 'name', 'slug']));

        // Who-did-what trail. Read-only by design — nothing can edit it.
        Route::get('/audit-logs', [AuditLogController::class, 'index']);

        // Database backups. A dump holds every row (including the encrypted
        // PIN/password columns), so this is admin-only; the filename is
        // whitelisted in the controller/service, so {name} can't traverse out
        // of the backup directory.
        Route::get('/backups', [BackupController::class, 'index']);
        Route::post('/backups', [BackupController::class, 'store']);
        Route::get('/backups/{name}/download', [BackupController::class, 'download']);
        Route::delete('/backups/{name}', [BackupController::class, 'destroy']);
    });
});
