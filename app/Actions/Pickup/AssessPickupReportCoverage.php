<?php

namespace App\Actions\Pickup;

use App\Actions\Reports\QueryJneCollectionWindows;
use App\Models\JneReportAwb;
use App\Models\JneShipment;
use App\Models\JneSourceContract;
use App\Models\PickupTask;
use App\Models\ReportJob;
use Illuminate\Database\Eloquent\Collection;

class AssessPickupReportCoverage
{
    public function __construct(private QueryJneCollectionWindows $windows) {}

    /** @return array{complete: bool, method: string, reports: list<int>, reasons: list<string>} */
    public function handle(PickupTask $task): array
    {
        $manual = $this->windows->handle(new Collection([$task]))[$task->id];
        if ($manual['complete']) {
            return ['complete' => true, 'method' => 'ADMIN_ATTESTATION', 'reports' => $manual['window']['report_job_ids'] ?? [], 'reasons' => []];
        }
        $date = $task->proof?->picked_up_at ? PickupResultPeriod::date($task->proof->picked_up_at)->toDateString() : null;
        $confirmed = JneShipment::where('pickup_task_id', $task->id)->where('match_status', 'MATCHED')->with('latestSource')->get();
        $dates = $confirmed->toBase()->map(fn (JneShipment $row): ?string => $row->latestSource?->entry_at?->setTimezone(config('jne-reports.source_timezone'))->toDateString())->push($date)->filter()->unique();
        $contracts = JneSourceContract::whereNotNull('active_key')->whereNotNull('verified_at')->get();
        foreach ($contracts as $contract) {
            $definition = $contract->definition;
            $required = $definition['collection_requirements'] ?? [];
            if (! config('jne-reports.evidence_policies_enabled') || ! config('jne-reports.category_reconciliation_enabled') || ! $date
                || ($definition['automatic_reconciliation'] ?? false) !== true || ($definition['collection_mode'] ?? '') !== 'complete_date_report'
                || empty($definition['customer_code_column']) || $required === []) {
                continue;
            }
            $reports = [];
            $valid = true;
            foreach ($required as $requirement) {
                $parts = explode(':', $requirement, 3);
                if (count($parts) < 2 || $parts[1] === 'unresolved') {
                    $valid = false;
                    break;
                }
                foreach ($dates as $sourceDate) {
                    $job = ReportJob::where('source', $parts[0])->where('report_type', $parts[1])->when(isset($parts[2]), fn ($query) => $query->where('customer_account', $parts[2]))
                        ->whereDate('date_from', '<=', $sourceDate)->whereDate('date_thru', '>=', $sourceDate)->orderByDesc('id')->first();
                    if (! $job || $job->status !== 'COMPLETED' || $job->import_status !== 'IMPORTED' || $job->projection_status !== 'PROJECTED'
                        || ! $job->file_checksum || ! empty(data_get($job->getAttribute('parameters'), 'awbs'))) {
                        $valid = false;
                        break 2;
                    }
                    $sourceContract = $contracts->firstWhere('active_key', JneSourceContract::key($job->source, $job->report_type));
                    if (! $sourceContract || ($sourceContract->definition['automatic_reconciliation'] ?? false) !== true
                        || ($sourceContract->definition['collection_mode'] ?? '') !== 'complete_date_report') {
                        $valid = false;
                        break 2;
                    }
                    $reports[] = $job->id;
                }
            }
            if ($valid) {
                $confirmedAwbs = $confirmed->pluck('awb');
                $covered = JneReportAwb::whereIn('report_job_id', $reports)->whereIn('awb', $confirmedAwbs)->distinct()->count('awb');
                if ($confirmedAwbs->isEmpty() || $covered !== $confirmedAwbs->count()) {
                    continue;
                }

                return ['complete' => true, 'method' => 'AUTOMATIC_VERIFIED_CONTRACT', 'reports' => array_values(array_unique($reports)), 'reasons' => []];
            }
        }

        return ['complete' => false, 'method' => 'AWAITING_EVIDENCE', 'reports' => [], 'reasons' => ['Cakupan report lengkap belum terbukti; periksa kontrak sumber dan status tarikan.']];
    }
}
