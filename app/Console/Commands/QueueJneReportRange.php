<?php

namespace App\Console\Commands;

use App\Actions\Reports\QueueScheduledJneReports;
use App\Models\JneReportProfile;
use App\Models\ReportJob;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;

class QueueJneReportRange extends Command
{
    protected $signature = 'jne-reports:queue-range {from} {thru} {--user= : Active supervisor requesting the reports} {--source=all : all, apex, or hybrid}';

    protected $description = 'Queue historical enabled customer profiles, reusing existing periods without changing recurring schedules';

    public function handle(QueueScheduledJneReports $scheduler): int
    {
        $validator = Validator::make([
            'from' => $this->argument('from'), 'thru' => $this->argument('thru'),
            'user' => $this->option('user'), 'source' => $this->option('source'),
        ], [
            'from' => ['required', 'date_format:Y-m-d'],
            'thru' => ['required', 'date_format:Y-m-d', 'after_or_equal:from'],
            'user' => ['required', 'integer'], 'source' => ['required', 'in:all,apex,hybrid'],
        ]);
        if ($validator->fails()) {
            $this->error($validator->errors()->first());

            return self::FAILURE;
        }
        $data = $validator->validated();
        $actor = User::whereKey($data['user'])->where('is_active', true)->where('role', 'admin_supervisor')->first();
        if ($actor === null) {
            $this->error('An active Admin / Supervisor is required.');

            return self::FAILURE;
        }
        $from = CarbonImmutable::parse($data['from']);
        $thru = CarbonImmutable::parse($data['thru']);
        if ($from->diffInDays($thru) >= config('jne-reports.max_request_days')) {
            $this->error('Requested range exceeds the maximum request days.');

            return self::FAILURE;
        }
        $periods = $scheduler->periods([[$data['from'], $data['thru']]]);
        $requestKey = (string) Str::uuid();
        $counts = DB::transaction(function () use ($data, $actor, $from, $thru, $periods, $requestKey): array {
            $counts = ['created' => 0, 'reused' => 0, 'sources' => 0, 'attention' => 0];
            $profiles = JneReportProfile::where('enabled', true)
                ->where(fn ($query) => $query->where(fn ($query) => $query->where('source', 'apex')->where('report_type', 'apex'))
                    ->orWhere(fn ($query) => $query->where('source', 'hybrid')->where('report_type', 'combined')->whereIn('customer_account', array_keys(ReportJob::HYBRID_SERVERS))))
                ->when($data['source'] !== 'all', fn ($query) => $query->where('source', $data['source']))
                ->orderBy('id')->lockForUpdate()->get();
            foreach ($profiles as $profile) {
                $profileRequestKey = (string) Str::uuid();
                $windows = $periods;
                if ($profile->source === 'hybrid') {
                    $windows = [];
                    for ($day = $from; $day->lessThanOrEqualTo($thru); $day = $day->addDay()) {
                        $windows[] = [$day->toDateString(), $day->toDateString()];
                    }
                }
                foreach ($windows as [$start, $end]) {
                    $periodRequestKey = $profile->source === 'hybrid' ? (string) Str::uuid() : $profileRequestKey;
                    $existing = ReportJob::where('source', $profile->source)->where('report_type', $profile->report_type)
                        ->where('customer_account', $profile->customer_account)->where('national_account', $profile->national_account)
                        ->whereDate('date_from', $start)->whereDate('date_thru', $end)->orderByDesc('id')->first();
                    if ($existing !== null) {
                        $counts['reused']++;
                        if ($existing->workflowStage() === 'ATTENTION') {
                            $counts['attention']++;
                            $this->warn('Existing report #'.$existing->id.' requires review; not resubmitted.');
                        }

                        continue;
                    }
                    $job = ReportJob::create([
                        'schedule_key' => hash('sha256', 'backfill|'.$profile->id.'|'.$start.'|'.$end),
                        'request_key' => $periodRequestKey, 'jne_report_profile_id' => $profile->id,
                        'source' => $profile->source, 'report_type' => $profile->report_type,
                        'customer_account' => $profile->customer_account, 'national_account' => $profile->national_account,
                        'date_from' => $start, 'date_thru' => $end, 'report_mode' => 'P',
                        'status' => $profile->source === 'hybrid' ? 'COLLECTING_SOURCES' : 'QUEUED', 'created_by' => $actor->id,
                    ]);
                    $job->recordEvent('Historical batch '.$requestKey.' requested by Admin #'.$actor->id.'; recurring schedule unchanged.');
                    $counts['created']++;
                    if ($profile->source === 'hybrid') {
                        foreach (ReportJob::hybridParts($profile->customer_account) as [$source, $kind]) {
                            ReportJob::create([
                                'schedule_key' => hash('sha256', $job->id.'|'.$source.'|'.$kind),
                                'hybrid_batch_id' => $job->id, 'request_key' => $periodRequestKey,
                                'source' => $source, 'report_type' => $kind, 'customer_account' => strtoupper($source),
                                'date_from' => $start, 'date_thru' => $end, 'report_mode' => 'P',
                                'status' => 'QUEUED', 'created_by' => $actor->id,
                            ]);
                            $counts['sources']++;
                        }
                    }
                }
            }

            return $counts;
        }, 3);
        $this->info('Batch: '.$requestKey);
        $this->info($counts['created'].' reports queued; '.$counts['sources'].' Hybrid sources queued; '.$counts['reused'].' existing periods reused; '.$counts['attention'].' require review.');

        return $counts['attention'] > 0 ? self::FAILURE : self::SUCCESS;
    }
}
