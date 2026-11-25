<?php

namespace App\Actions\Handover;

use App\Models\CashlessEntryItem;
use App\Models\PickupCashlessAwb;
use App\Models\PickupTask;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\DB;

class CashlessHandoverReadiness
{
    /** @param Collection<int, PickupTask> $tasks
     * @return array<int, array{ready: bool, expected: int, scanned: int, success: int, message: ?string}>
     */
    public function handle(Collection $tasks, bool $lock = false): array
    {
        $tasks->loadMissing('proof.revisions');
        $enabled = (bool) config('pickup.cashless_entry.handover_lock', true);
        $records = $enabled ? PickupCashlessAwb::whereIn('pickup_task_id', $tasks->modelKeys())->whereNotNull('awb')->orderBy('id')->when($lock, fn ($query) => $query->lockForUpdate())->get(['id', 'pickup_task_id', 'customer_id', 'awb']) : collect();
        $latest = CashlessEntryItem::whereIn('pickup_cashless_awb_id', $records->pluck('id')->all())->selectRaw('MAX(id)')->groupBy('pickup_cashless_awb_id');
        $attempts = $records->isEmpty() ? collect() : DB::table('cashless_entry_items as items')
            ->join('cashless_entry_batches as batches', 'batches.id', '=', 'items.batch_id')
            ->whereIn('items.id', $latest)->get(['items.pickup_cashless_awb_id', 'items.awb', 'items.status', 'items.previous_ho', 'batches.pickup_task_id', 'batches.status as batch_status', 'batches.approved_at'])->keyBy('pickup_cashless_awb_id');
        $byTask = $records->groupBy('pickup_task_id');
        $result = [];
        foreach ($tasks as $task) {
            $expected = (int) ($task->proof?->effectiveValues()['cashless_hybrid'] ?? 0);
            $scanned = $byTask->get($task->id, collect());
            $success = $scanned->filter(function (PickupCashlessAwb $record) use ($attempts, $task): bool {
                $attempt = $attempts->get($record->id);

                return $record->customer_id === $task->customer_id && $attempt !== null
                    && (int) $attempt->pickup_task_id === $task->id && $attempt->awb === $record->awb
                    && (($attempt->status === 'ACCEPTED' && $attempt->approved_at !== null)
                        || ($attempt->status === 'CONFIRMED' && $attempt->previous_ho !== null))
                    && in_array($attempt->batch_status, ['DONE', 'PARTIAL'], true);
            })->count();
            $ready = ! $enabled || ($scanned->count() === $expected && $success === $scanned->count());
            $message = $scanned->count() !== $expected
                ? "PCK-{$task->id}: jumlah cashless POP {$expected}, resi tercatat {$scanned->count()}. Periksa jumlah dan daftar resi sebelum handover."
                : "PCK-{$task->id}: cashless {$success}/{$expected} berhasil. Selesaikan input dan approval seluruh resi cashless sebelum handover.";
            $result[$task->id] = ['ready' => $ready, 'expected' => $expected, 'scanned' => $scanned->count(), 'success' => $success,
                'message' => $ready ? null : $message];
        }

        return $result;
    }

    /** @param Collection<int, PickupTask> $tasks */
    public function assertReady(Collection $tasks): void
    {
        if (! config('pickup.cashless_entry.handover_lock', true)) {
            return;
        }
        $blocked = array_filter($this->handle($tasks, lock: true), fn (array $state): bool => ! $state['ready']);
        abort_if($blocked !== [], 409, 'HANDOVER_CASHLESS_BLOCKED: '.implode(' ', array_slice(array_column($blocked, 'message'), 0, 5)));
    }
}
