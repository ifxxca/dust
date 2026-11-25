<?php

namespace App\Actions\Monitoring;

use App\Models\ReportJob;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;
use Throwable;

class RecordReportWorkerTelemetry
{
    public function __construct(private OperationsTelemetry $telemetry) {}

    public function handle(Request $request, Response $response): void
    {
        if (! config('control-center.enabled') || ! $request->routeIs('internal.report-jobs.*') || ! $response->isSuccessful()) {
            return;
        }
        try {
            $data = $response instanceof JsonResponse ? ($response->getData(true)['data'] ?? []) : [];
            $stage = $data['status'] ?? null;
            $id = $data['id'] ?? null;
            $idle = $request->routeIs('internal.report-jobs.claim') && $response->getStatusCode() === 204;
            $sourceSaved = $request->routeIs('internal.report-jobs.source-upload') && ($data['source_saved'] ?? false) === true;
            if (! $idle && (! is_int($id) || (! $sourceSaved && ! in_array($stage, ['RETRY_WAIT', ...ReportJob::ACTIVE_STATUSES, ...ReportJob::TERMINAL_STATUSES], true)))) {
                return;
            }
            $identity = $request->header('X-Worker-ID').':api';
            $source = $request->attributes->get('report_source');
            $previous = $this->telemetry->find('workers', $identity) ?? [];
            if ($idle && ($previous['state'] ?? '') === 'IDLE' && isset($previous['observed_at']) && CarbonImmutable::parse($previous['observed_at'])->between(now()->subSeconds(10), now())) {
                return;
            }
            $active = ! $sourceSaved && in_array($stage, ReportJob::ACTIVE_STATUSES, true);
            $healthy = $sourceSaved || in_array($stage, ['COMPLETED', 'NO_DATA', 'SOURCE_SAVED'], true);
            $integrations = $previous['integrations'] ?? [];
            if ($healthy && $source !== null && ($request->routeIs('internal.report-jobs.upload', 'internal.report-jobs.source-upload') || ($request->routeIs('internal.report-jobs.fail') && $stage === 'NO_DATA'))) {
                $integrations[$source] = ['state' => 'HEALTHY', 'observed_at' => now()->toIso8601String(), 'endpoint' => null];
            }
            $this->telemetry->write('workers', $identity, [
                'identity' => $identity, 'origin' => 'worker_api', 'runtime' => $source === 'apex' ? 'Node APEX' : 'Node Hybrid',
                'state' => $active ? 'BUSY' : 'IDLE',
                'observed_at' => now()->toIso8601String(), 'job' => $active ? ($source === 'apex' ? 'Report APEX' : 'Hybrid report') : null,
                'job_id' => $active ? (string) $id : null, 'queue' => null, 'connection' => null, 'timeout' => null,
                'integrations' => $integrations,
            ]);
        } catch (Throwable) {
            // A telemetry failure must never change the authenticated worker response.
        }
    }
}
