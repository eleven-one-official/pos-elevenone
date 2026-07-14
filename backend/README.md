# POS ElevenOne — Backend API

REST API for the ElevenOne Kitchen restaurant POS, built with **Laravel 12** + **MySQL/MariaDB**, using **Laravel Sanctum** for token-based authentication.

## Requirements

- PHP >= 8.2 (XAMPP)
- Composer
- MySQL / MariaDB (XAMPP)

## Setup

```bash
cd backend

# 1. Install dependencies (already done)
composer install

# 2. Copy env and generate app key (already done — .env exists for local dev)
cp .env.example .env
php artisan key:generate

# 3. Create the database (once)
#    In phpMyAdmin or CLI: CREATE DATABASE pos_elevenone;

# 4. Run migrations + seed sample data
php artisan migrate:fresh --seed

# 5. Start the API server
php artisan serve
# API base URL: http://127.0.0.1:8000/api
```

## Database connection (`.env`)

```
DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=pos_elevenone
DB_USERNAME=root
DB_PASSWORD=
```

## Seeded login accounts

| Username  | Password   | Role    |
|-----------|------------|---------|
| `admin`   | `password` | Admin   |
| `cashier` | `password` | Cashier |

Roles seeded: **admin, manager, cashier, waiter, kitchen**.

## Authentication

Token-based (Sanctum). Log in to receive a bearer token, then send it on every
protected request:

```
Authorization: Bearer <token>
```

## API Endpoints

All routes are prefixed with `/api`. Every route except `POST /login`
requires the `Authorization: Bearer <token>` header.

### Auth
| Method | Endpoint   | Description                    |
|--------|------------|--------------------------------|
| POST   | `/login`   | Log in with `username` + `password`, returns `{ token, user }` |
| GET    | `/me`      | Current authenticated user     |
| POST   | `/logout`  | Revoke the current token       |

### Menu
| Method | Endpoint            | Notes |
|--------|---------------------|-------|
| GET    | `/categories`       | `?with_items=1`, `?is_active=1` |
| POST   | `/categories`       | |
| GET/PUT/DELETE | `/categories/{id}` | |
| GET    | `/menu-items`       | `?category_id=`, `?is_available=1`, `?search=` |
| POST   | `/menu-items`       | |
| GET/PUT/DELETE | `/menu-items/{id}` | |

### Tables
| Method | Endpoint         | Notes |
|--------|------------------|-------|
| GET    | `/tables`        | `?type=normal\|vip`, `?status=available\|occupied\|reserved` |
| POST   | `/tables`        | |
| GET/PUT/DELETE | `/tables/{id}` | |

### Orders
| Method | Endpoint       | Notes |
|--------|----------------|-------|
| GET    | `/orders`      | `?status=`, `?order_type=`, `?table_id=`, `?date=YYYY-MM-DD` |
| POST   | `/orders`      | Body: `order_type`, `table_id`, `discount`, `tax`, `note`, `items[]` |
| GET/PUT/DELETE | `/orders/{id}` | PUT can change `status` / replace `items` |

`POST /orders` body example:
```json
{
  "order_type": "dine_in",
  "table_id": 1,
  "discount": 0.5,
  "tax": 0,
  "items": [
    { "menu_item_id": 1, "quantity": 2 },
    { "menu_item_id": 5, "quantity": 1, "note": "less ice" }
  ]
}
```
Creating a `dine_in` order marks its table **occupied**. Line totals,
`subtotal`, and `total` are calculated on the server.

### Payments
| Method | Endpoint        | Notes |
|--------|-----------------|-------|
| GET    | `/payments`     | `?order_id=`, `?date=` |
| POST   | `/payments`     | Body: `order_id`, `method` (`cash\|aba_qr\|khqr\|card`), `amount`, `received`, `reference` |
| GET/DELETE | `/payments/{id}` | |

Recording a payment that covers the order total marks the order **completed**
and frees its table. For cash, `change` is computed from `received - amount`.

### Reports
| Method | Endpoint                  | Notes |
|--------|---------------------------|-------|
| GET    | `/reports/dashboard`      | Sales, order counts, table availability, recent orders |
| GET    | `/reports/daily-sales`    | `?date=YYYY-MM-DD` (default today) + payment breakdown |
| GET    | `/reports/top-items`      | `?limit=` top-selling menu items |

## Data model

```
roles ──< users ──< orders >── tables
                      │
                      ├──< order_items >── menu_items >── categories
                      └──< payments
```

## Frontend integration

CORS is configured in `config/cors.php` for the Vite dev server
(`http://localhost:5173`, override with `FRONTEND_URL` in `.env`).
From the frontend, store the token from `/login` and attach it as
`Authorization: Bearer <token>` on subsequent requests.
