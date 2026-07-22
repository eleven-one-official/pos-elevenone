<?php

namespace App\Console\Commands;

use App\Services\DatabaseBackupService;
use Illuminate\Console\Command;

/**
 * Create a gzipped database backup and prune old ones. Runs nightly from the
 * scheduler (see routes/console.php) and can be run by hand for a fresh dump:
 *
 *     php artisan backup:run
 */
class BackupRun extends Command
{
    protected $signature = 'backup:run';

    protected $description = 'Dump the MySQL database to a gzipped file and prune old backups';

    public function handle(DatabaseBackupService $backups): int
    {
        $this->info('Creating database backup…');

        try {
            $name = $backups->create();
        } catch (\Throwable $e) {
            $this->error('Backup failed: '.$e->getMessage());

            return self::FAILURE;
        }

        $path = $backups->resolvePath($name);
        $size = $path ? $this->humanBytes((int) filesize($path)) : 'unknown size';
        $this->info("Backup written: {$name} ({$size})");

        $pruned = $backups->prune();
        if ($pruned > 0) {
            $this->info("Pruned {$pruned} backup(s) older than ".config('backup.retention_days').' days.');
        }

        return self::SUCCESS;
    }

    private function humanBytes(int $bytes): string
    {
        if ($bytes >= 1_048_576) {
            return number_format($bytes / 1_048_576, 1).' MB';
        }

        return number_format($bytes / 1024, 1).' KB';
    }
}
