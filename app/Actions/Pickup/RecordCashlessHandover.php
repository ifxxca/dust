<?php

namespace App\Actions\Pickup;

use App\Actions\Reports\QueryCashlessReconciliation;
use App\Actions\Reports\ReevaluateJneAwbs;
use App\Models\CashlessEntryBatch;
use App\Models\Customer;
use App\Models\HandoverSession;
use App\Models\JneShipment;
use App\Models\PickupCashlessAwb;
use App\Models\PickupCashlessAwbEvent;
use App\Models\PickupTask;
use App\Models\User;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;
use Ramsey\Uuid\Uuid;

class RecordCashlessHandover
{
    public function __construct(private ReevaluateJneAwbs $reevaluate, private QueryCashlessReconciliation $reconciliation, private QueuePickupReconciliations $queue) {}

    /** @param array<string, mixed> $data */
    public function handle(User $user, int $taskId, array $data, bool $enqueueEntry = true): int
    {
        $data = Validator::make($data, self::rules())->validate();
        /** @var list<string> $rawAwbs */
        $rawAwbs = array_values($data['awbs']);
        $awbs = array_map(fn (string $awb): string => mb_strtoupper(trim($awb)), $rawAwbs);
        Validator::make(['awbs' => $awbs], [
            'awbs.*' => ['required', 'string', 'regex:/^[A-Z0-9_-]{1,100}$/D', 'distinct:strict', 'not_regex:/^(0101|0166)[0-9]+$/D'],
        ], ['awbs.*.distinct' => 'Ada resi yang sama dalam daftar. Hapus duplikat sebelum menyimpan.',
            'awbs.*.regex' => 'Nomor resi hanya boleh berisi huruf, angka, tanda hubung atau garis bawah.',
            'awbs.*.not_regex' => 'Resi berawalan 0101 atau 0166 termasuk Manual, bukan Cashless.'])->validate();

        try {
            return DB::transaction(function () use ($user, $taskId, $data, $rawAwbs, $awbs, $enqueueEntry): int {
                $actor = User::whereKey($user->id)->lockForUpdate()->firstOrFail();
                $customerId = PickupTask::whereKey($taskId)->value('customer_id');
                Customer::whereKey($customerId)->lockForUpdate()->firstOrFail();
                $sessionId = PickupTask::findOrFail($taskId)->handoverItem()->value('handover_session_id');
                if ($sessionId !== null) {
                    HandoverSession::whereKey($sessionId)->lockForUpdate()->firstOrFail();
                }
                $task = PickupTask::whereKey($taskId)->lockForUpdate()->firstOrFail();
                $hash = hash('sha256', json_encode(['cashless_handover', $taskId, $rawAwbs], JSON_THROW_ON_ERROR));
                $existing = PickupCashlessAwbEvent::where('submission_key', $data['submission_key'])->first();
                if ($existing !== null) {
                    abort_unless($actor->canExecutePickup() && $task->assigned_staff_id === $actor->id, 403);
                    abort_unless($existing->actor_id === $actor->id && $existing->pickup_task_id === $taskId && hash_equals($existing->payload_hash, $hash), 409, 'Kunci penyimpanan sudah digunakan untuk daftar berbeda. Muat ulang sebelum mencoba lagi.');
                    $batch = CashlessEntryBatch::where('submission_key', $data['submission_key'])->first();
                    abort_if(isset($data['source']) && $batch !== null && $batch->source !== $data['source'], 409, 'Server batch yang sudah tersimpan tidak dapat diganti.');

                    return count($awbs);
                }
                Gate::forUser($actor)->authorize('handoverCashlessAwb', $task);
                $claimed = PickupCashlessAwb::whereIn('awb', $awbs)->orderBy('awb')->lockForUpdate()->first();
                if ($claimed !== null) {
                    throw ValidationException::withMessages(['awbs' => 'Resi '.$claimed->awb.' sudah tersimpan pada buku pickup'.($claimed->pickup_task_id === $taskId ? ' ini.' : ' lain.').' Hapus dari daftar sebelum menyimpan.']);
                }
                $shipments = JneShipment::whereIn('awb', $awbs)->orderBy('awb')->lockForUpdate()->get();
                foreach ($shipments as $shipment) {
                    if ($shipment->pickup_task_id !== null && $shipment->pickup_task_id !== $taskId) {
                        throw ValidationException::withMessages(['awbs' => 'Resi '.$shipment->awb.' sudah terikat ke pickup lain. Periksa bukti pada rekonsiliasi.']);
                    }
                    if ($shipment->category_status === 'MATCHED' && $shipment->category !== 'cashless_hybrid') {
                        throw ValidationException::withMessages(['awbs' => 'Resi '.$shipment->awb.' tercatat sebagai kategori selain Cashless. Periksa kategori sebelum menyimpan.']);
                    }
                }
                $before = $shipments->keyBy('awb');
                $beforeReconciliation = $this->reconciliation->handle($task);
                $now = now();
                PickupCashlessAwb::insert(array_map(fn (string $awb, int $index): array => [
                    'pickup_task_id' => $taskId, 'customer_id' => $task->customer_id, 'original_awb' => $rawAwbs[$index],
                    'raw_awb' => $rawAwbs[$index], 'awb' => $awb, 'version' => 1, 'created_by' => $actor->id,
                    'created_at' => $now, 'updated_at' => $now,
                ], $awbs, array_keys($awbs)));
                $this->reevaluate->handle($awbs);
                $after = JneShipment::whereIn('awb', $awbs)->get()->keyBy('awb');
                $afterReconciliation = $this->reconciliation->handle($task);
                $records = PickupCashlessAwb::where('pickup_task_id', $taskId)->whereIn('awb', $awbs)->get()->keyBy('awb');
                $events = [];
                foreach ($awbs as $index => $awb) {
                    $events[] = ['pickup_cashless_awb_id' => $records->get($awb)->id, 'pickup_task_id' => $taskId,
                        'customer_id' => $task->customer_id, 'actor_id' => $actor->id,
                        'submission_key' => $index === 0 ? $data['submission_key'] : Uuid::uuid5($data['submission_key'], 'cashless-handover:'.$index)->toString(),
                        'payload_hash' => $hash, 'revision' => 1, 'previous_awb' => null, 'awb' => $awb,
                        'previous_raw_awb' => null, 'raw_awb' => $rawAwbs[$index], 'reason' => null, 'created_at' => $now,
                        'affected_results' => json_encode(['batch_submission_key' => $data['submission_key'],
                            'before' => ['shipments' => $before->has($awb) ? [$before->get($awb)->only(['id', 'awb', 'customer_id', 'pickup_task_id', 'customer_match_status', 'match_status', 'version'])] : [], 'reconciliation' => $beforeReconciliation],
                            'after' => ['shipments' => $after->has($awb) ? [$after->get($awb)->only(['id', 'awb', 'customer_id', 'pickup_task_id', 'customer_match_status', 'match_status', 'version'])] : [], 'reconciliation' => $afterReconciliation],
                        ], JSON_THROW_ON_ERROR)];
                }
                PickupCashlessAwbEvent::insert($events);
                if ($enqueueEntry) {
                    app(ManageCashlessEntryBatches::class)->enqueue($data['submission_key'], $taskId, $actor->id, $awbs,
                        $data['source'] ?? null);
                }
                $this->queue->handle([$taskId]);

                return count($awbs);
            }, 3);
        } catch (UniqueConstraintViolationException) {
            throw ValidationException::withMessages(['awbs' => 'Ada resi atau kunci penyimpanan yang sudah digunakan. Muat ulang daftar sebelum mencoba lagi.']);
        }
    }

    /** @return array<string, list<string>> */
    public static function rules(): array
    {
        return ['submission_key' => ['required', 'uuid'], 'source' => ['nullable', 'in:roberto,nuralamt'], 'awbs' => ['required', 'array', 'list', 'min:1', 'max:500'],
            'awbs.*' => ['required', 'string', 'max:100']];
    }

    /** @param array<string, mixed> $data */
    public static function isReplay(User $user, PickupTask $task, array $data): bool
    {
        if (! $user->canExecutePickup() || $task->assigned_staff_id !== $user->id || Validator::make($data, self::rules())->fails()) {
            return false;
        }

        return PickupCashlessAwbEvent::where('submission_key', $data['submission_key'])->where('actor_id', $user->id)
            ->where('pickup_task_id', $task->id)
            ->where('payload_hash', hash('sha256', json_encode(['cashless_handover', $task->id, array_values($data['awbs'])], JSON_THROW_ON_ERROR)))->exists();
    }
}
