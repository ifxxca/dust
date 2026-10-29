<?php

namespace App\Actions\Reports;

use App\Actions\Pickup\AllocatePickupAwbBuckets;
use App\Actions\Pickup\PickupAwbEligibility;
use App\Actions\Pickup\PickupResultPeriod;
use App\Models\Customer;
use App\Models\JneReportAwb;
use App\Models\JneShipment;
use App\Models\JneShipmentMatchEvent;
use App\Models\JneShipperAlias;
use App\Models\PickupCashlessAwb;
use App\Models\PickupPendingItem;
use App\Models\PickupProcessingReconciliation;
use App\Models\PickupProcessingRecord;
use App\Models\PickupTask;
use App\Models\User;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class MatchJneShipments
{
    /** @var array<int, PickupTask> */
    private array $allocationTasks = [];

    /** @var array<int, bool> */
    private array $allocationBlocks = [];

    /** @var array<string, bool> */
    private array $allocationExclusions = [];

    public function __construct(private ResolveJneCustomers $resolver, private SuggestJneCustomers $suggestions, private MatchJnePickupDates $dates) {}

    /**
     * @param  Collection<int, JneReportAwb>  $sources
     * @return array<int, array{customer_id: ?int, status: string, method: string, note: string, pickups: list<int>, candidates: list<array<string, mixed>>, evidence: list<array<string, mixed>>}>
     */
    public function candidates(Collection $sources): array
    {
        $history = collect();
        foreach ($sources->pluck('awb')->unique()->chunk(500) as $awbs) {
            $history = $history->concat(JneReportAwb::whereIn('awb', $awbs)->orderBy('id')->get(['id', 'report_job_id', 'awb', 'shipper_name', 'reference', 'customer_account', 'raw_data', 'entry_at']));
        }
        $byAwb = $history->groupBy('awb');
        $exact = $this->resolver->handle($history);
        $unresolvedNames = $history->filter(fn (JneReportAwb $row): bool => $exact[$row->id]['status'] === 'UNMATCHED')
            ->map(fn (JneReportAwb $row): string => JneShipperAlias::normalize($row->shipper_name ?? ''))->filter()->unique()->values()->all();
        $suggestions = $this->suggestions->handle(array_values($unresolvedNames));
        $resolved = [];
        foreach ($sources as $source) {
            $rows = $byAwb->get($source->awb, collect([$source]));
            $decisions = $rows->map(fn (JneReportAwb $row): array => $exact[$row->id]);
            $ids = $decisions->where('status', 'MATCHED')->pluck('customer_id')->unique()->values();
            $ambiguous = $decisions->contains('status', 'AMBIGUOUS');
            $conflict = $decisions->contains('status', 'CONFLICT');
            $customer = $exact[$source->id];
            if ($ids->count() === 1 && ! $ambiguous) {
                $customer = $decisions->firstWhere('status', 'MATCHED') ?? $customer;
            }
            $customer['customer_id'] = $ids->count() === 1 && ! $ambiguous && ! $conflict ? (int) $ids->first() : null;
            $customer['status'] = $conflict || $ids->count() > 1 || ($ambiguous && $ids->isNotEmpty()) ? 'CONFLICT' : ($ambiguous ? 'AMBIGUOUS' : ($ids->count() === 1 ? 'MATCHED' : 'UNMATCHED'));
            $customer['evidence'] = [];
            foreach ($decisions as $decision) {
                foreach ($decision['evidence'] as $evidence) {
                    $customer['evidence'][] = $evidence;
                }
            }
            $customer['candidates'] = [];
            if ($customer['status'] === 'CONFLICT') {
                $customer['note'] = 'Bukti nama pengirim dari beberapa report bertentangan. Customer dan pickup harus diperiksa.';
            } elseif ($customer['status'] === 'UNMATCHED') {
                $customer['candidates'] = array_values($rows->flatMap(fn (JneReportAwb $row): array => [...($suggestions[JneShipperAlias::normalize($row->shipper_name ?? '')] ?? []), ...($exact[$row->id]['candidates'] ?? [])])
                    ->unique('customer_id')->take(5)->values()->all());
                if ($customer['candidates'] !== []) {
                    $customer['status'] = 'CANDIDATE';
                    $customer['method'] = 'SUGGESTION';
                    $customer['note'] = 'Kemiripan nama hanya kandidat; belum membuktikan customer atau pickup.';
                }
            }
            $resolved[$source->id] = $customer;
        }
        $dateMatches = $this->dates->handle($history, $exact);
        $claims = PickupCashlessAwb::whereIn('awb', $sources->pluck('awb'))->get()->keyBy('awb');
        $customerIds = collect(array_column($resolved, 'customer_id'))->merge($claims->pluck('customer_id'))->filter()->unique()->values()->all();
        $references = $history->pluck('reference')->filter()->map(fn (string $reference): string => mb_strtoupper(trim($reference)))->unique()->values()->all();
        $candidates = [];
        foreach (array_chunk($references, 500) as $chunk) {
            $records = PickupProcessingRecord::whereIn('external_reference', $chunk)
                ->whereNotExists(fn (Builder $query) => $query->selectRaw('1')->from('pickup_processing_records as newer')
                    ->whereColumn('newer.pickup_task_id', 'pickup_processing_records.pickup_task_id')
                    ->whereColumn('newer.category', 'pickup_processing_records.category')
                    ->whereColumn('newer.system', 'pickup_processing_records.system')
                    ->whereColumn('newer.revision', '>', 'pickup_processing_records.revision'))
                ->get(['pickup_task_id', 'external_reference']);
            $eligible = PickupTask::whereIn('customer_id', $customerIds)->whereIn('id', $records->pluck('pickup_task_id'))
                ->whereHas('proof', fn ($query) => $query->whereNotNull('finalized_at'))->pluck('customer_id', 'id');
            foreach ($records as $record) {
                if ($customerId = $eligible->get($record->pickup_task_id)) {
                    $candidates[$customerId][mb_strtoupper(trim($record->external_reference))][] = $record->pickup_task_id;
                }
            }
            foreach (PickupTask::whereIn('customer_id', $customerIds)->whereIn('reference', $chunk)
                ->whereHas('proof', fn ($query) => $query->whereNotNull('finalized_at'))->get(['id', 'customer_id', 'reference']) as $task) {
                $candidates[$task->customer_id][mb_strtoupper($task->reference)][] = $task->id;
            }
        }
        $matches = [];
        $claimTasks = PickupTask::whereIn('id', $claims->pluck('pickup_task_id'))->pluck('customer_id', 'id');
        $activeCustomers = Customer::whereIn('id', $claims->pluck('customer_id'))->where('is_active', true)->pluck('id')->all();
        foreach ($sources as $source) {
            $customer = $resolved[$source->id];
            $pickupIds = [];
            $claim = $claims->get($source->awb);
            if ($claim) {
                $customer['evidence'][] = ['sertim_id' => $claim->id, 'sertim_version' => $claim->version, 'customer_id' => $claim->customer_id, 'pickup_task_id' => $claim->pickup_task_id];
                if ($claimTasks->get($claim->pickup_task_id) !== $claim->customer_id || ! in_array($claim->customer_id, $activeCustomers, true)
                    || in_array($customer['status'], ['AMBIGUOUS', 'CONFLICT'], true)
                    || ($customer['customer_id'] !== null && $customer['customer_id'] !== $claim->customer_id)) {
                    $customer['customer_id'] = null;
                    $customer['status'] = 'CONFLICT';
                    $customer['note'] = 'Bukti AWB Sertim bertentangan dengan pemetaan customer atau data pickup.';
                    $pickupIds = [];
                } else {
                    $customer['customer_id'] = $claim->customer_id;
                    $customer['status'] = 'MATCHED';
                    $customer['method'] = 'SERTIM';
                    $customer['note'] = 'AWB dicatat pada Sertim Cashless pickup ini; tidak ada bukti customer yang bertentangan.';
                    $customer['candidates'] = [];
                    $pickupIds[] = $claim->pickup_task_id;
                }
            }
            if ($customer['status'] === 'MATCHED') {
                foreach ($byAwb->get($source->awb, collect([$source])) as $row) {
                    $referenceIds = $candidates[$customer['customer_id']][mb_strtoupper(trim($row->reference ?? ''))] ?? [];
                    $pickupIds = [...$pickupIds, ...$referenceIds];
                    if ($referenceIds !== []) {
                        $customer['evidence'][] = ['source_id' => $row->id, 'reference' => $row->reference, 'pickup_task_ids' => array_values(array_unique($referenceIds))];
                    }
                }
            }
            if ($pickupIds === [] && $customer['status'] === 'MATCHED' && isset($dateMatches[$source->id])) {
                $date = $dateMatches[$source->id];
                $pickupIds = $date['pickups'];
                $customer['method'] = 'CUSTOMER_CODE_DATE';
                $customer['evidence'] = [...$customer['evidence'], ...$date['evidence']];
                if ($date['conflict']) {
                    $customer['status'] = 'CONFLICT';
                    $customer['note'] = 'Tanggal bisnis dari beberapa sumber bertentangan; periksa pickup asal.';
                }
            }
            $matches[$source->id] = [...$customer, 'pickups' => array_values(array_unique($pickupIds))];
        }

        $taskIds = collect($matches)->pluck('pickups')->flatten()->unique()->values()->all();
        $taskQuery = PickupTask::whereIn('id', $taskIds)->with('proof')->orderBy('id');
        if (DB::transactionLevel() > 0) {
            $taskQuery->lockForUpdate();
        }
        $this->allocationTasks = $taskQuery->get()->keyBy('id')->all();
        $this->allocationBlocks = array_fill_keys(PickupProcessingReconciliation::whereIn('pickup_task_id', $taskIds)->where(fn ($query) => $query->whereNotNull('locked_at')->orWhere('status', 'DONE')->orWhere('review_open', true))->pluck('pickup_task_id')->all(), true);
        $pending = PickupPendingItem::whereIn('status', ['PENDING', 'READY'])->whereHas('pickup', fn ($query) => $query->whereIn('customer_id', collect($this->allocationTasks)->pluck('customer_id')))->with('pickup.proof')->get();
        foreach ($this->allocationTasks as $task) {
            foreach ($pending as $item) {
                $origin = $item->pickup?->proof?->picked_up_at;
                $pickupAt = $task->proof->picked_up_at ?? $task->execution_started_at;
                if ($item->pickup?->customer_id === $task->customer_id && $origin && $pickupAt && PickupResultPeriod::date($origin)->lessThan(PickupResultPeriod::date($pickupAt))) {
                    $this->allocationBlocks[$task->id] = true;
                    break;
                }
            }
        }
        $this->allocationExclusions = [];
        foreach (DB::table('pickup_awb_exclusions')->join('jne_shipments', 'jne_shipments.id', '=', 'jne_shipment_id')->whereIn('pickup_awb_exclusions.pickup_task_id', $taskIds)->whereIn('awb', $sources->pluck('awb'))->get(['pickup_awb_exclusions.pickup_task_id', 'awb']) as $exclusion) {
            $this->allocationExclusions[$exclusion->pickup_task_id.':'.$exclusion->awb] = true;
        }

        return $matches;
    }

    /** @param array<int, array{customer_id: ?int, status: string, method: string, note: string, pickups: list<int>, candidates: list<array<string, mixed>>, evidence: list<array<string, mixed>>}> $candidates */
    public function automatic(JneShipment $shipment, JneReportAwb $source, array $candidates): void
    {
        $customer = $candidates[$source->id];
        if ($shipment->match_method === 'REVIEW') {
            if ($shipment->identity_review_hash === ReviewJneExceptions::identityHash($customer)) {
                return;
            }
            if ($shipment->match_status !== 'CONFLICT' || $shipment->customer_match_status !== 'CONFLICT') {
                $oldCustomerId = $shipment->customer_id;
                $shipment->fill(['customer_match_status' => 'CONFLICT', 'customer_match_note' => 'Bukti berubah setelah keputusan review. Periksa kembali keputusan Admin.']);
                $this->record($shipment, $shipment->pickup_task_id, 'CONFLICT', 'REVIEW', null, $shipment->customer_match_note, $oldCustomerId, $customer['evidence']);
            }

            return;
        }
        if ($shipment->match_method === 'MANUAL') {
            $claimConflict = $customer['method'] === 'SERTIM' && ($customer['customer_id'] !== $shipment->customer_id || $customer['pickups'] !== [$shipment->pickup_task_id]);
            if ($claimConflict || $customer['status'] === 'CONFLICT') {
                if ($shipment->match_status !== 'CONFLICT' || $shipment->customer_match_status !== 'CONFLICT') {
                    $oldCustomerId = $shipment->customer_id;
                    $shipment->fill(['customer_match_status' => 'CONFLICT', 'customer_match_note' => 'Bukti terbaru bertentangan dengan keputusan manual. Periksa tanpa mengganti hubungan secara otomatis.']);
                    $this->record($shipment, $shipment->pickup_task_id, 'CONFLICT', 'MANUAL', null, $shipment->customer_match_note, $oldCustomerId, $customer['evidence']);
                }
            }

            return;
        }
        $ids = $customer['pickups'];
        $bucketAllocation = ($shipment->match_method === AllocatePickupAwbBuckets::METHOD || ($shipment->match_method === 'CUSTOMER_CODE_DATE' && count($ids) > 1)) && $customer['status'] === 'MATCHED'
            && $customer['method'] === 'CUSTOMER_CODE_DATE' && $customer['customer_id'] === $shipment->customer_id
            && in_array($shipment->pickup_task_id, $ids, true);
        if ($bucketAllocation) {
            $ids = [$shipment->pickup_task_id];
        }
        $status = in_array($customer['status'], ['AMBIGUOUS', 'CONFLICT'], true) ? $customer['status'] : (count($ids) === 1 ? 'MATCHED' : (count($ids) > 1 ? 'AMBIGUOUS' : 'UNMATCHED'));
        $taskId = count($ids) === 1 ? $ids[0] : null;
        if ($customer['method'] === 'SERTIM' && count($ids) > 1) {
            $status = 'CONFLICT';
        }
        $note = $status === 'MATCHED' ? ($customer['method'] === 'SERTIM' ? 'AWB sesuai bukti Sertim Cashless untuk customer dan pickup ini.' : ($customer['method'] === 'CUSTOMER_CODE_DATE' ? 'Kode customer terverifikasi dan tanggal paket sesuai satu pickup yang sudah diverifikasi gudang.' : 'Referensi sama persis dan customer sesuai nama pengirim.'))
            : ($status === 'CONFLICT' ? 'Bukti Sertim dan referensi report menunjuk pickup berbeda; perlu pemeriksaan Admin.'
                : ($status === 'AMBIGUOUS' ? 'Referensi cocok dengan lebih dari satu pickup; perlu pemeriksaan Admin.' : 'Customer dikenali, tetapi belum ada referensi pickup yang cocok.'));
        if ($bucketAllocation) {
            $note = AllocatePickupAwbBuckets::NOTE;
        }
        $releasedSertim = $shipment->match_method === 'SERTIM' && $taskId === null
            && ! PickupProcessingReconciliation::where('pickup_task_id', $shipment->pickup_task_id)->where(fn ($query) => $query->whereNotNull('locked_at')->orWhere('status', 'DONE'))->exists();
        if ($shipment->pickup_task_id && $shipment->pickup_task_id !== $taskId && ! $releasedSertim) {
            $status = $status === 'CONFLICT' ? 'CONFLICT' : 'AMBIGUOUS';
            $taskId = $shipment->pickup_task_id;
            $note = 'Referensi atau pemetaan terbaru berbeda dari hubungan pickup sebelumnya. Perlu keputusan Admin.';
        }
        if ($taskId && $shipment->pickup_task_id !== $taskId) {
            $task = $this->allocationTasks[$taskId] ?? null;
            $excluded = isset($this->allocationExclusions[$taskId.':'.$shipment->awb]);
            $locked = isset($this->allocationBlocks[$taskId]);
            $entry = $source->entry_at ?? $shipment->latestSource?->entry_at;
            $pickupAt = $task->proof->picked_up_at ?? ($customer['method'] === 'SERTIM' ? $task?->execution_started_at : null);
            $sameDay = $pickupAt && $entry && PickupResultPeriod::date($pickupAt)->equalTo(PickupResultPeriod::date($entry));
            if ($excluded || $locked || (! $sameDay && config('jne-reports.evidence_policies_enabled'))) {
                $taskId = null;
                $status = 'UNMATCHED';
                $note = $excluded ? 'Resi telah dikeluarkan dari pickup ini oleh Admin.' : ($locked ? 'Pickup terkunci, sedang dikoreksi, atau customer memiliki pending lintas hari; periksa penetapan resi.' : 'Tanggal sumber berbeda dari bucket pickup; lintas hari wajib melalui barang pending.');
            }
        }
        $linkedCustomerId = $taskId === $shipment->pickup_task_id ? $shipment->pickup?->customer_id : null;
        if ($linkedCustomerId && $linkedCustomerId !== $customer['customer_id']) {
            $customer['customer_id'] = $linkedCustomerId;
            $customer['status'] = $customer['status'] === 'CONFLICT' ? 'CONFLICT' : 'AMBIGUOUS';
            $customer['note'] = 'Pemetaan terbaru berbeda dari customer pada hubungan pickup sebelumnya. Tinjau alias dan hubungan pickup.';
        }
        $customerChanged = $shipment->customer_id !== $customer['customer_id'] || $shipment->customer_match_status !== $customer['status']
            || $shipment->customer_match_method !== $customer['method'] || $shipment->customer_match_note !== $customer['note']
            || ($shipment->customer_match_candidates ?? []) !== $customer['candidates'];
        if ($customer['status'] !== 'MATCHED') {
            $note = $customer['note'];
        }
        if (! $customerChanged && $shipment->match_status === $status && $shipment->pickup_task_id === $taskId && $shipment->match_note === $note) {
            return;
        }
        $oldCustomerId = $shipment->customer_id;
        $shipment->fill(['customer_id' => $customer['customer_id'], 'customer_match_status' => $customer['status'],
            'customer_match_method' => $customer['method'], 'customer_match_note' => $customer['note'], 'customer_match_candidates' => $customer['candidates']]);
        if ($customer['status'] === 'UNMATCHED' && $status === 'UNMATCHED' && $shipment->match_status === 'UNMATCHED' && ! $shipment->pickup_task_id && ! $oldCustomerId) {
            $shipment->fill(['match_note' => $note, 'version' => $shipment->version + 1])->save();

            return;
        }
        $this->record($shipment, $taskId, $status, $bucketAllocation ? AllocatePickupAwbBuckets::METHOD : (in_array($customer['method'], ['SERTIM', 'CUSTOMER_CODE_DATE'], true) ? $customer['method'] : 'REFERENCE'), null, $note, $oldCustomerId, $customer['evidence']);
    }

    public function manual(User $actor, int $id, ?string $reference, int $version, string $reason): void
    {
        DB::transaction(function () use ($actor, $id, $reference, $version, $reason): void {
            abort_unless(User::whereKey($actor->id)->where('is_active', true)->where('role', 'admin_supervisor')->exists(), 403);
            $shipment = JneShipment::whereKey($id)->lockForUpdate()->firstOrFail();
            abort_if($shipment->version !== $version, 409, 'Data AWB berubah. Muat ulang sebelum mengubah pencocokan.');
            $task = $reference ? PickupTask::where('reference', $reference)->whereHas('proof', fn ($query) => $query->whereNotNull('finalized_at'))->first() : null;
            abort_if($shipment->pickup_task_id && $task && $shipment->pickup_task_id !== $task->id, 409, 'Resi sudah terikat ke pickup lain. Lepaskan melalui koreksi pickup asal.');
            abort_if($shipment->pickup_task_id && PickupProcessingReconciliation::where('pickup_task_id', $shipment->pickup_task_id)->where(fn ($query) => $query->whereNotNull('locked_at')->orWhere('status', 'DONE'))->exists(), 409, 'Pickup terkunci. Buka koreksi pickup asal terlebih dahulu.');
            if ($task && config('jne-reports.evidence_policies_enabled')) {
                abort_unless(app(PickupAwbEligibility::class)->allowed($task, $shipment), 422, 'Resi berbeda hari operasional; gunakan jalur pending yang tercatat.');
            }
            if ($reference && ! $task) {
                throw ValidationException::withMessages(['pickup_reference' => 'Referensi pickup tidak ditemukan atau POP belum final.']);
            }
            $source = $shipment->latestSource;
            $resolved = $source ? $this->candidates(collect([$source]))[$source->id] : null;
            $customerId = $resolved['customer_id'] ?? null;
            if ($task && ($resolved['status'] ?? null) !== 'MATCHED') {
                throw ValidationException::withMessages(['pickup_reference' => 'Tentukan customer melalui daftar nama pengirim sebelum menghubungkan pickup.']);
            }
            if ($task && $customerId && $task->customer_id !== $customerId) {
                throw ValidationException::withMessages(['pickup_reference' => 'Customer pickup berbeda dari pemetaan akun JNE.']);
            }
            $oldCustomerId = $shipment->customer_id;
            if ($task) {
                $shipment->fill(['customer_id' => $task->customer_id, 'customer_match_status' => 'MATCHED', 'customer_match_method' => 'MANUAL', 'customer_match_note' => $reason]);
            }
            $this->record($shipment, $task?->id, $task ? 'MATCHED' : 'UNMATCHED', 'MANUAL', $actor->id, $reason, $oldCustomerId, $resolved['evidence'] ?? []);
        });
    }

    /** @param list<array<string, mixed>> $evidence */
    private function record(JneShipment $shipment, ?int $taskId, string $status, string $method, ?int $actorId, string $reason, ?int $oldCustomerId, array $evidence = []): void
    {
        JneShipmentMatchEvent::create(['jne_shipment_id' => $shipment->id, 'previous_pickup_task_id' => $shipment->pickup_task_id,
            'pickup_task_id' => $taskId, 'match_status' => $status, 'method' => $method, 'actor_id' => $actorId, 'reason' => $reason,
            'previous_customer_id' => $oldCustomerId, 'customer_id' => $shipment->customer_id, 'customer_match_status' => $shipment->customer_match_status, 'evidence' => $evidence]);
        $shipment->update(['pickup_task_id' => $taskId, 'match_status' => $status, 'match_method' => $method, 'match_note' => $reason, 'version' => $shipment->version + 1]);
    }
}
