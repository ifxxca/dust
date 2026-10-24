<?php

namespace App\Actions\Reports;

use App\Models\Customer;
use App\Models\JneReportAwb;
use App\Models\JneShipment;
use App\Models\JneShipmentMatchEvent;
use App\Models\JneShipperAlias;
use App\Models\PickupCashlessAwb;
use App\Models\PickupProcessingRecord;
use App\Models\PickupTask;
use App\Models\User;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class MatchJneShipments
{
    public function __construct(private ResolveJneCustomers $resolver, private SuggestJneCustomers $suggestions) {}

    /**
     * @param  Collection<int, JneReportAwb>  $sources
     * @return array<int, array{customer_id: ?int, status: string, method: string, note: string, pickups: list<int>, candidates: list<array<string, mixed>>, evidence: list<array<string, mixed>>}>
     */
    public function candidates(Collection $sources): array
    {
        $history = collect();
        foreach ($sources->pluck('awb')->unique()->chunk(500) as $awbs) {
            $history = $history->concat(JneReportAwb::whereIn('awb', $awbs)->orderBy('id')->get(['id', 'awb', 'shipper_name', 'reference']));
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
            $customer = $exact[$source->id];
            if ($ids->count() === 1 && ! $ambiguous) {
                $customer = $decisions->firstWhere('status', 'MATCHED') ?? $customer;
            }
            $customer['customer_id'] = $ids->count() === 1 && ! $ambiguous ? (int) $ids->first() : null;
            $customer['status'] = $ids->count() > 1 || ($ambiguous && $ids->isNotEmpty()) ? 'CONFLICT' : ($ambiguous ? 'AMBIGUOUS' : ($ids->count() === 1 ? 'MATCHED' : 'UNMATCHED'));
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
                $customer['candidates'] = array_values($rows->flatMap(fn (JneReportAwb $row): array => $suggestions[JneShipperAlias::normalize($row->shipper_name ?? '')] ?? [])
                    ->unique('customer_id')->take(5)->values()->all());
                if ($customer['candidates'] !== []) {
                    $customer['status'] = 'CANDIDATE';
                    $customer['method'] = 'SUGGESTION';
                    $customer['note'] = 'Kemiripan nama hanya kandidat; belum membuktikan customer atau pickup.';
                }
            }
            $resolved[$source->id] = $customer;
        }
        $customerIds = array_values(array_unique(array_filter(array_column($resolved, 'customer_id'))));
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
        $claims = PickupCashlessAwb::whereIn('awb', $sources->pluck('awb'))->get()->keyBy('awb');
        $claimTasks = PickupTask::whereIn('id', $claims->pluck('pickup_task_id'))->pluck('customer_id', 'id');
        $activeCustomers = Customer::whereIn('id', $claims->pluck('customer_id'))->where('is_active', true)->pluck('id')->all();
        foreach ($sources as $source) {
            $customer = $resolved[$source->id];
            $pickupIds = [];
            if ($customer['status'] === 'MATCHED') {
                foreach ($byAwb->get($source->awb, collect([$source])) as $row) {
                    $pickupIds = [...$pickupIds, ...($candidates[$customer['customer_id']][mb_strtoupper(trim($row->reference ?? ''))] ?? [])];
                }
            }
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
            $matches[$source->id] = [...$customer, 'pickups' => array_values(array_unique($pickupIds))];
        }

        return $matches;
    }

    /** @param array<int, array{customer_id: ?int, status: string, method: string, note: string, pickups: list<int>, candidates: list<array<string, mixed>>, evidence: list<array<string, mixed>>}> $candidates */
    public function automatic(JneShipment $shipment, JneReportAwb $source, array $candidates): void
    {
        $customer = $candidates[$source->id];
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
        $status = in_array($customer['status'], ['AMBIGUOUS', 'CONFLICT'], true) ? $customer['status'] : (count($ids) === 1 ? 'MATCHED' : (count($ids) > 1 ? 'AMBIGUOUS' : 'UNMATCHED'));
        $taskId = count($ids) === 1 ? $ids[0] : null;
        if ($customer['method'] === 'SERTIM' && count($ids) > 1) {
            $status = 'CONFLICT';
        }
        $note = $status === 'MATCHED' ? ($customer['method'] === 'SERTIM' ? 'AWB sesuai bukti Sertim Cashless untuk customer dan pickup ini.' : 'Referensi sama persis dan customer sesuai nama pengirim.')
            : ($status === 'AMBIGUOUS' ? 'Referensi cocok dengan lebih dari satu pickup; perlu pemeriksaan Admin.' : 'Customer dikenali, tetapi belum ada referensi pickup yang cocok.');
        if ($shipment->pickup_task_id && $shipment->pickup_task_id !== $taskId && $shipment->match_method !== 'SERTIM') {
            $status = $status === 'CONFLICT' ? 'CONFLICT' : 'AMBIGUOUS';
            $taskId = $shipment->pickup_task_id;
            $note = 'Referensi atau pemetaan terbaru berbeda dari hubungan pickup sebelumnya. Perlu keputusan Admin.';
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
        $this->record($shipment, $taskId, $status, $customer['method'] === 'SERTIM' ? 'SERTIM' : 'REFERENCE', null, $note, $oldCustomerId, $customer['evidence']);
    }

    public function manual(User $actor, int $id, ?string $reference, int $version, string $reason): void
    {
        DB::transaction(function () use ($actor, $id, $reference, $version, $reason): void {
            abort_unless(User::whereKey($actor->id)->where('is_active', true)->where('role', 'admin_supervisor')->exists(), 403);
            $shipment = JneShipment::whereKey($id)->lockForUpdate()->firstOrFail();
            abort_if($shipment->version !== $version, 409, 'Data AWB berubah. Muat ulang sebelum mengubah pencocokan.');
            $task = $reference ? PickupTask::where('reference', $reference)->whereHas('proof', fn ($query) => $query->whereNotNull('finalized_at'))->first() : null;
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
