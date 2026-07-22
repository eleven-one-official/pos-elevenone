<?php

return [

    /*
    |--------------------------------------------------------------------------
    | mysqldump binary
    |--------------------------------------------------------------------------
    |
    | Absolute path to mysqldump. On the Linux VPS the default works once
    | mysql-client is on the PATH. Windows/XAMPP dev overrides it in .env:
    |   DB_BACKUP_MYSQLDUMP_PATH="C:\xampp\mysql\bin\mysqldump.exe"
    |
    */

    'mysqldump_path' => env('DB_BACKUP_MYSQLDUMP_PATH', 'mysqldump'),

    /*
    |--------------------------------------------------------------------------
    | Retention
    |--------------------------------------------------------------------------
    |
    | Backups older than this many days are deleted after each run. 0 disables
    | pruning (keep everything).
    |
    */

    'retention_days' => (int) env('DB_BACKUP_RETENTION_DAYS', 30),

    /*
    |--------------------------------------------------------------------------
    | Storage directory
    |--------------------------------------------------------------------------
    |
    | Sub-directory under the private storage disk (storage/app/private/<dir>).
    | This is NOT storage/app/public, so dumps are never reachable over HTTP —
    | they carry encrypted PINs/passwords and must stay off the web.
    |
    */

    'directory' => 'backups',

];
