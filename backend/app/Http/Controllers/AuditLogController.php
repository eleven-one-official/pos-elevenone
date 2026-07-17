<?php

namespace App\Http\Controllers;

use App\Models\AuditLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AuditLogController extends Controller
{
    /**
     * Read-only, paginated audit trail (the route group restricts it to
     * admins; there are deliberately no write endpoints). Filters:
     * ?event=, ?user_id=, ?type=Order (class basename), ?from= / ?to=
     * (YYYY-MM-DD), ?search= (matches the label), ?per_page= (max 200).
     */
    public function index(Request $request): JsonResponse
    {
        $query = AuditLog::query()->with('user:id,name,username')->latest('id');

        if ($request->filled('event')) {
            $query->where('event', $request->string('event'));
        }

        if ($request->filled('user_id')) {
            $query->where('user_id', $request->integer('user_id'));
        }

        if ($request->filled('type')) {
            $query->where('auditable_type', 'App\\Models\\'.class_basename((string) $request->string('type')));
        }

        if ($request->filled('from')) {
            $query->where('created_at', '>=', $request->date('from')->startOfDay());
        }

        if ($request->filled('to')) {
            $query->where('created_at', '<=', $request->date('to')->endOfDay());
        }

        if ($request->filled('search')) {
            $query->where('label', 'like', '%'.$request->string('search').'%');
        }

        $perPage = min(max($request->integer('per_page') ?: 50, 1), 200);
        $page = $query->paginate($perPage);

        $page->getCollection()->transform(fn (AuditLog $log) => [
            'id' => $log->id,
            'created_at' => $log->created_at?->toIso8601String(),
            'user' => $log->user ? ['id' => $log->user->id, 'name' => $log->user->name] : null,
            'user_name' => $log->user_name,
            'event' => $log->event,
            'subject_type' => $log->auditable_type ? class_basename($log->auditable_type) : null,
            'subject_id' => $log->auditable_id,
            'label' => $log->label,
            'old_values' => $log->old_values,
            'new_values' => $log->new_values,
            'ip_address' => $log->ip_address,
        ]);

        return response()->json($page);
    }
}
