<?php

namespace App\Console\Commands;

use App\Actions\Reports\ManageReportJobs;
use App\Models\ReportJob;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Validator;

class RetryJneSourceFailures extends Command
{
    protected $signature = 'jne-reports:retry-source-failures {from} {thru} {--user= : Active supervisor requesting one retry}';

    protected $description = 'Retry a confirmed first-attempt APEX API 500 once, preserving source files and uncertain submissions';

    public function handle(ManageReportJobs $manager): int
    {
        $validator = Validator::make(['from' => $this->argument('from'), 'thru' => $this->argument('thru'), 'user' => $this->option('user')], [
            'from' => ['required', 'date_format:Y-m-d'], 'thru' => ['required', 'date_format:Y-m-d', 'after_or_equal:from'],
            'user' => ['required', 'integer'],
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
        $jobs = ReportJob::where('status', 'NEEDS_ATTENTION')->where('attempt_count', 1)->whereNull('file_path')
            ->whereNull('active_slot')->whereNull('lease_expires_at')->whereRaw("error_message like ? ESCAPE '!'", ['APEX!_SOURCE!_API:%'])
            ->whereDate('date_from', '>=', $data['from'])->whereDate('date_thru', '<=', $data['thru'])
            ->where(fn ($query) => $query->where(fn ($query) => $query->where('source', 'apex')->where('report_type', 'apex')->where('report_mode', 'P'))
                ->orWhere(fn ($query) => $query->where('source', 'hybrid')->where('report_type', 'combined')->where('report_mode', 'A')->whereNotNull('source_file_path')))
            ->orderBy('id')->pluck('id');
        foreach ($jobs as $id) {
            $manager->retryApexSourceFailure($id, $actor->id);
        }
        $this->info($jobs->count().' confirmed source failure(s) queued for one retry.');

        return self::SUCCESS;
    }
}
