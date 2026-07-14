# POS ElevenOne

Restaurant POS system for ElevenOne Kitchen.

## Project Structure

```
pos-elevenone/
├── frontend/                          # Client app (POS UI)
│   ├── public/
│   │   └── images/
│   │       └── menu/                  # Menu item images
│   │
│   └── src/
│       ├── assets/                    # Static assets
│       │   ├── fonts/
│       │   └── icons/
│       │
│       ├── components/                # Shared/reusable components
│       │   ├── ui/                    # Buttons, inputs, modals, etc.
│       │   └── layout/                # Sidebar, header, page layout
│       │
│       ├── config/                    # App configuration
│       ├── constants/                 # Order status, payment types, roles, etc.
│       │
│       ├── features/                  # Feature modules (one per main menu)
│       │   │
│       │   ├── dashboard/             # Dashboard
│       │   │   └── components/        #   Today's Sales, Monthly Sales, Total Orders,
│       │   │                          #   Pending Orders, Occupied/Available Tables,
│       │   │                          #   Recent Orders
│       │   │
│       │   ├── pos/                   # POS (main selling screen)
│       │   │   ├── order-type/        #   Dine In / Take Away / Delivery
│       │   │   ├── select-table/      #   Normal Table / VIP Table
│       │   │   ├── menu/              #   Food / Drink / Dessert selection
│       │   │   ├── cart/              #   Add Item, Update Qty, Remove Item,
│       │   │   │                      #   Add Note, Discount
│       │   │   └── payment/           #   Cash / ABA QR / KHQR / Card
│       │   │
│       │   ├── orders/                # Orders management
│       │   │   └── components/        #   New, Preparing, Ready, Served, Completed,
│       │   │                          #   Cancelled, Edit, Delete, Print Bill
│       │   │
│       │   ├── tables/                # Tables management
│       │   │   └── components/        #   Normal / VIP tables,
│       │   │                          #   Status: Available / Occupied / Reserved
│       │   │
│       │   ├── menu/                  # Menu management
│       │   │   ├── categories/        #   Food / Drink / Dessert
│       │   │   └── items/             #   Name, Image, Price, Status, Description
│       │   │
│       │   ├── kitchen/               # Kitchen display
│       │   │   └── components/        #   Pending, Kitchen Ticket, Cooking,
│       │   │                          #   Ready, Completed
│       │   │
│       │   ├── payment/               # Payment processing
│       │   │   └── components/        #   Cash, ABA QR, KHQR, Card,
│       │   │                          #   Receipt Printing
│       │   │
│       │   ├── reports/               # Reports
│       │   │   └── components/        #   Daily Sales, Monthly Sales,
│       │   │                          #   Top Selling Menu, Payment Summary
│       │   │
│       │   ├── users/                 # Users & roles
│       │   │   └── components/        #   Admin, Manager, Cashier, Waiter, Kitchen
│       │   │
│       │   ├── printers/              # Printers
│       │   │   └── components/        #   Receipt, Kitchen, Drink printers
│       │   │
│       │   ├── devices/               # Devices
│       │   │   └── components/        #   Tablets, POS Computer
│       │   │
│       │   └── settings/              # Settings
│       │       └── components/        #   Restaurant Info, Payment, Printer,
│       │                              #   Tax, Discount, Backup & Restore
│       │
│       ├── hooks/                     # Shared custom hooks
│       ├── layouts/                   # Page layouts (POS layout, admin layout)
│       ├── services/                  # Business logic / external services
│       │   └── api/                   # API calls per module
│       ├── stores/                    # Global state (cart, auth, orders)
│       ├── types/                     # Shared type definitions
│       └── utils/                     # Helpers (currency, date, print format)
│
├── backend/                           # API server
│   ├── src/
│   │   ├── config/                    # DB connection, env, app config
│   │   ├── controllers/               # Request handlers per module
│   │   │                              #   (orders, tables, menu, payments, users, ...)
│   │   ├── models/                    # Database models
│   │   │                              #   (Order, Table, MenuItem, Payment, User, ...)
│   │   ├── routes/                    # API route definitions per module
│   │   ├── middlewares/               # Auth, role check, error handler
│   │   ├── services/                  # Business logic (payment, printing, reports)
│   │   ├── validators/                # Request validation
│   │   ├── utils/                     # Helpers
│   │   └── database/
│   │       ├── migrations/            # Schema migrations
│   │       └── seeders/               # Seed data (categories, tables, admin user)
│   │
│   └── uploads/
│       └── menu/                      # Uploaded menu item images
│
└── README.md
```

## Notes

- `.gitkeep` files keep empty folders tracked in git — delete them as real files are added.
- Each folder under `frontend/src/features/` is a self-contained module matching one main menu of the app.
- Sub-features listed as comments (e.g. Cash, ABA QR, KHQR) will become component/service files inside their module.
- Backend controllers/models/routes will get one file per module (orders, tables, menu, kitchen, payments, reports, users, printers, devices, settings).
