<?php

namespace App\Console\Commands;

use App\Actions\Pickup\DeliverPickupAwbManifest;
use App\Actions\Pickup\QueuePickupReconciliations;
use App\Jobs\RenderPickupAwbManifestJob;
use App\Models\CustomerAwbDeliveryPreference;
use App\Models\PickupAwbDelivery;
use App\Models\PickupAwbManifest;
use App\Models\PickupTask;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

#[Signature('pickups:queue-automation {--recover : Pulihkan lease worker yang kedaluwarsa}')]
#[Description('Antrekan validasi pickup, dokumen dan pengiriman yang jatuh tempo')]
class QueuePickupAutomation extends Command
{
    /**
     * Execute the console command.
     */
    public function handle(QueuePickupReconciliations $reconciliations, DeliverPickupAwbManifest $deliveries): int
    {
        if (! config('pickup.automation.enabled')) {
            $this->info('Otomatisasi pickup belum diaktifkan.');

            return self::SUCCESS;
        }
        if ($this->option('recover')) {
            $stale = PickupAwbDelivery::where('status', 'SENDING')->where('started_at', '<', now()->subMinutes(5))->pluck('id');
            PickupAwbDelivery::whereIn('id', $stale)->where('status', 'SENDING')->update(['status' => 'UNKNOWN', 'last_error' => 'Worker berhenti saat mengirim; periksa provider sebelum mengulang.']);
            DB::table('pickup_awb_delivery_attempts')->whereIn('pickup_awb_delivery_id', $stale)->where('status', 'SENDING')->update(['status' => 'UNKNOWN', 'finished_at' => now(), 'error' => 'Lease worker kedaluwarsa; hasil provider belum pasti.']);
            PickupAwbManifest::where('status', 'RENDERING')->where('updated_at', '<', now()->subMinutes(5))->update(['status' => 'FAILED', 'last_error' => 'Worker dokumen berhenti; pembuatan akan dicoba ulang.']);
        }
        $ids = PickupTask::whereHas('proof', fn ($query) => $query->whereNotNull('finalized_at'))
            ->where(fn ($query) => $query->whereNotIn('id', DB::table('pickup_processing_reconciliations')->select('pickup_task_id'))
                ->orWhereIn('id', DB::table('pickup_processing_reconciliations')->select('pickup_task_id')->where(fn ($due) => $due->whereNull('next_evaluation_at')->orWhere('next_evaluation_at', '<=', now())->orWhereColumn('input_version', '>', 'evaluated_input_version'))))
            ->orderBy(DB::table('pickup_processing_reconciliations')->select('next_evaluation_at')->whereColumn('pickup_task_id', 'pickup_tasks.id'))
            ->orderBy(DB::table('pickup_processing_reconciliations')->select('evaluated_at')->whereColumn('pickup_task_id', 'pickup_tasks.id'))
            ->orderBy('id')->limit(200)->pluck('id')->map(fn ($id): int => $id)->all();
        $reconciliations->handle(array_values($ids), invalidate: false);
        PickupAwbManifest::whereIn('status', ['PENDING', 'FAILED'])->where('render_attempts', '<', 4)->where(fn ($query) => $query->whereNull('next_render_at')->orWhere('next_render_at', '<=', now()))->orderBy('updated_at')->limit(50)->each(fn (PickupAwbManifest $manifest) => RenderPickupAwbManifestJob::dispatch($manifest->id));
        PickupAwbManifest::where('status', 'READY')
            ->whereHas('pickup', fn ($pickup) => $pickup->whereIn('customer_id', CustomerAwbDeliveryPreference::where('enabled', true)->select('customer_id')))
            ->whereDoesntHave('deliveries', fn ($delivery) => $delivery->whereIn('status', ['SENDING', 'UNKNOWN', 'ACCEPTED', 'DELIVERED', 'FAILED']))
            ->orderByRaw('coalesce((select max(updated_at) from pickup_awb_deliveries where pickup_awb_manifest_id = pickup_awb_manifests.id), pickup_awb_manifests.updated_at)')
            ->limit(200)->each(fn (PickupAwbManifest $manifest) => $deliveries->queue($manifest));
        $this->info(count($ids).' pickup diantrekan untuk diperiksa.');

        return self::SUCCESS;
    }
}
