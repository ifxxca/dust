<?php

namespace App\Actions\Reports;

use App\Models\ReportJob;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class QueueRetailReportRange
{
    public function handle(string $server, string $from, string $thru, int $actorId): void
    {
        $servers = $server === 'all' ? array_keys(ReportJob::HYBRID_SERVERS) : [$server];

        DB::transaction(function () use ($servers, $from, $thru, $actorId): void {
            $lastDate = CarbonImmutable::parse($thru);
            foreach ($servers as $account) {
                for ($date = CarbonImmutable::parse($from); $date->lessThanOrEqualTo($lastDate); $date = $date->addDay()) {
                    $requestKey = (string) Str::uuid();
                    $period = ['date_from' => $date->toDateString(), 'date_thru' => $date->toDateString()];
                    $batch = ReportJob::create([
                        ...$period, 'request_key' => $requestKey, 'customer_account' => $account,
                        'source' => 'hybrid', 'report_type' => 'combined', 'report_mode' => 'P',
                        'status' => 'COLLECTING_SOURCES', 'created_by' => $actorId,
                    ]);
                    foreach (ReportJob::hybridParts($account) as [$source, $kind]) {
                        ReportJob::create([
                            ...$period, 'hybrid_batch_id' => $batch->id, 'request_key' => $requestKey,
                            'schedule_key' => hash('sha256', $batch->id.'|'.$source.'|'.$kind),
                            'source' => $source, 'report_type' => $kind, 'customer_account' => strtoupper($source),
                            'report_mode' => 'P', 'status' => 'QUEUED', 'created_by' => $actorId,
                        ]);
                    }
                }
            }
        });
    }
}
