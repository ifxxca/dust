<?php

namespace App\Console\Commands;

use App\Actions\Pickup\PickupResultPeriod;
use App\Actions\Pickup\ReconcilePickupProcessing;
use App\Models\JneShipment;
use App\Models\PickupCustomerReconciliation;
use App\Models\PickupTask;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;

#[Signature('pickups:reconcile-buckets {--date-from= : Hari operasional awal YYYY-MM-DD} {--date-to= : Hari operasional akhir YYYY-MM-DD} {--customer= : ID customer} {--all : Sertakan customer dengan satu pickup} {--dry-run : Tampilkan pickup tanpa perubahan} {--backup : Simpan snapshot sebelum validasi}')]
#[Description('Alokasikan dan validasi ulang bucket customer yang memiliki beberapa pickup dalam sehari')]
class ReconcilePickupBuckets extends Command
{
    public function handle(ReconcilePickupProcessing $reconcile): int
    {
        $filters = Validator::make(['date_from' => $this->option('date-from'), 'date_to' => $this->option('date-to'), 'customer' => $this->option('customer')],
            ['date_from' => ['nullable', 'date_format:Y-m-d'], 'date_to' => ['nullable', 'date_format:Y-m-d'], 'customer' => ['nullable', 'integer', 'min:1']])->validate();
        if (($filters['date_from'] ?? null) && ($filters['date_to'] ?? null) && $filters['date_from'] > $filters['date_to']) {
            $this->error('Tanggal akhir harus sesudah atau sama dengan tanggal awal.');

            return self::FAILURE;
        }
        $tasks = PickupTask::query()->when($filters['customer'] ?? null, fn ($query, $customer) => $query->where('customer_id', $customer))
            ->whereHas('proof', function ($proof) use ($filters): void {
                $proof->whereNotNull('finalized_at');
                if ($filters['date_from'] ?? null) {
                    $proof->where('picked_up_at', '>=', PickupResultPeriod::start($filters['date_from'])->utc());
                }
                if ($filters['date_to'] ?? null) {
                    $proof->where('picked_up_at', '<', PickupResultPeriod::start($filters['date_to'])->addDay()->utc());
                }
            })->with('proof:id,pickup_task_id,picked_up_at')->orderBy('id')->get(['id', 'customer_id', 'reference']);
        $groups = $tasks->groupBy(fn (PickupTask $task): string => $task->customer_id.':'.PickupResultPeriod::date($task->proof->picked_up_at)->toDateString())
            ->filter(fn ($group): bool => $this->option('all') || $group->count() > 1);
        $selected = $groups->flatten(1);
        $this->info($groups->count().' bucket / '.$selected->count().' pickup.');
        if ($this->option('dry-run')) {
            $this->table(['ID', 'Referensi'], $selected->map(fn (PickupTask $task): array => [$task->id, $task->reference])->all());

            return self::SUCCESS;
        }
        if ($this->option('backup') && $selected->isNotEmpty()) {
            $ids = $selected->pluck('id')->all();
            $backup = ['created_at' => now()->toIso8601String(), 'filters' => $filters, 'pickup_ids' => $ids,
                'tasks' => DB::table('pickup_tasks')->whereIn('id', $ids)->get(),
                'proofs' => DB::table('pickup_records')->whereIn('pickup_task_id', $ids)->get(),
                'handovers' => DB::table('handover_items')->whereIn('pickup_task_id', $ids)->get(),
                'reconciliations' => DB::table('pickup_processing_reconciliations')->whereIn('pickup_task_id', $ids)->get(),
                'customer_reconciliations' => PickupCustomerReconciliation::whereIn('customer_id', $selected->pluck('customer_id')->unique())->get()->toArray(),
                'shipments' => JneShipment::whereIn('customer_id', $selected->pluck('customer_id')->unique())->get()->toArray(),
                'manifests' => DB::table('pickup_awb_manifests')->whereIn('pickup_task_id', $ids)->get()];
            $path = 'backups/pickup-bucket-allocation-'.now()->format('Ymd-His').'-'.Str::uuid().'.json';
            Storage::disk('local')->put($path, json_encode($backup, JSON_THROW_ON_ERROR | JSON_PRETTY_PRINT));
            $this->info('Backup: '.Storage::disk('local')->path($path));
        }
        $failed = 0;
        foreach ($groups as $members) {
            $task = $members->first();
            try {
                $result = $reconcile->handle($task->id);
                $group = PickupCustomerReconciliation::findOrFail($result->customer_reconciliation_id);
                $this->line('#'.$group->id.' customer '.$group->customer_id.' '.$group->business_date->toDateString().' '.$group->pickup_count.' pickup '.$group->status.' '.json_encode($group->categories, JSON_THROW_ON_ERROR));
            } catch (\Throwable $exception) {
                report($exception);
                $this->error('#'.$task->id.' '.$exception->getMessage());
                $failed++;
            }
        }
        $this->info(($groups->count() - $failed).' customer / hari dikompilasi, '.$failed.' gagal.');

        return $failed === 0 ? self::SUCCESS : self::FAILURE;
    }
}
