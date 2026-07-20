<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Cross-Origin Resource Sharing (CORS) Configuration
    |--------------------------------------------------------------------------
    |
    | Allows the React frontend (Vite dev server) to call the API. Adjust
    | `allowed_origins` for your production frontend domain.
    |
    */

    'paths' => ['api/*', 'login', 'logout', 'sanctum/csrf-cookie'],

    'allowed_methods' => ['*'],

    'allowed_origins' => [
        env('FRONTEND_URL', 'https://192.168.1.166:5443'),
        // Tablets load the POS over Caddy's TLS proxy on the LAN.
        'https://192.168.1.166:5443',
    ],

    // Dev only: Vite picks the first free port (5173, then 5174, ...), so any
    // localhost / 127.0.0.1 port is allowed while APP_ENV=local. In production
    // this list is empty — only the explicit origins above may call the API.
    'allowed_origins_patterns' => env('APP_ENV', 'production') === 'local'
        ? ['#^https?://(localhost|127\.0\.0\.1)(:\d+)?$#']
        : [],

    'allowed_headers' => ['*'],

    'exposed_headers' => [],

    'max_age' => 0,

    'supports_credentials' => true,

];
