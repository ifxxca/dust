<?php

namespace App\Actions\Reports;

use App\Models\JneCollectionWindow;
use App\Models\JneReportAwb;
use App\Models\JneShipment;
use App\Models\JneSourceContract;
use App\Models\PickupCashlessAwb;
use App\Models\PickupProcessingRecord;
use App\Models\PickupTask;
use App\Models\ReportJob;
use Illuminate\Database\Eloquent\Collection as ModelCollection;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class QueryJneCollectionWindows
{
    public static function enabled(): bool
    {
        return config('jne-reports.evidence_policies_enabled') && config('jne-reports.collection_attestation_enabled');
    }

    /** @param Collection<int, PickupTask> $tasks
     * @return array<int, array<string, mixed>>
     */
    public function handle(Collection $tasks): array
    {
        $result = [];
        foreach ($tasks as $task) {
            $result[$task->id] = ['status' => 'UNCONFIGURED', 'complete' => false, 'version' => 0, 'window' => null, 'reason' => 'Kelengkapan koleksi eksternal belum disahkan.'];
        }
        if (! self::enabled() || $tasks->isEmpty()) {
            return $result;
        }
        (new ModelCollection($tasks->all()))->loadMissing('proof.revisions');
        $windows = JneCollectionWindow::whereIn('pickup_task_id', $tasks->pluck('id'))->get()->keyBy('pickup_task_id');
        if ($windows->isEmpty()) {
            return $result;
        }
        $claims = PickupCashlessAwb::whereIn('pickup_task_id', $tasks->pluck('id'))->orderBy('id')->get()->groupBy('pickup_task_id');
        $shipments = JneShipment::whereIn('pickup_task_id', $tasks->pluck('id'))->get(['pickup_task_id', 'awb'])->groupBy('pickup_task_id');
        $awbList = $claims->flatten(1)->pluck('awb')->merge($shipments->flatten(1)->pluck('awb'))->filter()->unique();
        $latest = collect();
        foreach ($awbList->chunk(500) as $chunk) {
            $latest = $latest->union(JneReportAwb::whereIn('awb', $chunk)->selectRaw('awb, max(id) as newest_id')->groupBy('awb')->pluck('newest_id', 'awb'));
        }
        $contracts = JneSourceContract::whereIn('id', $windows->pluck('jne_source_contract_id'))->get()->keyBy('id');
        $reports = ReportJob::whereIn('id', $windows->flatMap(fn (JneCollectionWindow $window): array => $window->report_job_ids ?? [])->unique())->get()->keyBy('id');
        $sourceMaxima = DB::table('jne_report_awbs')->join('report_jobs as r', 'r.id', '=', 'jne_report_awbs.report_job_id')->where('jne_report_awbs.id', '>', $windows->min('source_high_water_id') ?? 0)
            ->select('r.source', 'r.report_type', 'r.customer_account')->selectRaw('max(jne_report_awbs.id) as newest_id')->groupBy('r.source', 'r.report_type', 'r.customer_account')->get();
        foreach ($tasks as $task) {
            $window = $windows->get($task->id);
            if (! $window) {
                continue;
            }
            $reason = null;
            $contract = $contracts->get($window->jne_source_contract_id);
            $taskClaims = $claims->get($task->id, collect());
            $taskAwbs = $taskClaims->pluck('awb')->merge($shipments->get($task->id, collect())->pluck('awb'))->filter()->unique();
            $newest = $taskAwbs->map(fn (string $awb): int => (int) ($latest[$awb] ?? 0))->max() ?? 0;
            $newScopeEvidence = $sourceMaxima->contains(function ($source) use ($window): bool {
                if ($source->newest_id <= $window->source_high_water_id) {
                    return false;
                }
                foreach ($window->required_sources ?? [] as $requirement) {
                    $parts = explode(':', $requirement, 3);
                    if ($source->source === $parts[0] && $source->report_type === $parts[1] && (! isset($parts[2]) || $source->customer_account === $parts[2])) {
                        return true;
                    }
                }

                return false;
            });
            $selected = collect($window->report_job_ids ?? [])->map(fn (int $id) => $reports->get($id))->filter()->sortBy('id')->values();
            if ($window->status !== 'COMPLETE') {
                $reason = 'Koleksi eksternal masih terbuka.';
            } elseif (! $contract?->active_key || ! $contract->verified_at) {
                $reason = 'Kontrak koleksi berubah atau dinonaktifkan.';
            } elseif ($newest > $window->source_high_water_id || $newScopeEvidence) {
                $reason = 'Ada observasi baru setelah pengesahan; periksa laporan yang datang terlambat.';
            } elseif (self::proofHash($task) !== $window->proof_hash || self::sertimHash($taskClaims) !== $window->sertim_hash) {
                $reason = 'Bukti POP atau Sertim berubah setelah pengesahan.';
            } elseif ($selected->count() !== count($window->report_job_ids ?? []) || self::reportEvidence($selected) !== $window->report_evidence || $selected->contains(fn (ReportJob $report): bool => ! self::ready($report))) {
                $reason = 'Status atau bukti laporan berubah setelah pengesahan.';
            }
            $complete = $window->status === 'COMPLETE' && $reason === null;
            $result[$task->id] = ['status' => $complete ? 'COMPLETE' : ($window->status === 'COMPLETE' ? 'REVIEW' : 'OPEN'), 'complete' => $complete,
                'version' => $window->version, 'reason' => $reason, 'window' => $window->only(['id', 'jne_source_contract_id', 'required_sources', 'report_job_ids', 'report_evidence', 'cutoff_at', 'attested_at', 'updated_by'])];
        }

        return $result;
    }

    public static function proofHash(PickupTask $task): string
    {
        $task->loadMissing('proof.revisions');
        $values = $task->proof?->effectiveValues() ?? [];

        return hash('sha256', json_encode(array_map(fn (string $category): int => (int) ($values[$category] ?? 0), PickupProcessingRecord::CATEGORIES), JSON_THROW_ON_ERROR));
    }

    /** @param Collection<int, PickupCashlessAwb> $claims */
    public static function sertimHash(Collection $claims): string
    {
        return hash('sha256', json_encode($claims->sortBy('id')->map(fn (PickupCashlessAwb $claim): array => [$claim->id, $claim->version, $claim->awb])->values()->all(), JSON_THROW_ON_ERROR));
    }

    public static function ready(ReportJob $job): bool
    {
        return in_array($job->workflowStage(), ['READY', 'SOURCE_SAVED'], true)
            || ($job->status === 'NO_DATA' && $job->source === 'hybrid' && $job->report_type === 'combined' && $job->source_row_count === 0 && $job->source_file_checksum !== null);
    }

    /** @param Collection<int, ReportJob> $jobs
     * @return list<array<string, mixed>>
     */
    public static function reportEvidence(Collection $jobs): array
    {
        return array_values($jobs->sortBy('id')->map(fn (ReportJob $job): array => $job->only(['id', 'source', 'report_type', 'customer_account', 'national_account', 'status', 'import_status', 'projection_status', 'file_checksum', 'source_file_checksum']))->all());
    }
}
