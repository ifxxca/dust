<?php

namespace App\Actions\Pickup;

use App\Actions\Reports\AssessJneReportCollection;
use App\Actions\Reports\QueryJneCollectionWindows;
use App\Models\JneReportAwb;
use App\Models\JneShipment;
use App\Models\JneSourceContract;
use App\Models\PickupTask;
use App\Models\ReportJob;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Collection;

class AssessPickupReportCoverage
{
    public function __construct(private QueryJneCollectionWindows $windows, private AssessJneReportCollection $collections) {}

    /** @return array{complete: bool, method: string, reports: list<int>, reasons: list<string>, state: string, requirements: list<array<string, mixed>>, required_dates: list<string>, cutoff_at: ?string} */
    public function handle(PickupTask $task): array
    {
        $manual = $this->windows->handle(new Collection([$task]))[$task->id];
        if ($manual['complete']) {
            return ['complete' => true, 'method' => 'ADMIN_ATTESTATION', 'reports' => $manual['window']['report_job_ids'] ?? [], 'reasons' => [], 'state' => 'FULL_COLLECTION', 'requirements' => [], 'required_dates' => [], 'cutoff_at' => $manual['window']['cutoff_at'] ?? null];
        }
        $date = $task->proof?->picked_up_at ? PickupResultPeriod::date($task->proof->picked_up_at)->toDateString() : null;
        $confirmed = JneShipment::where('pickup_task_id', $task->id)->where('match_status', 'MATCHED')->with('latestSource')->get();
        $dates = $confirmed->toBase()->map(fn (JneShipment $row): ?string => $row->latestSource?->entry_at?->setTimezone(config('jne-reports.source_timezone'))->toDateString())->push($date)->filter()->unique();
        $dates = $dates->sort()->values()->all();
        $contracts = JneSourceContract::whereNotNull('active_key')->whereNotNull('verified_at')->get();
        $requirements = [];
        foreach ($contracts as $contract) {
            $definition = $contract->definition;
            $required = $definition['collection_requirements'] ?? [];
            if (! config('jne-reports.evidence_policies_enabled') || ! config('jne-reports.category_reconciliation_enabled') || ! $date
                || ($definition['automatic_reconciliation'] ?? false) !== true || ($definition['collection_mode'] ?? '') !== 'complete_date_report'
                || empty($definition['customer_code_column']) || $required === []) {
                continue;
            }
            $reports = [];
            $coveredCategories = [];
            $valid = true;
            $requirementOffset = count($requirements);
            [$policyDates, $cutoff] = $this->collectionPeriod($date, $required, $dates);
            $watermark = $confirmed->toBase()->map(fn (JneShipment $row) => $row->latestSource?->entry_at)->filter()->push($task->proof->picked_up_at)->sort()->last();
            $end = PickupResultPeriod::start($date)->addDay()->utc();
            $minimumCutoff = $watermark->min($end);
            if ($cutoff === null || $cutoff->lessThan($minimumCutoff)) {
                $valid = false;
                $requirements[] = ['policy_contract_id' => $contract->id, 'state' => 'UNKNOWN', 'reasons' => ['Cutoff sumber belum mencakup waktu pickup dan bukti AWB terkini pada bucket ini.']];
            }
            foreach ($required as $requirement) {
                $parts = explode(':', $requirement, 3);
                if (count($parts) !== 3 || trim($parts[2]) === '' || $parts[1] === 'unresolved') {
                    $requirements[] = ['policy_contract_id' => $contract->id, 'policy_contract_revision' => $contract->revision, 'requirement' => $requirement,
                        'state' => 'UNKNOWN', 'reasons' => ['Coverage otomatis memerlukan source, jenis report, dan account yang eksplisit.']];
                    $valid = false;

                    continue;
                }
                foreach ($policyDates as $sourceDate) {
                    $query = ReportJob::where('source', $parts[0])->where('report_type', $parts[1])->where('customer_account', $parts[2])
                        ->whereDate('date_from', '<=', $sourceDate)->whereDate('date_thru', '>=', $sourceDate);
                    $job = (clone $query)->orderByDesc('id')->first();
                    $sourceContract = $contracts->firstWhere('active_key', JneSourceContract::key($parts[0], $parts[1]));
                    $assessment = $job ? $this->collections->handle($job, $sourceContract)
                        : ['state' => 'UNKNOWN', 'complete' => false, 'reasons' => ['Report yang mencakup tanggal dan account wajib belum ditemukan.'], 'evidence' => null];
                    if ($job && $cutoff !== null && $assessment['complete']) {
                        $sourceEnd = CarbonImmutable::parse($sourceDate, config('jne-reports.source_timezone'))->addDay()->utc();
                        $requiredCutoff = $cutoff->min($sourceEnd);
                        if (($job->started_at ?? $job->created_at)->lessThan($requiredCutoff)) {
                            $assessment = [...$assessment, 'state' => 'UNKNOWN', 'complete' => false,
                                'reasons' => [...$assessment['reasons'], 'Report belum mencakup cutoff koleksi yang dibutuhkan; tunggu koleksi sumber terbaru.']];
                        }
                    }
                    $success = (clone $query)->where('status', 'COMPLETED')->where('import_status', 'IMPORTED')->where('projection_status', 'PROJECTED')->orderByDesc('id')->value('id');
                    $eligible = $this->collections->latestEligible($query, $sourceContract);
                    $requirements[] = ['policy_contract_id' => $contract->id, 'policy_contract_revision' => $contract->revision,
                        'requirement' => $requirement, 'date' => $sourceDate, 'cutoff_at' => $cutoff?->toIso8601String(), 'latest_attempt_id' => $job?->id,
                        'latest_successful_id' => $success, 'latest_coverage_eligible_id' => $eligible?->id,
                        'state' => $assessment['state'], 'reasons' => $assessment['reasons'], 'evidence' => $assessment['evidence']];
                    if (! $assessment['complete']) {
                        $valid = false;

                        continue;
                    }
                    $reports[] = $job->id;
                    $coveredCategories = [...$coveredCategories, ...($assessment['evidence']['capability']['categories'] ?? [])];
                }
            }
            if ($valid) {
                $quantities = $task->proof?->effectiveValues() ?? [];
                $requiredCategories = collect(['manual_hybrid', 'cashless_hybrid', 'css_orion'])
                    ->filter(fn (string $category): bool => ($quantities[$category] ?? 0) > 0)->all();
                if (array_diff($requiredCategories, $coveredCategories) !== []) {
                    $requirements[] = ['policy_contract_id' => $contract->id, 'state' => 'UNKNOWN', 'reasons' => ['Sumber coverage belum terbukti mencakup seluruh kategori paket yang diwajibkan POP.']];

                    continue;
                }
                $confirmedAwbs = $confirmed->pluck('awb');
                $covered = JneReportAwb::whereIn('report_job_id', $reports)->whereIn('awb', $confirmedAwbs)->distinct()->count('awb');
                if ($covered !== $confirmedAwbs->count()) {
                    $requirements[] = ['policy_contract_id' => $contract->id, 'state' => 'UNKNOWN', 'reasons' => ['AWB terikat belum seluruhnya terwakili oleh report wajib.']];

                    continue;
                }

                return ['complete' => true, 'method' => 'AUTOMATIC_VERIFIED_CONTRACT', 'reports' => array_values(array_unique($reports)), 'reasons' => [],
                    'state' => 'FULL_COLLECTION', 'requirements' => array_slice($requirements, $requirementOffset), 'required_dates' => $policyDates, 'cutoff_at' => $cutoff?->toIso8601String()];
            }
        }

        $states = array_column($requirements, 'state');
        $state = collect(['FAILED', 'PENDING', 'SUBSET_COLLECTION'])->first(fn (string $state): bool => in_array($state, $states, true)) ?? 'UNKNOWN';

        return ['complete' => false, 'method' => 'AWAITING_EVIDENCE', 'reports' => [], 'reasons' => ['Cakupan report lengkap belum terbukti; periksa kontrak sumber dan status tarikan.'],
            'state' => $state, 'requirements' => $requirements, 'required_dates' => array_values(array_unique([...$dates, ...array_filter(array_column($requirements, 'date'))])), 'cutoff_at' => null];
    }

    /**
     * @param  list<string>  $required
     * @param  list<string>  $knownDates
     * @return array{list<string>, ?CarbonImmutable}
     */
    private function collectionPeriod(string $date, array $required, array $knownDates): array
    {
        $cutoffs = [];
        foreach ($required as $requirement) {
            $parts = explode(':', $requirement, 3);
            if (count($parts) !== 3) {
                return [$knownDates, null];
            }
            $job = ReportJob::where('source', $parts[0])->where('report_type', $parts[1])->where('customer_account', $parts[2])
                ->whereDate('date_from', '<=', $date)->whereDate('date_thru', '>=', $date)->orderByDesc('id')->first();
            $at = $job?->started_at ?? $job?->created_at;
            if (! $at || $at->isFuture()) {
                return [$knownDates, null];
            }
            $cutoffs[] = $at;
        }
        $cutoff = collect($cutoffs)->sort()->first()?->min(PickupResultPeriod::start($date)->addDay()->utc());
        if ($cutoff !== null && $cutoff->greaterThan(PickupResultPeriod::start($date)->utc())) {
            $lastDate = $cutoff->subMicrosecond()->setTimezone(config('jne-reports.source_timezone'))->toDateString();
            $knownDates[] = $lastDate;
        }
        sort($knownDates);

        return [array_values(array_unique($knownDates)), $cutoff];
    }
}
