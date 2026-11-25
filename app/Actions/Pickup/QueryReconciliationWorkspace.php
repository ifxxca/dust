<?php

namespace App\Actions\Pickup;

use App\Actions\Reports\AssessJneReportCollection;
use App\Models\Customer;
use App\Models\CustomerAwbDeliveryPreference;
use App\Models\JneReportAwb;
use App\Models\JneShipment;
use App\Models\JneSourceContract;
use App\Models\PickupAwbManifest;
use App\Models\PickupCustomerReconciliation;
use App\Models\PickupPendingItem;
use App\Models\PickupProcessingReconciliation;
use App\Models\PickupProcessingRecord;
use App\Models\PickupTask;
use App\Models\ReportJob;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\DB;

class QueryReconciliationWorkspace
{
    public const MATERIAL_FIELDS = ['id', 'awb', 'pickup_task_id', 'customer_id', 'category', 'match_status', 'category_status', 'customer_match_status', 'tracking_status'];

    public function __construct(private ReconcileCustomerPickupDay $days, private AssessPickupReportCoverage $coverage, private AssessJneReportCollection $collections) {}

    /** @return Collection<int, PickupTask> */
    public function members(PickupTask $task): Collection
    {
        return PickupTask::whereIn('id', $this->days->memberIds($task) ?: [$task->id])->orderBy('id')
            ->with(['proof.revisions', 'handoverItem.revisions', 'handoverItem.proof.revisions', 'assignedStaff'])->get();
    }

    public function group(PickupTask $task): ?PickupCustomerReconciliation
    {
        $task->loadMissing('proof');

        return PickupCustomerReconciliation::where('customer_id', $task->customer_id)->whereDate('business_date', PickupResultPeriod::date($task->proof?->picked_up_at ?? $task->scheduled_at)->toDateString())->first();
    }

    /**
     * @param  list<int>  $ids
     * @return Builder<JneShipment>
     */
    public function scope(PickupTask $task, array $ids): Builder
    {
        $task->loadMissing('proof');
        $from = PickupResultPeriod::start(PickupResultPeriod::date($task->proof?->picked_up_at ?? $task->scheduled_at)->toDateString())->utc();

        $assigned = JneShipment::select('id as scoped_shipment_id')->whereIn('pickup_task_id', $ids);
        $unassigned = JneShipment::select('id as scoped_shipment_id')->whereNull('pickup_task_id')->where('customer_id', $task->customer_id)
            ->whereHas('latestSource', fn ($source) => $source->where('entry_at', '>=', $from)->where('entry_at', '<', $from->addDay()));

        return JneShipment::select('jne_shipments.*')->joinSub($assigned->unionAll($unassigned)->toBase(), 'workspace_ids', 'workspace_ids.scoped_shipment_id', '=', 'jne_shipments.id')
            ->whereNotExists(fn ($excluded) => $excluded->selectRaw('1')->from('pickup_awb_exclusions')->whereColumn('jne_shipment_id', 'jne_shipments.id')->whereIn('pickup_task_id', $ids));
    }

    /** @return array<string, mixed> */
    public function handle(PickupTask $task): array
    {
        $members = $this->members($task);
        $ids = $members->modelKeys();
        $group = $this->group($task);
        $results = PickupProcessingReconciliation::whereIn('pickup_task_id', $ids)->get();
        $customer = Customer::findOrFail($task->customer_id);
        $rows = $this->scope($task, $ids)->orderBy('id')
            ->with(['latestSource:id,report_job_id', 'latestSource.reportJob:id,status,import_status,projection_status'])->get();
        $coverage = $members->map(fn (PickupTask $member): array => ['task_id' => $member->id, ...$this->coverage->handle($member)])->all();
        $complete = $coverage !== [] && collect($coverage)->every('complete');
        $dirty = ! $group || ($group->evidence['pickup_task_ids'] ?? []) !== $ids || $results->count() !== count($ids)
            || $results->contains(fn ($result): bool => $result->input_version !== $result->evaluated_input_version);
        $storedRows = collect($group?->evidence['shipments'] ?? [])->keyBy('id');
        if (! $dirty) {
            $dirty = $storedRows->count() !== $rows->count() || $rows->contains(fn (JneShipment $row): bool => $row->only(array_keys($storedRows->get($row->id, []))) !== $storedRows->get($row->id, []));
        }
        $categories = $group?->categories ?? [];
        if ($categories !== []) {
            $dirty = $dirty || collect(PickupProcessingRecord::CATEGORIES)->contains(fn (string $category): bool => ($categories[$category]['pop'] ?? null) !== ($members->every(fn ($member): bool => $member->proof?->finalized_at !== null) ? $members->sum(fn ($member): int => (int) $member->proof->effectiveValues()[$category]) : null)
                || ($categories[$category]['received'] ?? null) !== ($members->every(fn ($member): bool => $member->handoverItem !== null && $member->handoverItem->status !== 'PENDING') ? $members->sum(fn ($member): int => (int) $member->handoverItem->effectiveValues()[$category]) : null));
        }
        $blockers = $group?->reasons ?? [];
        $baselineValid = $members->every(function (PickupTask $member): bool {
            $proof = $member->proof;
            $handover = $member->handoverItem;
            if (! $proof?->finalized_at || ! $handover || $handover->needsReview() || $handover->effectiveValues()['status'] !== 'VERIFIED') {
                return false;
            }

            return collect(PickupProcessingRecord::CATEGORIES)->every(fn (string $category): bool => (int) $proof->effectiveValues()[$category] === (int) $handover->effectiveValues()[$category]);
        });
        if (! $baselineValid || ! $customer->is_active) {
            $blockers[] = 'Baseline POP/gudang atau customer belum memenuhi syarat terkini.';
        }
        if ($dirty) {
            $blockers[] = 'Bukti atau input berubah / belum dihitung. Antrekan validasi ulang.';
        }
        if ($group?->status !== 'DONE') {
            $blockers[] = 'Jumlah per kategori dan baseline POP/gudang belum terverifikasi.';
        }
        $unresolved = $rows->filter(fn (JneShipment $row): bool => $row->customer_match_status !== 'MATCHED' || $row->category_status !== 'MATCHED' || $row->match_status !== 'MATCHED' || $row->customer_id !== $task->customer_id || $row->tracking_status === 'CANCELLED' || $row->latestSource?->reportJob?->workflowStage() !== 'READY');
        if ($unresolved->isNotEmpty()) {
            $blockers[] = $unresolved->count().' AWB mempunyai atribusi atau kategori yang belum konsisten.';
        }
        $hasOpenReview = $results->contains('review_open', true);
        $hasPendingItems = PickupPendingItem::whereIn('pickup_task_id', $ids)->whereIn('status', ['PENDING', 'READY'])->exists();
        if ($hasOpenReview || $hasPendingItems) {
            $blockers[] = 'Review atau barang pending belum diselesaikan.';
        }
        $blockers = array_values(array_unique($blockers));
        $verified = $blockers === [];
        $found = $rows->groupBy('category')->map->count();
        $breakdown = [];
        foreach (PickupProcessingRecord::CATEGORIES as $category) {
            $count = $categories[$category] ?? [];
            $breakdown[$category] = [...$count, 'observed' => ! isset($found[$category]) && ! $complete ? null : (int) ($found[$category] ?? 0),
                'status' => $dirty ? 'NOT_EVALUATED' : (! $baselineValid || ! isset($count['expected']) ? 'UNKNOWN' : ((($count['shortfall'] ?? 0) + ($count['excess'] ?? 0)) > 0 ? 'DISCREPANCY' : 'MATCHED'))];
        }
        $expected = $categories !== [] && collect($categories)->every(fn (array $row): bool => isset($row['expected'])) ? array_sum(array_column($categories, 'expected')) : null;
        $missing = array_sum(array_column($categories, 'shortfall'));
        $excess = array_sum(array_column($categories, 'excess'));
        $quantityStatus = $dirty ? 'NOT_EVALUATED' : (! $baselineValid || $expected === null ? 'UNKNOWN'
            : ($unresolved->isNotEmpty() || ($missing > 0 && $excess > 0) ? 'CONFLICT'
                : ($excess > 0 ? 'EXCESS' : ($missing > 0 ? 'SHORTAGE' : 'MATCHED'))));
        $reports = $this->sourcePanel($task, $coverage, $complete);
        $lastReview = DB::table('pickup_awb_review_events')->whereIn('pickup_task_id', $ids)->join('users', 'users.id', '=', 'actor_id')->latest('pickup_awb_review_events.id')->value('users.name');
        $fingerprint = self::fingerprint($group?->status, $categories, $ids, $rows->map->only(['id', 'awb', 'pickup_task_id', 'customer_id', 'category', 'match_status', 'category_status', 'customer_match_status'])->all());
        $approval = $group?->approval_snapshot;
        $materialFingerprint = self::materialFingerprint($categories, $ids, $rows->map->only(self::MATERIAL_FIELDS)->all());
        $approvedFingerprint = $approval ? ($approval['material_fingerprint'] ?? self::materialFingerprint($approval['categories'], array_column($approval['members'], 'id'), $approval['included_awbs'])) : null;
        $postLock = $approval && ($materialFingerprint !== $approvedFingerprint || $group->post_lock_change !== null);
        $discrepancies = [];
        $cases = [
            'UNKNOWN_CUSTOMER' => $rows->filter(fn ($row): bool => $row->customer_match_status === 'UNMATCHED'),
            'AMBIGUOUS_ATTRIBUTION' => $rows->filter(fn ($row): bool => $row->customer_match_status === 'AMBIGUOUS' || $row->match_status === 'AMBIGUOUS'),
            'CATEGORY_MISMATCH' => $rows->filter(fn ($row): bool => $row->category_status !== 'MATCHED'),
            'CONFLICTING_EVIDENCE' => $rows->filter(fn ($row): bool => $row->customer_match_status === 'CONFLICT' || $row->match_status === 'CONFLICT' || ($row->customer_id !== null && $row->customer_id !== $task->customer_id)),
            'CANCELLED_AWB' => $rows->where('tracking_status', 'CANCELLED'),
            'SOURCE_UNREADY' => $rows->filter(fn ($row): bool => $row->latestSource?->reportJob?->workflowStage() !== 'READY'),
        ];
        foreach ($cases as $type => $affected) {
            if ($affected->isNotEmpty()) {
                $discrepancies[] = ['type' => $type, 'affected_count' => $affected->count(), 'affected_awbs' => $affected->take(20)->map->only(['id', 'awb', 'category', 'latest_report_job_id'])->values()->all(),
                    'reason' => $affected->count().' AWB membutuhkan pemeriksaan bukti pada kelompok ini.', 'next_action' => 'Buka AWB terkait untuk melihat sumber, aturan pencocokan, dan riwayat koreksi.'];
            }
        }
        foreach ($breakdown as $category => $values) {
            foreach (['shortfall' => 'MISSING', 'excess' => 'EXCESS'] as $key => $type) {
                if (! $dirty && $baselineValid && ($values[$key] ?? 0) > 0) {
                    $discrepancies[] = ['type' => $type, 'category' => $category, 'expected' => $values['expected'], 'observed' => $values['confirmed'], 'difference' => $values[$key], 'next_action' => $type === 'MISSING' ? 'Cari AWB dari sumber; jangan mengubah jumlah POP.' : 'Periksa identitas dan sumber AWB sebelum koreksi.'];
                }
            }
        }
        foreach ($blockers as $reason) {
            $discrepancies[] = ['type' => str_contains($reason, 'sumber') ? 'SOURCE_INCOMPLETE' : 'REVIEW', 'reason' => $reason, 'next_action' => 'Periksa bukti terkait dan validasi ulang.'];
        }
        if ($postLock) {
            $discrepancies[] = ['type' => 'POST_LOCK', 'reason' => 'Bukti terkini berbeda atau tidak lagi memenuhi verifikasi snapshot yang dikunci.', 'next_action' => 'Tinjau selisih; snapshot persetujuan tetap dipertahankan.'];
        }

        return ['header' => ['customer' => $customer->only(['id', 'name', 'customer_code']), 'business_date' => PickupResultPeriod::date($task->proof?->picked_up_at ?? $task->scheduled_at)->toDateString(),
            'account_mappings' => $customer->shipperAliases()->where('is_active', true)->get(['shipper_name', 'account_scope']), 'pickup_count' => count($ids), 'evaluated_at' => $group?->evaluated_at,
            'last_import_at' => ReportJob::whereIn('id', $rows->pluck('latest_report_job_id')->filter()->unique())->max('imported_at'), 'last_reviewer' => $approval['reviewer']['name'] ?? $lastReview],
            'status' => $approval ? ($postLock ? 'LOCKED_REVIEW' : 'LOCKED') : ($verified ? 'VERIFIED' : ($reports['status'] === 'FAILED' ? 'PROCESSING_FAILED' : ($group ? 'IN_REVIEW' : 'OPEN'))),
            'calculation_status' => $group?->status ?? 'NOT_EVALUATED', 'quantity_status' => $quantityStatus, 'version' => $group?->revision ?? 0, 'dirty' => $dirty, 'eligible' => $verified, 'blockers' => $blockers,
            'closure' => self::closure($members, $approval !== null),
            'metrics' => ['expected' => $expected, 'observed' => $rows->isEmpty() && ! $complete ? null : $rows->count(), 'matched' => $group === null ? null : array_sum(array_column($categories, 'confirmed')),
                'missing' => $expected === null ? null : array_sum(array_column($categories, 'shortfall')), 'excess' => $expected === null ? null : array_sum(array_column($categories, 'excess')),
                'unmatched' => $rows->where('customer_match_status', 'UNMATCHED')->count(), 'ambiguous' => $rows->whereIn('customer_match_status', ['AMBIGUOUS', 'CONFLICT'])->count(), 'pending_review' => $unresolved->count(),
                'confirmed_discrepancies' => $complete && ! $dirty && $group !== null ? collect($categories)->filter(fn (array $row): bool => ($row['shortfall'] ?? 0) > 0 || ($row['excess'] ?? 0) > 0)->count() : null],
            'categories' => $breakdown, 'coverage' => ['status' => $complete ? 'COMPLETE' : $reports['status'], 'required_for_lock' => false, 'members' => $coverage, 'requirements' => $reports['rows']],
            'members' => $members->map(fn (PickupTask $member): array => ['id' => $member->id, 'reference' => $member->reference, 'staff_name' => $member->assignedStaff?->name,
                'pop' => $member->proof?->effectiveValues(), 'handover' => $member->handoverItem?->effectiveValues(), 'session_id' => $member->handoverItem?->handover_session_id])->all(),
            'discrepancies' => $discrepancies, 'approval' => $approval ? array_intersect_key($approval, array_flip(['mode', 'reviewer', 'locked_at', 'reason', 'version', 'fingerprint', 'included_count', 'categories', 'exception'])) : null,
            'post_lock_change' => $group?->post_lock_change, 'post_lock_review' => $postLock,
            'fingerprint' => $fingerprint, 'review_token' => self::reviewToken($rows), 'documents' => PickupAwbManifest::whereIn('pickup_task_id', $ids)->with('deliveries')->latest('id')->paginate(10, ['*'], 'document_page'),
            'delivery' => ['preference' => CustomerAwbDeliveryPreference::effectiveForCustomer($customer->id)?->deliverySettings(), 'send_enabled' => (bool) config('pickup.automation.send_enabled')],
            'history' => DB::table('pickup_customer_reconciliation_events')->where('customer_reconciliation_id', $group?->id)->latest('revision')->paginate(10, ['*'], 'history_page')->through(function (object $event): object {
                $event->snapshot = json_encode(self::historySummary(json_decode($event->snapshot, true, flags: JSON_THROW_ON_ERROR)), JSON_THROW_ON_ERROR);

                return $event;
            })];
    }

    /** @param Collection<int, PickupTask> $members
     * @return array{ready: bool, validated_at: ?string, due_at: ?string, overdue: bool}
     */
    public static function closure(Collection $members, bool $closed = false): array
    {
        $first = $members->map(fn (PickupTask $member): ?string => $member->handoverItem?->verified_at?->toIso8601String())->filter()->sort()->first();
        $validated = $first ? CarbonImmutable::parse($first) : null;
        $due = $validated?->addHours(12);

        return ['ready' => $members->isNotEmpty() && $members->every(fn (PickupTask $member): bool => $member->proof?->finalized_at !== null && $member->handoverItem?->verified_at !== null
            && in_array($member->handoverItem->effectiveValues()['status'], ['VERIFIED', 'DISCREPANCY'], true) && ! $member->handoverItem->needsReview()),
            'validated_at' => $validated?->toIso8601String(), 'due_at' => $due?->toIso8601String(), 'overdue' => ! $closed && $due !== null && now()->greaterThanOrEqualTo($due)];
    }

    /** @param array<string, mixed> $snapshot
     * @return array<string, mixed>
     */
    public static function historySummary(array $snapshot): array
    {
        return array_intersect_key($snapshot, array_flip(['event', 'mode', 'status', 'reason', 'reasons', 'reviewer', 'locked_at', 'version', 'fingerprint', 'included_count', 'categories', 'detected_at', 'approved_version', 'added_count', 'removed_count', 'coverage_complete', 'exception']));
    }

    /** @param list<array<string, mixed>> $coverage
     * @return array{status: string, rows: list<array<string, mixed>>}
     */
    private function sourcePanel(PickupTask $task, array $coverage, bool $complete): array
    {
        $date = PickupResultPeriod::date($task->proof?->picked_up_at ?? $task->scheduled_at)->toDateString();
        $contracts = JneSourceContract::whereNotNull('active_key')->whereNotNull('verified_at')->get();
        $requirements = $contracts->flatMap(fn ($contract) => $contract->definition['collection_requirements'] ?? [])->unique()->values();
        $groups = $requirements->isEmpty() ? collect() : DB::table('report_jobs')->whereDate('date_from', '<=', $date)->whereDate('date_thru', '>=', $date)
            ->where(function ($match) use ($requirements): void {
                foreach ($requirements as $requirement) {
                    $parts = explode(':', $requirement, 3);
                    $match->orWhere(fn ($scope) => $scope->where('source', $parts[0])->where('report_type', $parts[1] ?? 'unresolved')->when(isset($parts[2]), fn ($account) => $account->where('customer_account', $parts[2])));
                }
            })->select('source', 'report_type', 'customer_account')->selectRaw('max(id) as last_id, max(case when status = ? and import_status = ? and projection_status = ? then id end) as success_id', ['COMPLETED', 'IMPORTED', 'PROJECTED'])
            ->groupBy('source', 'report_type', 'customer_account')->get();
        $reports = ReportJob::whereIn('id', $groups->pluck('last_id')->merge($groups->pluck('success_id'))->filter()->unique())->get()->keyBy('id');
        $linked = JneReportAwb::whereIn('report_job_id', $reports->modelKeys())->whereIn('awb', $this->scope($task, array_column($coverage, 'task_id'))->select('awb'))
            ->select('report_job_id')->selectRaw('count(distinct awb) as count')->groupBy('report_job_id')->pluck('count', 'report_job_id');
        $rows = [];
        foreach ($requirements as $requirement) {
            $parts = explode(':', $requirement, 3);
            $applicable = $groups->filter(fn ($row): bool => $row->source === $parts[0] && $row->report_type === ($parts[1] ?? 'unresolved') && (! isset($parts[2]) || $row->customer_account === $parts[2]));
            $last = $reports->get($applicable->max('last_id'));
            $success = $reports->get($applicable->max('success_id'));
            $contract = $last ? $contracts->firstWhere('active_key', JneSourceContract::key($last->source, $last->report_type)) : null;
            $assessment = $last ? $this->collections->handle($last, $contract) : null;
            $reasons = $assessment['reasons'] ?? [];
            if (! $last) {
                $reasons[] = 'Report yang mencakup tanggal ini belum ditemukan.';
            }
            if (! config('jne-reports.evidence_policies_enabled') || ! config('jne-reports.category_reconciliation_enabled')) {
                $reasons[] = 'Kebijakan bukti/kategori belum diaktifkan.';
            }
            $trace = collect($coverage)->flatMap(fn (array $member): array => $member['requirements'] ?? [])->first(fn (array $row): bool => ($row['requirement'] ?? null) === $requirement && ($row['date'] ?? null) === $date);
            $rows[] = ['requirement' => $requirement, 'date' => $date, 'report_id' => $last?->id, 'run_id' => $last?->hybrid_batch_id ?? $last?->id, 'status' => $last?->status ?? 'UNKNOWN', 'import_status' => $last?->import_status,
                'collection_state' => $assessment['state'] ?? 'UNKNOWN', 'latest_attempt_id' => $last?->id,
                'latest_successful_id' => $success?->id, 'latest_coverage_eligible_id' => $trace['latest_coverage_eligible_id'] ?? null,
                'projection_status' => $last?->projection_status, 'last_attempt_at' => $last?->created_at, 'last_success_at' => $success?->imported_at,
                'record_count' => $last?->row_count, 'failure_reason' => $last?->error_message ?? $last?->import_error ?? $last?->projection_error, 'checksum' => $last?->file_checksum,
                'linked_awb_count' => (int) $linked->get($last?->id, 0), 'blocking_reasons' => $reasons,
                'coverage_verified' => $complete && collect($coverage)->flatMap(fn ($row) => $row['reports'] ?? [])->contains($last?->id)];
        }
        $status = $requirements->isEmpty() ? 'UNKNOWN' : (collect($rows)->contains(fn ($row): bool => in_array($row['status'], ['FAILED', 'NEEDS_ATTENTION'], true) || $row['import_status'] === 'FAILED' || $row['projection_status'] === 'FAILED') ? 'FAILED'
            : (collect($rows)->contains(fn ($row): bool => in_array($row['status'], ['QUEUED', 'RUNNING', 'WAITING_REPORT', 'PREPARING', 'DOWNLOADING'], true) || $row['import_status'] === 'QUEUED') ? 'PENDING' : 'INCOMPLETE'));

        return ['status' => $status, 'rows' => $rows];
    }

    /** @param array<string, mixed> $categories
     * @param  list<int>  $ids
     * @param  list<array<string, mixed>>  $shipments
     */
    public static function fingerprint(?string $status, array $categories, array $ids, array $shipments): string
    {
        usort($shipments, fn (array $a, array $b): int => $a['id'] <=> $b['id']);

        return hash('sha256', json_encode([$status, $categories, $ids, $shipments], JSON_THROW_ON_ERROR));
    }

    /** @param array<string, mixed> $categories
     * @param  list<int>  $ids
     * @param  list<array<string, mixed>>  $shipments
     */
    public static function materialFingerprint(array $categories, array $ids, array $shipments): string
    {
        $counts = [];
        foreach (PickupProcessingRecord::CATEGORIES as $category) {
            $keys = array_fill_keys(['pop', 'received', 'expected', 'confirmed', 'shortfall', 'excess'], null);
            $counts[$category] = array_replace($keys, array_intersect_key($categories[$category] ?? [], $keys));
        }
        $keys = array_fill_keys(['id', 'awb', 'pickup_task_id', 'customer_id', 'category', 'match_status', 'category_status', 'customer_match_status'], null);
        $rows = array_map(fn (array $row): array => [...array_replace($keys, array_intersect_key($row, $keys)), 'cancelled' => ($row['tracking_status'] ?? null) === 'CANCELLED'], $shipments);

        return self::fingerprint(null, $counts, $ids, $rows);
    }

    /** @param Collection<int, JneShipment> $rows */
    public static function reviewToken(Collection $rows): string
    {
        return hash('sha256', json_encode($rows->sortBy('id')->map->only(['id', 'version', 'latest_report_awb_id', 'latest_report_job_id'])->values()->all(), JSON_THROW_ON_ERROR));
    }
}
