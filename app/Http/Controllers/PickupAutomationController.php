<?php

namespace App\Http\Controllers;

use App\Actions\Pickup\PickupResultPeriod;
use App\Actions\Pickup\QueryPickupAutomation;
use App\Actions\Pickup\QueryPickupAwbCandidates;
use App\Actions\Pickup\QueuePickupReconciliations;
use App\Actions\Pickup\ReconcileCustomerPickupDay;
use App\Actions\Pickup\ReviewPickupAwbs;
use App\Http\Requests\PickupResultRequest;
use App\Http\Requests\ReviewPickupAwbsRequest;
use App\Http\Requests\UpdateAwbDeliveryPreferenceRequest;
use App\Jobs\QueueBulkPickupReconciliationsJob;
use App\Jobs\RenderPickupAwbManifestJob;
use App\Models\Customer;
use App\Models\CustomerAwbDeliveryPreference;
use App\Models\JneShipment;
use App\Models\PickupAwbManifest;
use App\Models\PickupCustomerReconciliation;
use App\Models\PickupPendingItem;
use App\Models\PickupProcessingReconciliation;
use App\Models\PickupTask;
use App\Models\ReportJob;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Pagination\LengthAwarePaginator;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;
use Symfony\Component\HttpFoundation\StreamedResponse;

class PickupAutomationController extends Controller
{
    public function index(PickupResultRequest $request, QueryPickupAutomation $automation): Response
    {
        $filters = array_filter($request->validated(), fn ($value) => $value !== null && $value !== '');
        unset($filters['monitoring'], $filters['quick_pickup'], $filters['selected_ids']);
        $this->rejectBacklog($filters);

        return Inertia::render('rekonsiliasi-resi', ['filters' => $filters, 'automation' => $automation->handle($filters), 'timezone' => PickupResultPeriod::TIMEZONE,
            'selectedPickup' => $request->integer('quick_pickup') ?: null,
            'staffOptions' => User::whereIn('id', PickupTask::whereNotNull('assigned_staff_id')->select('assigned_staff_id'))->orderBy('name')->get(['id', 'name']),
        ]);
    }

    public function export(PickupResultRequest $request, QueryPickupAutomation $automation): StreamedResponse
    {
        $filters = $request->validated();
        $this->rejectBacklog($filters);
        $query = $automation->query($filters);
        if (! empty($filters['selected_ids'])) {
            $query->whereIn('id', array_map(intval(...), $filters['selected_ids']));
        }

        return response()->streamDownload(function () use ($query, $automation): void {
            $stream = fopen('php://output', 'w');
            if ($stream === false) {
                throw new \RuntimeException('Stream CSV tidak tersedia.');
            }
            fwrite($stream, "\xEF\xBB\xBF");
            fputcsv($stream, ['Pickup / kelompok', 'Customer', 'Kode customer', 'Petugas', 'Tanggal pickup', 'Status rekonsiliasi', 'Status pengiriman', 'Manual gudang', 'Manual JNE', 'Cashless gudang', 'Cashless JNE', 'Orion gudang', 'Orion JNE', 'Keterangan', 'Hari retail', 'Jumlah pickup'], ',', '"', '');
            foreach ($query->lazy(500) as $record) {
                $row = $automation->row($record);
                $values = [$row['reference'], $row['customer_name'], $row['customer_code'], $row['staff_name'], $row['picked_up_at'], $row['automation_status'], $row['delivery_status']];
                foreach (['manual_hybrid', 'cashless_hybrid', 'css_orion'] as $category) {
                    $values[] = $row['categories'][$category]['expected'] ?? null;
                    $values[] = $row['categories'][$category]['confirmed'] ?? 0;
                }
                $values[] = implode(' | ', $row['reasons']);
                $values[] = $row['business_date'] ?? null;
                $values[] = $row['pickup_count'] ?? 1;
                $safe = array_map(fn ($value) => is_string($value) && preg_match('/^[=+@\-\t\r]/', $value) ? "'".$value : $value, $values);
                fputcsv($stream, $safe, ',', '"', '');
            }
            fclose($stream);
        }, 'rekonsiliasi-paket-'.now()->format('Y-m-d-His').'.csv', ['Content-Type' => 'text/csv; charset=UTF-8', 'Cache-Control' => 'private, no-store']);
    }

    public function show(Request $request, PickupTask $task): JsonResponse
    {
        $this->authorizeAdmin($request);
        $request->validate(['view' => ['nullable', 'in:pickup,customer_day'], 'member_task' => ['nullable', 'integer', 'min:0']]);
        $selectedTaskId = $task->id;
        if ($request->input('view') === 'customer_day') {
            return $this->customerDay($request, $task);
        }
        if ($request->integer('member_task')) {
            abort_unless(in_array($request->integer('member_task'), app(ReconcileCustomerPickupDay::class)->memberIds($task), true), 404);
            $task = PickupTask::findOrFail($request->integer('member_task'));
        }
        $task->loadMissing(['assignedStaff', 'proof.revisions', 'handoverItem.revisions', 'latestVisit']);
        $queryFilter = $request->validate(['shipment_q' => ['nullable', 'string', 'max:100']]);
        $shipmentQuery = $queryFilter['shipment_q'] ?? '';
        $reconciliation = PickupProcessingReconciliation::where('pickup_task_id', $task->id)->first();
        $candidateRows = $reconciliation?->evidence['shipments'] ?? [];
        $candidateIds = is_array($candidateRows) ? array_column($candidateRows, 'id') : [];
        $coverage = $reconciliation?->evidence['coverage'] ?? [];
        $reports = is_array($coverage) ? ($coverage['reports'] ?? []) : [];
        $importedAt = ReportJob::where(fn ($query) => $query->whereIn('id', is_array($reports) ? $reports : [])->orWhereIn('id', JneShipment::whereIn('id', $candidateIds)->select('latest_report_job_id')))->max('imported_at');
        $activeManifest = PickupAwbManifest::where('pickup_task_id', $task->id)->where('status', '!=', 'SUPERSEDED')->with('deliveries')->latest('id')->first();
        $latestDelivery = $activeManifest?->deliveries->sortByDesc('id')->first();
        $deliveryAttention = match (true) {
            in_array($latestDelivery?->status, ['UNKNOWN', 'FAILED'], true) => $latestDelivery->last_error ?: 'Status pengiriman perlu diperiksa sebelum pengiriman berikutnya.',
            in_array($activeManifest?->status, ['FAILED', 'REVIEW'], true) => $activeManifest->last_error ?: 'Dokumen resi perlu diperiksa.',
            default => null,
        };

        return response()->json([
            'selected_task_id' => $selectedTaskId,
            'task' => $task->only(['id', 'reference', 'customer_id', 'customer_name_snapshot']),
            'context' => ['customer_code' => Customer::whereKey($task->customer_id)->value('customer_code'), 'staff_name' => $task->assignedStaff?->name, 'scheduled_at' => $task->scheduled_at->toIso8601String(),
                'visited_at' => $task->latestVisit->recorded_at ?? $task->proof?->picked_up_at, 'finalized_at' => $task->proof?->finalized_at,
                'verified_at' => $task->handoverItem?->effectiveValues()['verified_at'] ?? null, 'imported_at' => $importedAt,
                'warehouse_needs_review' => $task->handoverItem?->needsReview() ?? false,
            ],
            'reconciliation' => $reconciliation,
            'delivery_attention' => $deliveryAttention,
            'shipment_query' => $shipmentQuery,
            'shipments' => JneShipment::where(fn ($query) => $query->where('pickup_task_id', $task->id)->orWhereIn('id', $candidateIds))->where(fn ($owner) => $owner->whereNull('pickup_task_id')->orWhere('pickup_task_id', $task->id))->orderBy('awb')->paginate(50)->through(fn (JneShipment $row): array => $row->only(['id', 'awb', 'version', 'pickup_task_id', 'category', 'category_status', 'match_status', 'customer_match_status'])),
            'assigned_shipments' => JneShipment::where('pickup_task_id', $task->id)->when($shipmentQuery !== '', fn ($rows) => $rows->where('awb', 'like', '%'.$shipmentQuery.'%'))->orderBy('awb')->paginate(20, ['id', 'awb', 'version', 'pickup_task_id', 'category', 'category_status', 'match_status', 'customer_match_status'], 'attached_page'),
            'pending_items' => PickupPendingItem::where('pickup_task_id', $task->id)->with('shipment:id,awb')->orderByDesc('id')->paginate(20, ['*'], 'pending_page'),
            'review_events' => DB::table('pickup_awb_review_events')->where('pickup_task_id', $task->id)->join('users', 'users.id', '=', 'actor_id')->select('pickup_awb_review_events.*', 'users.name as actor_name')->orderByDesc('pickup_awb_review_events.id')->paginate(20, ['*'], 'review_page'),
            'business_date' => $task->proof?->picked_up_at ? PickupResultPeriod::date($task->proof->picked_up_at)->toDateString() : null,
            'excluded' => DB::table('pickup_awb_exclusions')->where('pickup_awb_exclusions.pickup_task_id', $task->id)->join('jne_shipments', 'jne_shipments.id', '=', 'jne_shipment_id')->select('jne_shipments.id', 'awb', 'version', 'category', 'reason', 'jne_shipments.pickup_task_id')->orderBy('awb')->paginate(20, ['*'], 'excluded_page'),
            'manifests' => PickupAwbManifest::where('pickup_task_id', $task->id)->with('deliveries')->orderByDesc('revision')->paginate(10, ['*'], 'manifest_page'),
            'preference' => CustomerAwbDeliveryPreference::where('customer_id', $task->customer_id)->first(),
            'history' => DB::table('pickup_processing_reconciliation_events')->where('pickup_task_id', $task->id)->orderByDesc('revision')->paginate(10, ['*'], 'history_page'),
            'send_enabled' => (bool) config('pickup.automation.send_enabled'),
        ]);
    }

    private function customerDay(Request $request, PickupTask $task): JsonResponse
    {
        $ids = app(ReconcileCustomerPickupDay::class)->memberIds($task);
        $ids = $ids ?: [$task->id];
        $members = PickupTask::whereIn('id', $ids)->orderBy('id')->with(['assignedStaff', 'proof.revisions', 'handoverItem.revisions', 'handoverItem.proof.revisions'])->get();
        $date = PickupResultPeriod::date($task->proof->picked_up_at ?? $task->scheduled_at)->toDateString();
        $group = PickupCustomerReconciliation::where('customer_id', $task->customer_id)->whereDate('business_date', $date)->first();
        $results = PickupProcessingReconciliation::whereIn('pickup_task_id', $ids)->get()->keyBy('pickup_task_id');
        $dirty = ! $group || ($group->evidence['pickup_task_ids'] ?? []) !== $ids || $results->count() !== count($ids) || $results->contains(fn ($result) => $result->input_version !== $result->evaluated_input_version);
        $candidateIds = array_column($group?->evidence['shipments'] ?? [], 'id');
        $from = PickupResultPeriod::start($date)->utc();
        $query = JneShipment::where(function (Builder $scope) use ($ids, $candidateIds, $task, $from): void {
            $scope->where(fn (Builder $owned) => $owned->where(fn (Builder $rows) => $rows->whereIn('pickup_task_id', $ids)->orWhereIn('id', $candidateIds))
                ->where(fn (Builder $rows) => $rows->whereNull('pickup_task_id')->orWhereIn('pickup_task_id', $ids)))
                ->orWhere(fn (Builder $rows) => $rows->whereNull('pickup_task_id')->where('customer_id', $task->customer_id)->whereHas('latestSource', fn ($source) => $source->where('entry_at', '>=', $from)->where('entry_at', '<', $from->addDay()))
                    ->whereNotExists(fn ($excluded) => $excluded->selectRaw('1')->from('pickup_awb_exclusions')->whereColumn('jne_shipment_id', 'jne_shipments.id')->whereIn('pickup_task_id', $ids)));
        });
        $columns = ['id', 'awb', 'version', 'pickup_task_id', 'category', 'category_status', 'match_status', 'customer_match_status'];
        $manifests = PickupAwbManifest::whereIn('pickup_task_id', $ids)->with('deliveries');
        $active = (clone $manifests)->where('status', '!=', 'SUPERSEDED')->latest('id')->first();
        $delivery = $active?->deliveries->sortByDesc('id')->first();
        $attention = in_array($delivery?->status, ['UNKNOWN', 'FAILED'], true) ? ($delivery->last_error ?: 'Pengiriman perlu diperiksa.') : (in_array($active?->status, ['FAILED', 'REVIEW'], true) ? ($active->last_error ?: 'Dokumen perlu diperiksa.') : null);
        $final = $members->every(fn ($member) => $member->proof?->finalized_at !== null);
        $verified = $members->every(fn ($member) => $member->handoverItem && ! $member->handoverItem->needsReview() && ($member->handoverItem->effectiveValues()['status'] ?? '') === 'VERIFIED');
        $reconciliation = $group ? [...$group->toArray(), 'status' => $dirty ? 'NOT_EVALUATED' : $group->status, 'input_version' => (int) $results->max('input_version'), 'review_open' => $results->contains('review_open', true), 'last_error' => $results->firstWhere('last_error', '!=', null)?->last_error] : null;
        $customer = Customer::findOrFail($task->customer_id);
        $empty = fn () => new LengthAwarePaginator([], 0, 20);

        return response()->json([
            'selected_task_id' => $task->id,
            'task' => ['id' => $task->id, 'reference' => $date.' · '.count($ids).' pickup', 'customer_id' => $customer->id, 'customer_name_snapshot' => $customer->name],
            'customer_day' => ['id' => $group?->id, 'business_date' => $date, 'pickup_count' => count($ids), 'members' => $members->map(fn ($member): array => [
                'id' => $member->id, 'reference' => $member->reference, 'staff_name' => $member->assignedStaff?->name,
                'picked_up_at' => $member->proof?->picked_up_at, 'status' => $results->get($member->id)->status ?? 'NOT_EVALUATED',
                'categories' => $results->get($member->id)->categories ?? [],
            ])->all()],
            'context' => ['customer_code' => $customer->customer_code, 'staff_name' => $members->pluck('assignedStaff.name')->filter()->unique()->implode(', ') ?: null,
                'scheduled_at' => $members->min('scheduled_at'), 'visited_at' => $members->min('proof.picked_up_at'), 'finalized_at' => $final ? $members->max('proof.finalized_at') : null,
                'verified_at' => $verified ? $members->map(fn ($member) => $member->handoverItem->effectiveValues()['verified_at'] ?? null)->max() : null,
                'imported_at' => ReportJob::whereIn('id', (clone $query)->select('latest_report_job_id'))->max('imported_at'), 'warehouse_needs_review' => ! $verified],
            'reconciliation' => $reconciliation, 'delivery_attention' => $attention, 'business_date' => $date, 'shipment_query' => '',
            'shipments' => (clone $query)->orderBy('awb')->paginate(50, $columns),
            'assigned_shipments' => (clone $query)->whereIn('pickup_task_id', $ids)->orderBy('awb')->paginate(20, $columns, 'attached_page'),
            'pending_items' => PickupPendingItem::whereIn('pickup_task_id', $ids)->with('shipment:id,awb')->orderByDesc('id')->paginate(20, ['*'], 'pending_page'),
            'excluded' => $empty(), 'review_events' => $empty(),
            'manifests' => $manifests->orderByDesc('id')->paginate(10, ['*'], 'manifest_page'),
            'preference' => CustomerAwbDeliveryPreference::where('customer_id', $customer->id)->first(),
            'history' => DB::table('pickup_customer_reconciliation_events')->where('customer_reconciliation_id', $group?->id)->orderByDesc('revision')->paginate(10, ['*'], 'history_page'),
            'send_enabled' => (bool) config('pickup.automation.send_enabled'),
        ]);
    }

    public function recheck(Request $request, PickupTask $task, QueuePickupReconciliations $queue): RedirectResponse
    {
        $this->authorizeAdmin($request);
        abort_unless(config('pickup.automation.enabled'), 409, 'Otomatisasi pickup belum diaktifkan.');
        $queue->handle(app(ReconcileCustomerPickupDay::class)->memberIds($task) ?: [$task->id], invalidate: false);

        return back()->with('success', 'Pickup diantrekan untuk diperiksa.');
    }

    public function bulkRecheck(PickupResultRequest $request, QueryPickupAutomation $automation): JsonResponse
    {
        abort_unless(config('pickup.automation.enabled'), 409, 'Otomatisasi pickup belum diaktifkan.');
        $filters = $request->validated();
        $this->rejectBacklog($filters);
        $query = $automation->query($filters);
        if (array_key_exists('selected_ids', $filters)) {
            $query->whereIn('id', array_map(intval(...), $filters['selected_ids']));
        }
        $matchedCount = (clone $query)->count();
        $ids = array_values($query->whereNotNull('queue_task_id')->pluck('queue_task_id')->map(fn ($id): int => (int) $id)->all());
        if ($ids !== []) {
            QueueBulkPickupReconciliationsJob::dispatch($ids)->afterCommit();
        }

        $skipped = $matchedCount - count($ids);

        return response()->json(['queued_count' => count($ids), 'skipped_count' => $skipped,
            'message' => count($ids).' customer / hari diantrekan untuk validasi otomatis.'.($skipped > 0 ? ' '.$skipped.' kelompok belum memiliki POP final dan dilewati.' : '').' Hasil akan diperbarui setelah worker selesai.',
        ], 202);
    }

    public function preference(UpdateAwbDeliveryPreferenceRequest $request, PickupTask $task, QueuePickupReconciliations $queue): RedirectResponse
    {
        $data = $request->validated();
        DB::transaction(function () use ($request, $task, $data, $queue): void {
            Customer::whereKey($task->customer_id)->lockForUpdate()->firstOrFail();
            $preference = CustomerAwbDeliveryPreference::where('customer_id', $task->customer_id)->lockForUpdate()->first();
            abort_unless(($preference === null ? 0 : $preference->revision) === (int) $data['expected_revision'], 409, 'Preferensi customer berubah. Muat ulang sebelum menyimpan.');
            $before = $preference?->only(['enabled', 'recipient', 'revision']) ?? [];
            $preference ??= new CustomerAwbDeliveryPreference(['customer_id' => $task->customer_id, 'revision' => 0]);
            $preference->fill(['enabled' => (bool) $data['enabled'], 'channel' => 'email', 'recipient' => isset($data['recipient']) ? mb_strtolower(trim($data['recipient'])) : null, 'revision' => $preference->revision + 1, 'updated_by' => $request->user()->id])->save();
            DB::table('customer_awb_delivery_preference_events')->insert(['customer_id' => $task->customer_id, 'actor_id' => $request->user()->id, 'revision' => $preference->revision,
                'before' => json_encode($before, JSON_THROW_ON_ERROR), 'after' => json_encode($preference->only(['enabled', 'recipient', 'revision']), JSON_THROW_ON_ERROR), 'reason' => $data['reason'], 'created_at' => now()]);
            $queue->handle(array_values(PickupTask::where('customer_id', $task->customer_id)->whereHas('proof')->pluck('id')->map(fn ($id): int => $id)->all()));
        });

        return back()->with('success', 'Preferensi pengiriman customer disimpan.');
    }

    public function download(Request $request, PickupTask $task, PickupAwbManifest $manifest, string $format): StreamedResponse
    {
        $this->authorizeAdmin($request);
        abort_unless($manifest->pickup_task_id === $task->id || ($manifest->customer_reconciliation_id && in_array($task->id, $manifest->snapshot['pickup_task_ids'] ?? [], true)), 404);
        abort_unless(in_array($format, ['xlsx', 'pdf'], true), 404);
        $path = $manifest->getAttribute($format.'_path');
        abort_unless(is_string($path) && Storage::disk('local')->exists($path), 404, 'Dokumen belum tersedia.');
        abort_unless(hash_equals($manifest->checksums[$format] ?? '', hash('sha256', Storage::disk('local')->get($path))), 409, 'Checksum dokumen berubah; periksa sumber tersimpan.');

        return Storage::disk('local')->download($path, 'resi-'.Str::slug($manifest->snapshot['reference']).'-v'.$manifest->revision.'.'.$format);
    }

    public function retryDocument(Request $request, PickupTask $task, PickupAwbManifest $manifest): RedirectResponse
    {
        $this->authorizeAdmin($request);
        abort_unless($manifest->pickup_task_id === $task->id || ($manifest->customer_reconciliation_id && in_array($task->id, $manifest->snapshot['pickup_task_ids'] ?? [], true)), 404);
        DB::transaction(function () use ($manifest): void {
            $current = PickupAwbManifest::whereKey($manifest->id)->lockForUpdate()->firstOrFail();
            abort_unless($current->status === 'FAILED', 409, 'Dokumen tidak dalam keadaan gagal.');
            $current->update(['status' => 'PENDING', 'render_attempts' => 0, 'next_render_at' => null]);
            RenderPickupAwbManifestJob::dispatch($current->id)->afterCommit();
        });

        return back()->with('success', 'Dokumen diantrekan ulang.');
    }

    public function candidates(Request $request, PickupTask $task, QueryPickupAwbCandidates $candidates): JsonResponse
    {
        $this->authorizeAdmin($request);
        $filters = $request->validate(['q' => ['nullable', 'string', 'max:100'], 'pending_id' => ['nullable', 'integer', 'min:1'], 'process_date' => ['nullable', 'date_format:Y-m-d'], 'page' => ['nullable', 'integer', 'min:1']]);

        return response()->json($candidates->handle($task, $filters));
    }

    public function review(ReviewPickupAwbsRequest $request, PickupTask $task, ReviewPickupAwbs $review): JsonResponse
    {
        $result = $review->handle($request->user(), $task->id, $request->validated());

        return response()->json(['status' => $result->status, 'input_version' => $result->input_version]);
    }

    public function pending(Request $request): JsonResponse
    {
        $this->authorizeAdmin($request);
        $filters = $request->validate(['q' => ['nullable', 'string', 'max:100'], 'page' => ['nullable', 'integer', 'min:1']]);
        $query = PickupPendingItem::whereIn('status', ['PENDING', 'READY'])->with(['pickup:id,reference,customer_name_snapshot,customer_id', 'pickup.proof:id,pickup_task_id,picked_up_at']);
        if (! empty($filters['q'])) {
            $query->where(fn ($search) => $search->where('label', 'like', '%'.$filters['q'].'%')->orWhereHas('pickup', fn ($task) => $task->where('reference', 'like', '%'.$filters['q'].'%')->orWhere('customer_name_snapshot', 'like', '%'.$filters['q'].'%')));
        }

        return response()->json($query->orderBy('id')->paginate(20));
    }

    /** @param array<string, mixed> $filters */
    private function rejectBacklog(array $filters): void
    {
        if (in_array($filters['scope'] ?? '', ['backlog', 'backlog_origin'], true)) {
            throw ValidationException::withMessages(['scope' => 'Rekonsiliasi memakai bucket 05.00–04.59. Lintas hari hanya melalui barang pending yang tercatat.']);
        }
    }

    private function authorizeAdmin(Request $request): void
    {
        abort_unless($request->user()?->is_active && $request->user()->role === 'admin_supervisor', 403);
    }
}
