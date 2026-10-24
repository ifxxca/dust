<?php

namespace App\Actions\Reports;

use App\Models\JneReportAwb;
use App\Models\JneShipment;
use App\Models\JneShipmentMatchEvent;
use App\Models\PickupProcessingRecord;
use App\Models\PickupTask;
use App\Models\User;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class MatchJneShipments
{
    public function __construct(private ResolveJneCustomers $resolver) {}

    /**
     * @param  Collection<int, JneReportAwb>  $sources
     * @return array<int, array{customer_id: ?int, status: string, method: string, note: string, pickups: list<int>}>
     */
    public function candidates(Collection $sources): array
    {
        $resolved = $this->resolver->handle($sources);
        $customerIds = array_values(array_unique(array_filter(array_column($resolved, 'customer_id'))));
        $references = $sources->pluck('reference')->filter()->map(fn (string $reference): string => mb_strtoupper(trim($reference)))->unique()->values()->all();
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
        foreach ($sources as $source) {
            $customer = $resolved[$source->id];
            $matches[$source->id] = [...$customer, 'pickups' => array_values(array_unique($candidates[$customer['customer_id']][mb_strtoupper(trim($source->reference ?? ''))] ?? []))];
        }

        return $matches;
    }

    /** @param array<int, array{customer_id: ?int, status: string, method: string, note: string, pickups: list<int>}> $candidates */
    public function automatic(JneShipment $shipment, JneReportAwb $source, array $candidates): void
    {
        if ($shipment->match_method === 'MANUAL') {
            return;
        }
        $customer = $candidates[$source->id];
        $ids = $customer['pickups'];
        $status = $customer['status'] === 'AMBIGUOUS' ? 'AMBIGUOUS' : (count($ids) === 1 ? 'MATCHED' : (count($ids) > 1 ? 'AMBIGUOUS' : 'UNMATCHED'));
        $taskId = count($ids) === 1 ? $ids[0] : null;
        $note = $status === 'MATCHED' ? 'Referensi sama persis dan customer sesuai nama pengirim.'
            : ($status === 'AMBIGUOUS' ? 'Referensi cocok dengan lebih dari satu pickup; perlu pemeriksaan Admin.' : 'Customer dikenali, tetapi belum ada referensi pickup yang cocok.');
        if ($shipment->pickup_task_id && $shipment->pickup_task_id !== $taskId) {
            $status = 'AMBIGUOUS';
            $taskId = $shipment->pickup_task_id;
            $note = 'Referensi atau pemetaan terbaru berbeda dari hubungan pickup sebelumnya. Perlu keputusan Admin.';
        }
        $linkedCustomerId = $shipment->pickup?->customer_id;
        if ($linkedCustomerId && $linkedCustomerId !== $customer['customer_id']) {
            $customer['customer_id'] = $linkedCustomerId;
            $customer['status'] = 'AMBIGUOUS';
            $customer['note'] = 'Pemetaan terbaru berbeda dari customer pada hubungan pickup sebelumnya. Tinjau alias dan hubungan pickup.';
        }
        $customerChanged = $shipment->customer_id !== $customer['customer_id'] || $shipment->customer_match_status !== $customer['status']
            || $shipment->customer_match_method !== $customer['method'] || $shipment->customer_match_note !== $customer['note'];
        if ($customer['status'] !== 'MATCHED') {
            $note = $customer['note'];
        }
        if (! $customerChanged && $shipment->match_status === $status && $shipment->pickup_task_id === $taskId && $shipment->match_note === $note) {
            return;
        }
        $oldCustomerId = $shipment->customer_id;
        $shipment->fill(['customer_id' => $customer['customer_id'], 'customer_match_status' => $customer['status'],
            'customer_match_method' => $customer['method'], 'customer_match_note' => $customer['note']]);
        if ($status === 'UNMATCHED' && $shipment->match_status === 'UNMATCHED' && ! $shipment->pickup_task_id && ! $oldCustomerId) {
            $shipment->fill(['match_note' => $note, 'version' => $shipment->version + 1])->save();

            return;
        }
        $this->record($shipment, $taskId, $status, 'REFERENCE', null, $note, $oldCustomerId);
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
            $resolved = $source ? $this->resolver->handle(collect([$source]))[$source->id] : null;
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
            $this->record($shipment, $task?->id, $task ? 'MATCHED' : 'UNMATCHED', 'MANUAL', $actor->id, $reason, $oldCustomerId);
        });
    }

    private function record(JneShipment $shipment, ?int $taskId, string $status, string $method, ?int $actorId, string $reason, ?int $oldCustomerId): void
    {
        JneShipmentMatchEvent::create(['jne_shipment_id' => $shipment->id, 'previous_pickup_task_id' => $shipment->pickup_task_id,
            'pickup_task_id' => $taskId, 'match_status' => $status, 'method' => $method, 'actor_id' => $actorId, 'reason' => $reason,
            'previous_customer_id' => $oldCustomerId, 'customer_id' => $shipment->customer_id, 'customer_match_status' => $shipment->customer_match_status]);
        $shipment->update(['pickup_task_id' => $taskId, 'match_status' => $status, 'match_method' => $method, 'match_note' => $reason, 'version' => $shipment->version + 1]);
    }
}
