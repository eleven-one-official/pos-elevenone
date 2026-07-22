<?php

namespace App\Http\Controllers;

use App\Models\AuditLog;
use App\Services\DatabaseBackupService;
use Illuminate\Http\JsonResponse;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

/**
 * Admin-only database backups. The route group restricts every action to the
 * admin role; on top of that the filename is whitelisted in the service, so a
 * download/delete can never reach outside the backup directory. Each action is
 * written to the audit trail.
 */
class BackupController extends Controller
{
    public function __construct(private readonly DatabaseBackupService $backups) {}

    /** GET /api/backups — every backup, newest first. */
    public function index(): JsonResponse
    {
        return response()->json(['data' => $this->backups->list()]);
    }

    /** POST /api/backups — create one now (synchronous; the DB is small). */
    public function store(): JsonResponse
    {
        try {
            $name = $this->backups->create();
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'message' => 'Backup failed: '.$e->getMessage(),
            ], 500);
        }

        AuditLog::record('backup_created', null, [], ['file' => $name], $name);

        $path = $this->backups->resolvePath($name);

        return response()->json([
            'name' => $name,
            'size' => $path ? (int) filesize($path) : 0,
            'created_at' => now()->toIso8601String(),
        ], 201);
    }

    /** GET /api/backups/{name}/download — stream the .sql.gz to the browser. */
    public function download(string $name): BinaryFileResponse|JsonResponse
    {
        $path = $this->backups->resolvePath($name);
        if ($path === null) {
            return response()->json(['message' => 'Backup not found.'], 404);
        }

        AuditLog::record('backup_downloaded', null, [], ['file' => $name], $name);

        return response()->download($path, $name, ['Content-Type' => 'application/gzip']);
    }

    /** DELETE /api/backups/{name} — remove a backup. */
    public function destroy(string $name): JsonResponse
    {
        if (! $this->backups->delete($name)) {
            return response()->json(['message' => 'Backup not found.'], 404);
        }

        AuditLog::record('backup_deleted', null, [], ['file' => $name], $name);

        return response()->json(null, 204);
    }
}
