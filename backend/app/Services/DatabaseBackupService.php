<?php

namespace App\Services;

use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Process;
use RuntimeException;

/**
 * Dumps the MySQL database to gzipped .sql files and manages the set of them.
 *
 * Cross-platform by design (Windows/XAMPP dev, Linux VPS prod): mysqldump
 * writes a temporary .sql via --result-file (no shell pipe to break on
 * Windows), which PHP then streams into a .sql.gz. The DB password is passed
 * through the MYSQL_PWD env var, never on the command line, so it never shows
 * up in the process list.
 *
 * Backups live under storage/app/private/backups — the private disk, never
 * web-served — because a dump contains every row, including the encrypted
 * PIN/password columns.
 */
class DatabaseBackupService
{
    /**
     * The only filename shape this service ever produces. Every download/delete
     * validates against it, which is what blocks path traversal — a name with a
     * slash, "..", or any other extension simply doesn't match.
     */
    private const NAME_PATTERN = '/^pos_elevenone-\d{4}-\d{2}-\d{2}-\d{6}\.sql\.gz$/';

    /** Read + gzip the dump in ~1 MB chunks so a large DB never loads whole. */
    private const CHUNK = 1_048_576;

    /**
     * Dump the database to a new gzipped file and return its filename.
     *
     * @throws RuntimeException when the connection is missing or mysqldump fails
     */
    public function create(): string
    {
        $db = config('database.connections.mysql');
        if (! is_array($db)) {
            throw new RuntimeException('No "mysql" database connection is configured.');
        }

        $dir = $this->directory();
        File::ensureDirectoryExists($dir);

        $name = 'pos_elevenone-'.now()->format('Y-m-d-His').'.sql.gz';
        $sqlPath = $dir.DIRECTORY_SEPARATOR.$name.'.tmp.sql';
        $gzPath = $dir.DIRECTORY_SEPARATOR.$name;

        $command = [
            (string) config('backup.mysqldump_path', 'mysqldump'),
            '--single-transaction',   // consistent snapshot without locking InnoDB
            '--quick',                // stream rows instead of buffering whole tables
            '--no-tablespaces',       // avoids needing the PROCESS privilege
            '--default-character-set=utf8mb4',
            '--host='.$db['host'],
            '--port='.$db['port'],
            '--user='.$db['username'],
            '--result-file='.$sqlPath,
            $db['database'],
        ];

        // Password via env, not argv — argv is visible to every user via `ps`.
        $env = [];
        if (! empty($db['password'])) {
            $env['MYSQL_PWD'] = (string) $db['password'];
        }

        // On Windows, mysqldump needs SystemRoot/SystemDrive present to
        // initialise Winsock before it can open a TCP socket. The `php artisan
        // serve` worker sometimes runs without them, which makes a spawned
        // mysqldump fail with socket error 10106 — so pass them through
        // explicitly. No-op on Linux/macOS (prod).
        if (PHP_OS_FAMILY === 'Windows') {
            $env['SystemRoot'] = getenv('SystemRoot') ?: 'C:\\Windows';
            $env['SystemDrive'] = getenv('SystemDrive') ?: 'C:';
        }

        $result = Process::env($env)->timeout(600)->run($command);

        if (! $result->successful()) {
            File::delete($sqlPath);
            $reason = trim($result->errorOutput()) ?: trim($result->output()) ?: 'unknown error';

            throw new RuntimeException('mysqldump failed: '.$reason);
        }

        try {
            $this->gzipFile($sqlPath, $gzPath);
        } finally {
            File::delete($sqlPath);
        }

        return $name;
    }

    /**
     * All backups, newest first.
     *
     * @return list<array{name: string, size: int, created_at: string}>
     */
    public function list(): array
    {
        $rows = [];
        foreach ($this->files() as $path) {
            $rows[] = [
                'name' => basename($path),
                'size' => (int) filesize($path),
                'created_at' => Carbon::createFromTimestamp(filemtime($path))->toIso8601String(),
            ];
        }

        // Newest first — the filename embeds a sortable Y-m-d-His stamp.
        usort($rows, fn ($a, $b) => strcmp($b['name'], $a['name']));

        return $rows;
    }

    /** Absolute path of a named backup, or null if the name is invalid/missing. */
    public function resolvePath(string $name): ?string
    {
        if (! $this->isValidName($name)) {
            return null;
        }

        $path = $this->directory().DIRECTORY_SEPARATOR.$name;

        return is_file($path) ? $path : null;
    }

    /** Whether a name is one this service produced (guards traversal). */
    public function isValidName(string $name): bool
    {
        return $name === basename($name) && preg_match(self::NAME_PATTERN, $name) === 1;
    }

    /** Delete one backup; false when the name is invalid or already gone. */
    public function delete(string $name): bool
    {
        $path = $this->resolvePath($name);

        return $path !== null && File::delete($path);
    }

    /** Delete backups older than the retention window; returns how many went. */
    public function prune(): int
    {
        $days = (int) config('backup.retention_days', 30);
        if ($days <= 0) {
            return 0;
        }

        $cutoff = now()->subDays($days)->getTimestamp();
        $removed = 0;
        foreach ($this->files() as $path) {
            if (filemtime($path) < $cutoff && File::delete($path)) {
                $removed++;
            }
        }

        return $removed;
    }

    /** Absolute path of the backup directory (storage/app/private/backups). */
    public function directory(): string
    {
        $dir = trim((string) config('backup.directory', 'backups'), '/\\');

        return storage_path('app/private/'.$dir);
    }

    /** @return list<string> absolute paths of every backup file */
    private function files(): array
    {
        $dir = $this->directory();
        if (! is_dir($dir)) {
            return [];
        }

        return glob($dir.DIRECTORY_SEPARATOR.'pos_elevenone-*.sql.gz') ?: [];
    }

    /** Stream a plain file into a gzip file without loading it all into memory. */
    private function gzipFile(string $source, string $destination): void
    {
        $in = fopen($source, 'rb');
        if ($in === false) {
            throw new RuntimeException('Could not read the database dump.');
        }

        $out = gzopen($destination, 'wb6');
        if ($out === false) {
            fclose($in);
            throw new RuntimeException('Could not create the gzip archive.');
        }

        try {
            while (! feof($in)) {
                $chunk = fread($in, self::CHUNK);
                if ($chunk === false) {
                    throw new RuntimeException('Failed while reading the database dump.');
                }
                gzwrite($out, $chunk);
            }
        } finally {
            fclose($in);
            gzclose($out);
        }
    }
}
