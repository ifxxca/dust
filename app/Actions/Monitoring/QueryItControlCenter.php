<?php

namespace App\Actions\Monitoring;

use App\Models\ReportJob;
use Carbon\CarbonImmutable;
use Cron\CronExpression;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Database\QueryException;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Throwable;

class QueryItControlCenter
{
    /** @var list<string> */
    private array $unavailable = [];

    /** @var list<array{source: string, state: string, observed_at: string, duration_ms: float, exception_type: ?string, sqlstate: ?string, driver_code: ?int, category: ?string}> */
    private array $sourceDiagnostics = [];

    public function __construct(private OperationsTelemetry $telemetry, private QueryServerHeartbeats $heartbeats) {}

    /** @return array<string, mixed> */
    public function handle(): array
    {
        $started = hrtime(true);
        $this->unavailable = [];
        $this->sourceDiagnostics = [];
        $databaseAvailable = $this->attempt('database_probe', fn () => DB::select('select 1')) !== null;
        $workerObservations = $this->workers();
        $workers = $workerObservations['current'];
        $hosts = $this->heartbeats->handle($this->telemetry->read('workers'), $workers);
        $queues = $this->queues($workers);
        $reports = $this->sample('report_jobs', ['id', 'source', 'report_type', 'status', 'started_at', 'completed_at', 'updated_at', 'created_at', 'import_status', 'projection_status', 'imported_awb_count', 'duplicate_awb_count', 'imported_at', 'row_count', 'attempt_count', 'worker_id', 'lease_expires_at', 'error_message', 'import_error', 'projection_error']);
        $pipelines = $this->reportPipelines($reports);
        $sources = [
            ['cashless_entry_batches', 'Cashless entry', ['id', 'source', 'status', 'created_at', 'updated_at', 'approved_at', 'lease_until', 'error_message'], 'approved_at', null, 'error_message'],
            ['jne_mapping_runs', 'Customer mapping', ['id', 'status', 'created_at', 'updated_at', 'completed_at', 'affected_count', 'error_message'], 'completed_at', 'affected_count', 'error_message'],
            ['pickup_processing_reconciliations', 'Rekonsiliasi pickup', ['id', 'status', 'evaluated_at', 'updated_at', 'last_error'], 'evaluated_at', null, 'last_error'],
            ['pickup_customer_reconciliations', 'Kompilasi customer / hari', ['id', 'status', 'evaluated_at', 'updated_at', 'pickup_count'], 'evaluated_at', 'pickup_count', null],
            ['pickup_awb_manifests', 'Dokumen AWB', ['id', 'status', 'created_at', 'updated_at', 'render_attempts', 'last_error'], null, null, 'last_error'],
            ['pickup_awb_deliveries', 'Email rekap kiriman', ['id', 'status', 'started_at', 'accepted_at', 'updated_at', 'last_error'], 'accepted_at', null, 'last_error'],
            ['pickup_receipts', 'Email bukti pickup', ['id', 'status', 'created_at', 'updated_at', 'accepted_at', 'last_error'], 'accepted_at', null, 'last_error'],
            ['mobile_push_deliveries', 'Push penugasan', ['id', 'status', 'created_at', 'updated_at'], null, null, null],
            ['cashless_entry_alert_deliveries', 'Push hasil cashless', ['id', 'status', 'created_at', 'updated_at'], null, null, null],
        ];
        foreach ($sources as [$table, $name, $columns, $end, $count, $error]) {
            foreach ($this->sample($table, $columns) as $row) {
                $pipelines[] = $this->pipeline($table.':'.$row->id, $name, (string) $row->status, $row->started_at ?? $row->created_at ?? null,
                    $end ? ($row->{$end} ?? null) : null, $row->updated_at ?? null,
                    $count ? ($row->{$count} ?? null) : null, $error ? ($row->{$error} ?? null) : null,
                    $row->render_attempts ?? null, $row->lease_until ?? null);
            }
        }
        $runs = collect($this->telemetry->read('workers'))->flatMap(fn (array $row): array => $row['runs'] ?? [])
            ->filter(fn (array $row): bool => $this->recent($row['observed_at'] ?? null))->values();
        foreach ($runs as $run) {
            $row = $this->pipeline('attempt:'.$this->identifier($run['job_id'] ?? '').':'.(int) ($run['attempts'] ?? 0), 'PHP handler / '.$this->identifier($run['job'] ?? ''), $run['state'] ?? 'UNKNOWN', $run['started_at'] ?? null, $run['observed_at'] ?? null, $run['observed_at'] ?? null, null, isset($run['error']) ? ($run['error']['code'] ?? 'OPERATION_FAILED').':' : null, (int) ($run['attempts'] ?? 0));
            $row['outcome'] = $run['state'] ?? 'UNKNOWN';
            $row['duration_ms'] = is_numeric($run['duration_ms'] ?? null) ? (int) $run['duration_ms'] : null;
            $row['exception_type'] = $this->identifier($run['exception_class'] ?? null);
            $pipelines[] = $row;
        }
        foreach ($this->commands() as $command) {
            $row = $this->pipeline('command:'.$command['name'], 'CLI import & maintenance / '.$command['name'], $command['state'], $command['started_at'], $command['state'] === 'RUNNING' ? null : $command['observed_at'], $command['observed_at'], null, $command['state'] === 'FAILED' ? 'COMMAND_FAILED:' : null);
            $row['active'] = false;
            $row['duration_ms'] = $command['duration_ms'];
            $pipelines[] = $row;
        }
        $diagnostics = $this->diagnostics($pipelines);
        usort($pipelines, fn (array $a, array $b): int => ($b['active'] <=> $a['active']) ?: strcmp($b['observed_at'] ?? '', $a['observed_at'] ?? ''));
        $integrations = $this->integrations($reports, $workers);
        $scheduler = $this->scheduler();
        $services = $this->services($workers, $pipelines, $scheduler, $integrations, $databaseAvailable, $hosts);
        $durations = $runs->pluck('duration_ms')->filter(fn ($value): bool => is_numeric($value) && $value >= 0)->sort()->values();
        $waits = $runs->pluck('wait_ms')->filter(fn ($value): bool => is_numeric($value) && $value >= 0)->sort()->values();
        $backlogs = $this->attempt('report_backlog', fn (): array => DB::table('report_jobs')->select('source', 'status')->selectRaw('count(*) as total')->whereIn('status', ['QUEUED', 'RETRY_WAIT', 'COLLECTING_SOURCES', 'WAITING_APEX', 'RUNNING', 'WAITING_REPORT', 'DOWNLOADING'])->groupBy('source', 'status')->get()->map(fn ($row): array => ['source' => $row->source, 'status' => $row->status, 'count' => (int) $row->total])->all());

        $instrumentation = $this->instrumentation();

        return [
            'hosts' => $hosts,
            'observed_at' => now()->toIso8601String(), 'timezone' => 'Asia/Jakarta',
            'sample_limit' => 100, 'window' => 'Maksimum 100 ID terbaru per sumber; diagnostik dan lifecycle dibatasi 24 jam',
            'services' => $services, 'workers' => $workers, 'queues' => $queues,
            'retired_workers' => $workerObservations['retired'], 'retired_workers_count' => $workerObservations['retired_count'],
            'scheduler' => $scheduler, 'integrations' => $integrations, 'backlogs' => $backlogs,
            'pipelines' => array_slice($pipelines, 0, 100), 'diagnostics' => $diagnostics,
            'report_retries' => config('jne-reports.automatic_retry_enabled') ? $this->attempt('report_retry_attention', function (): array {
                $attention = ReportJob::whereNotNull('retry_final_at')->whereNull('reviewed_at')->where('status', 'NEEDS_ATTENTION');

                return ['enabled' => true, 'waiting' => ReportJob::where('status', 'RETRY_WAIT')->count(),
                    'attention_total' => (clone $attention)->count(),
                    'attention' => $attention->orderBy('retry_final_at')->limit(100)->get(['id', 'hybrid_batch_id', 'source', 'customer_account', 'attempt_count', 'retry_error_code', 'retry_classification', 'retry_final_at'])
                        ->map(fn (ReportJob $job): array => ['id' => $job->id, 'run_id' => $job->hybrid_batch_id ?? $job->id,
                            'source' => $job->source, 'account' => $job->customer_account, 'attempts' => $job->attempt_count,
                            'code' => $job->retry_error_code, 'classification' => $job->retry_classification,
                            'failed_at' => $job->retry_final_at->toIso8601String()])->all()];
            }) : null,
            'overview' => [
                'healthy' => count(array_filter($services, fn (array $row): bool => $row['state'] === 'HEALTHY')),
                'degraded' => count(array_filter($services, fn (array $row): bool => $row['state'] === 'DEGRADED')),
                'unhealthy' => count(array_filter($services, fn (array $row): bool => $row['state'] === 'UNHEALTHY')),
                'unknown' => count(array_filter($services, fn (array $row): bool => $row['state'] === 'UNKNOWN')),
                'workers_available' => count(array_filter($workers, fn (array $row): bool => in_array($row['state'], ['BUSY', 'IDLE'], true))),
                'workers_unknown' => count(array_filter($workers, fn (array $row): bool => $row['state'] === 'UNKNOWN')),
                'active_reports' => $backlogs === null ? null : array_sum(array_column(array_filter($backlogs, fn (array $row): bool => in_array($row['status'], ['RUNNING', 'WAITING_REPORT', 'DOWNLOADING'], true)), 'count')),
                'last_success' => collect($pipelines)->filter(fn (array $row): bool => $row['outcome'] === 'SUCCESS')->max('finished_at'),
                'errors_in_sample' => count($diagnostics),
            ],
            'performance' => ['sample_count' => $durations->count(), 'duration_p50_ms' => $this->percentile($durations, .5), 'duration_p95_ms' => $this->percentile($durations, .95),
                'wait_p50_ms' => $this->percentile($waits, .5), 'wait_sample_count' => $waits->count(),
                'failed_attempt_percent' => $runs->isEmpty() ? null : round($runs->where('state', 'FAILED_ATTEMPT')->count() / $runs->count() * 100, 1),
                'throughput' => null, 'backlog_trend' => null, 'query_ms' => round((hrtime(true) - $started) / 1e6, 1)],
            'unavailable' => $this->unavailable,
            'source_diagnostics' => $this->sourceDiagnostics,
            'error_summary' => [
                'evidence_rows' => array_sum(array_column($diagnostics, 'occurrences')),
                'error_events' => collect($diagnostics)->where('kind', 'ERROR_EVENT')->sum('occurrences'),
                'failed_attempts' => collect($diagnostics)->where('kind', 'FAILED_ATTEMPT')->sum('occurrences'),
                'failed_jobs' => in_array('failed_job_details', $this->unavailable, true) ? null : collect($diagnostics)->where('kind', 'FAILED_JOB')->sum('occurrences'),
                'failed_runs' => collect($diagnostics)->where('kind', 'FAILED_RUN')->sum('occurrences'),
                'attention_records' => collect($diagnostics)->where('kind', 'ATTENTION')->sum('occurrences'),
                'incident_groups' => count(array_unique(array_column($diagnostics, 'incident_key'))),
                'unique_incidents' => null,
            ],
            'commands' => $this->commands(),
            'instrumentation' => $instrumentation,
        ];
    }

    /** @return array{current: list<array<string, mixed>>, retired: list<array<string, mixed>>, retired_count: int} */
    private function workers(): array
    {
        $rows = [];
        $retired = [];
        $observations = $this->telemetry->read('workers');
        foreach ($observations as $row) {
            if (($row['origin'] ?? null) === 'worker_api' && ($row['runtime'] ?? '') === 'Node APEX') {
                $prefix = substr($row['identity'], 0, -3);
                if (collect($observations)->contains(fn (array $native): bool => ($native['origin'] ?? null) !== 'worker_api' && ($native['runtime'] ?? '') === 'Node APEX' && in_array($native['state'] ?? '', ['BUSY', 'IDLE', 'UNHEALTHY'], true) && str_starts_with($native['identity'] ?? '', $prefix) && $this->fresh($native['observed_at'] ?? null))) {
                    continue;
                }
            }
            $observed = $this->date($row['observed_at'] ?? null);
            $fresh = $this->fresh($observed);
            $state = in_array($row['state'] ?? '', ['BUSY', 'IDLE', 'STOPPED', 'UNHEALTHY'], true) ? $row['state'] : 'UNKNOWN';
            if (! $fresh) {
                $state = 'UNKNOWN';
            }
            $observation = ['identity' => $this->identifier($row['identity'] ?? ''), 'runtime' => $this->identifier($row['runtime'] ?? ''), 'state' => $state,
                'host' => preg_match('/:([a-f0-9]{8}):[0-9]+$/', $row['identity'] ?? '', $host) ? $host[1] : null,
                'job_started_at' => $state === 'BUSY' ? $this->date($row['job_started_at'] ?? null) : null,
                'elapsed_seconds' => $state === 'BUSY' && $this->date($row['job_started_at'] ?? null) && CarbonImmutable::parse($row['job_started_at'])->lessThanOrEqualTo(now()) ? (int) CarbonImmutable::parse($row['job_started_at'])->diffInSeconds(now()) : null,
                'attempts' => $state === 'BUSY' && is_numeric($row['attempts'] ?? null) ? (int) $row['attempts'] : null,
                'configuration_matches' => isset($row['queue_settings'], $row['connection']) ? $row['queue_settings'] === ['driver' => config('queue.connections.'.$row['connection'].'.driver'), 'database_connection' => config('queue.connections.'.$row['connection'].'.connection') ?? config('database.default'), 'table' => config('queue.connections.'.$row['connection'].'.table'), 'retry_after' => config('queue.connections.'.$row['connection'].'.retry_after'), 'configuration_cached' => app()->configurationIsCached()] : null,
                'observed_at' => $observed, 'stale' => ! $fresh, 'queue' => $this->identifier($row['queue'] ?? ''), 'connection' => $this->identifier($row['connection'] ?? ''),
                'job' => $state === 'BUSY' ? $this->identifier($row['job'] ?? '') : null,
                'job_id' => $state === 'BUSY' ? $this->identifier((string) ($row['job_id'] ?? '')) : null,
                'timeout' => is_numeric($row['timeout'] ?? null) ? (int) $row['timeout'] : null,
                'evidence' => $fresh ? (($row['origin'] ?? null) === 'worker_api' ? 'Heartbeat API worker terautentikasi; claim/progress diterima server' : 'Process heartbeat / lifecycle') : 'Heartbeat tidak tersedia atau kedaluwarsa'];
            if (($row['state'] ?? '') === 'STOPPED' && ! $fresh) {
                $retired[] = [...$observation, 'state' => 'STOPPED', 'evidence' => 'Event berhenti historis; bukan status proses saat ini'];

                continue;
            }
            $rows[] = $observation;
        }
        $expectedWorkers = ['PHP default', 'PHP reconciliation', 'PHP documents', 'PHP deliveries', 'PHP mobile-push', 'Node Hybrid', ...array_keys(ReportJob::apexWorkerSlots())];
        foreach ($expectedWorkers as $expected) {
            $queue = str_replace('PHP ', '', $expected);
            $runtime = str_starts_with($expected, 'PHP ') ? 'PHP queue' : ($expected === 'Node Hybrid' ? 'Node Hybrid' : 'Node APEX');
            $found = collect($rows)->contains(fn (array $row): bool => str_starts_with($expected, 'PHP ') ? in_array($queue, explode(',', $row['queue'] ?? ''), true) : ($expected === 'Node Hybrid' ? $row['runtime'] === $expected : str_starts_with($row['identity'] ?? '', $expected.':')));
            if (! $found) {
                $rows[] = ['identity' => $expected, 'runtime' => $runtime, 'state' => 'UNKNOWN', 'observed_at' => null, 'stale' => true,
                    'queue' => str_starts_with($expected, 'PHP ') ? $queue : null, 'connection' => null, 'job' => null, 'job_id' => null, 'timeout' => null, 'evidence' => 'Belum ada heartbeat; bukan bukti proses berhenti'];
            }
        }

        return ['current' => $rows, 'retired' => array_slice($retired, 0, 20), 'retired_count' => count($retired)];
    }

    /**
     * @param  list<array<string, mixed>>  $workers
     * @return array<string, mixed>
     *
     * @phpstan-impure
     */
    private function queues(array $workers): array
    {
        $connections = collect((array) config('queue.connections'))->map(fn (array $value, string $key): array => ['name' => $key, 'driver' => $value['driver'], 'selected' => $key === config('queue.default')])->values()->all();
        $rows = [];
        $sources = [];
        $failedRows = [];
        foreach (config('queue.connections') as $queueConnection => $settings) {
            if ($settings['driver'] !== 'database') {
                continue;
            }
            $source = $queueConnection === 'database' ? 'database_queue' : 'database_queue:'.$queueConnection;
            $groups = $this->attempt($source, function () use ($settings): Collection {
                $connection = DB::connection($settings['connection'] ?? null);
                $epoch = now()->timestamp;
                $hint = $connection->getDriverName() === 'mysql' ? '/*+ MAX_EXECUTION_TIME(1000) */ ' : '';

                return $connection->table($settings['table'])->selectRaw($hint.'queue, count(*) as total, sum(case when reserved_at is not null then 1 else 0 end) as reserved_count, sum(case when reserved_at is null and available_at <= ? then 1 else 0 end) as pending_count, sum(case when reserved_at is null and available_at > ? then 1 else 0 end) as delayed_count, sum(case when attempts > 1 then 1 else 0 end) as retries, min(case when reserved_at is null and available_at <= ? then created_at else null end) as oldest, sum(case when reserved_at is not null and reserved_at + ? <= ? then 1 else 0 end) as expired', [$epoch, $epoch, $epoch, $settings['retry_after'], $epoch])->groupBy('queue')->get()->keyBy('queue');
            });
            $sources[] = ['connection' => $queueConnection, 'database_connection' => $settings['connection'] ?? config('database.default'), 'table' => $settings['table'], 'available' => $groups !== null];
            $names = array_unique([...array_keys($groups?->all() ?? []), $settings['queue'], 'default', 'reconciliation', 'documents', 'deliveries', 'mobile-push', ...collect($workers)->where('connection', $queueConnection)->flatMap(fn (array $worker): array => explode(',', $worker['queue'] ?? ''))->filter()->all()]);
            $failed = $this->attempt('failed_queue_counts:'.$queueConnection, function () use ($names, $queueConnection): Collection {
                if (! in_array(config('queue.failed.driver'), ['database', 'database-uuids'], true)) {
                    throw new \RuntimeException('Unsupported failed-job source');
                }

                return DB::connection(config('queue.failed.database'))->table(config('queue.failed.table'))->select('queue')->selectRaw('count(*) as total')->where('connection', $queueConnection)->whereIn('queue', $names)->whereBetween('failed_at', [now()->subDay(), now()])->groupBy('queue')->get()->keyBy('queue');
            });
            foreach ($names as $name) {
                $failedRows[] = ['connection' => $queueConnection, 'name' => $this->identifier($name), 'failed' => $failed === null ? null : (int) ($failed->get($name)->total ?? 0)];
            }
            if ($groups === null) {
                continue;
            }
            foreach ($names as $name) {
                $row = $groups->get($name);
                $available = collect($workers)->filter(fn (array $worker): bool => $worker['connection'] === $queueConnection && in_array($name, explode(',', $worker['queue'] ?? ''), true) && in_array($worker['state'], ['BUSY', 'IDLE'], true));
                $timeouts = $available->pluck('timeout')->filter(fn ($value): bool => $value !== null);
                $rows[] = ['name' => $this->identifier($name), 'connection' => $queueConnection, 'total' => (int) ($row->total ?? 0), 'pending' => (int) ($row->pending_count ?? 0), 'reserved' => (int) ($row->reserved_count ?? 0), 'delayed' => (int) ($row->delayed_count ?? 0),
                    'failed' => $failed === null ? null : (int) ($failed->get($name)->total ?? 0), 'retries' => (int) ($row->retries ?? 0),
                    'observed_concurrency' => $available->count(),
                    'oldest_pending_seconds' => $row?->oldest === null ? null : max(0, now()->getTimestamp() - (int) $row->oldest),
                    'expired_reservations' => (int) ($row->expired ?? 0), 'retry_after' => $settings['retry_after'], 'worker_timeout' => $timeouts->isEmpty() ? null : $timeouts->max(),
                    'timeout_risk' => $timeouts->isEmpty() ? null : $timeouts->max() >= $settings['retry_after']];
            }
        }

        return ['connection' => 'database', 'default_connection' => config('queue.default'), 'connections' => $connections, 'sources' => $sources, 'failed_rows' => $failedRows, 'rows' => $rows === [] ? null : $rows, 'observed_at' => now()->toIso8601String()];
    }

    /**
     * @param  list<string>  $columns
     * @return Collection<int, \stdClass>
     *
     * @phpstan-impure
     */
    private function sample(string $table, array $columns): Collection
    {
        return $this->attempt($table, function () use ($table, $columns): Collection {
            $latest = DB::table($table)->select($columns)->orderByDesc('id')->limit(100)->get();
            if ($table !== 'report_jobs') {
                return $latest;
            }
            $active = DB::table($table)->select($columns)->whereIn('status', ['RUNNING', 'WAITING_REPORT', 'DOWNLOADING', 'COLLECTING_SOURCES', 'WAITING_APEX'])->orderByDesc('id')->limit(100)->get();

            return $active->concat($latest)->unique('id')->take(100)->values();
        }) ?? collect();
    }

    /**
     * @param  Collection<int, \stdClass>  $reports
     * @return list<array<string, mixed>>
     */
    private function reportPipelines(Collection $reports): array
    {
        $rows = [];
        foreach ($reports as $row) {
            $rows[] = $this->pipeline('report:'.$row->id, 'Report '.strtoupper($row->source).' / '.$row->report_type, $row->status, $row->started_at, $row->completed_at, $row->updated_at, $row->row_count, $row->error_message, $row->attempt_count, $row->lease_expires_at);
            if ($row->import_status !== null) {
                $rows[] = $this->pipeline('report:'.$row->id.':import', 'CSV import', $row->import_status, null, $row->imported_at, $row->updated_at, $row->imported_awb_count, $row->import_error);
                $rows[array_key_last($rows)]['duplicates'] = $row->duplicate_awb_count;
            }
            if ($row->projection_status !== null) {
                $rows[] = $this->pipeline('report:'.$row->id.':projection', 'Tracking projection', $row->projection_status, null, null, $row->updated_at, null, $row->projection_error);
            }
        }

        return $rows;
    }

    /** @return array<string, mixed> */
    private function pipeline(string $id, string $name, string $stage, ?string $start, ?string $end, ?string $observed, ?int $records, ?string $error, ?int $attempts = null, ?string $lease = null): array
    {
        $failure = filled($error) || strtoupper($stage) === 'FAILED';
        $success = in_array(strtoupper($stage), ['SUCCESS', 'COMPLETED', 'NO_DATA', 'SOURCE_SAVED', 'IMPORTED', 'PROJECTED', 'DONE', 'READY', 'ACCEPTED', 'ACCEPTED_BY_PROVIDER', 'DELIVERED', 'SENT', 'VALID', 'MATCHED'], true);
        $attention = in_array(strtoupper($stage), ['NEEDS_ATTENTION', 'UNKNOWN', 'PARTIAL', 'UNREGISTERED', 'FAILED_OR_UNCERTAIN'], true);
        $start = $this->date($start);
        $end = $this->date($end);

        return ['id' => $id, 'name' => $name, 'stage' => $this->identifier($stage), 'outcome' => strtoupper($stage) === 'RETRY_WAIT' ? 'WAITING' : ($attention ? 'ATTENTION' : ($failure ? 'FAILED' : ($success ? 'SUCCESS' : 'WAITING'))),
            'active' => in_array(strtoupper($stage), ['RUNNING', 'WAITING_REPORT', 'DOWNLOADING', 'COLLECTING_SOURCES', 'WAITING_APEX', 'SENDING', 'RENDERING', 'IN_FLIGHT', 'CLAIMED', 'CREATING_HO', 'ENTERING', 'VERIFYING', 'APPROVING', 'CONFIRMING', 'INSPECTING'], true),
            'started_at' => $start, 'finished_at' => $end, 'observed_at' => $this->date($observed),
            'duration_ms' => $start && $end ? max(0, (int) CarbonImmutable::parse($start)->diffInMilliseconds(CarbonImmutable::parse($end))) : null,
            'records' => $records, 'attempts' => $attempts, 'duplicates' => null, 'lease_until' => $this->date($lease),
            'lease_expired' => $lease !== null && CarbonImmutable::parse($lease)->isPast() && ! $failure && ! $success,
            'error' => $failure ? $this->telemetry->error($error) : ($attention ? ['code' => 'BUSINESS_ATTENTION', 'summary' => 'Status bisnis perlu ditinjau; tidak ada bukti exception.'] : null), 'has_error_evidence' => $failure];
    }

    /** @return list<array<string, mixed>> */
    private function scheduler(): array
    {
        $rows = $this->attempt('scheduler_registration', function (): array {
            app(Kernel::class)->bootstrap();
            $observations = collect($this->telemetry->read('schedules'))->keyBy('identity');

            return collect(app(Schedule::class)->events())->map(function ($event) use ($observations): array {
                $name = RecordOperationsTelemetry::scheduleName($event);
                $timezone = $event->timezone instanceof \DateTimeZone ? $event->timezone->getName() : $event->timezone;
                $row = $observations->get($name, []);
                $observed = $this->date($row['observed_at'] ?? null);
                $fresh = false;
                if ($observed !== null && CarbonImmutable::parse($observed)->lessThanOrEqualTo(now())) {
                    $next = (new CronExpression($event->expression))->getNextRunDate(CarbonImmutable::parse($observed), timeZone: $timezone);
                    $fresh = now()->lessThanOrEqualTo(CarbonImmutable::instance($next)->addSeconds(config('control-center.fresh_seconds')));
                }

                return ['name' => $name, 'expression' => $event->expression, 'timezone' => $timezone,
                    'state' => $fresh ? ($row['state'] ?? 'UNKNOWN') : 'UNKNOWN', 'last_state' => $row['state'] ?? null, 'stale' => ! $fresh,
                    'last_run' => $this->date($row['started_at'] ?? null),
                    'last_success' => $this->date($row['last_success'] ?? null), 'last_failure' => $this->date($row['last_failure'] ?? null),
                    'duration_ms' => $row['duration_ms'] ?? null, 'observed_at' => $observed,
                    'next_expected_at' => CarbonImmutable::instance((new CronExpression($event->expression))->getNextRunDate(now(), timeZone: $timezone))->utc()->toIso8601String(), 'missed' => null, 'overlap_protection' => $event->withoutOverlapping];
            })->all();
        });

        return $rows ?? [];
    }

    /**
     * @param  Collection<int, \stdClass>  $reports
     * @param  list<array<string, mixed>>  $workers
     * @return list<array<string, mixed>>
     *
     * @phpstan-impure
     */
    private function integrations(Collection $reports, array $workers): array
    {
        $identities = ['apex' => 'APEX JNE CCC', 'roberto' => 'Hybrid PM', 'nuralamt' => 'Hybrid Puman'];
        $endpoints = $this->attempt('apex_endpoint_evidence', function (): array {
            $extract = DB::connection()->getDriverName() === 'mysql' ? "JSON_UNQUOTE(JSON_EXTRACT(parameters, '$.apex_history.origin'))" : "json_extract(parameters, '$.apex_history.origin')";

            return DB::table('report_jobs')->select('id')->selectRaw($extract.' as endpoint')->orderByDesc('id')->limit(100)->get()->filter(fn ($row): bool => is_string($row->endpoint))->map(fn ($row): array => ['report' => (int) $row->id, 'host' => parse_url($row->endpoint, PHP_URL_HOST)])->filter(fn (array $row): bool => is_string($row['host']) && preg_match('/^dash-ccc[0-9]+\.jne\.co\.id$/D', $row['host']))->values()->all();
        });
        $telemetry = collect($this->telemetry->read('workers'));
        $visible = collect($workers)->pluck('identity');

        return array_values(collect($identities)->map(function (string $name, string $source) use ($reports, $endpoints, $telemetry, $visible): array {
            $sample = $reports->filter(fn ($row): bool => $source === 'apex' ? in_array($row->source, ['apex', 'hybrid'], true) : $row->source === $source);
            $success = $sample->whereIn('status', ['COMPLETED', 'SOURCE_SAVED', 'NO_DATA'])->sortByDesc('completed_at')->first();
            $failure = $sample->whereIn('status', ['FAILED', 'NEEDS_ATTENTION'])->sortByDesc('updated_at')->first();
            $node = $telemetry->filter(fn (array $row): bool => ($row['runtime'] ?? '') === ($source === 'apex' ? 'Node APEX' : 'Node Hybrid'));
            $checks = $node->filter(fn (array $row): bool => $visible->contains($row['identity'] ?? null) && $this->fresh($row['observed_at'] ?? null) && in_array($row['state'] ?? '', ['BUSY', 'IDLE', 'UNHEALTHY'], true))
                ->map(fn (array $row): array => $row['integrations'][$source] ?? [])
                ->filter(fn (array $row): bool => $this->fresh($row['observed_at'] ?? null, config('control-center.integration_fresh_seconds')) && in_array($row['state'] ?? '', ['HEALTHY', 'UNHEALTHY', 'PAUSED'], true));
            $state = $checks->isEmpty() ? 'UNKNOWN' : ($checks->every(fn (array $row): bool => $row['state'] === 'HEALTHY') ? 'HEALTHY' : ($checks->every(fn (array $row): bool => $row['state'] === 'UNHEALTHY') ? 'UNHEALTHY' : 'DEGRADED'));
            $hosts = $checks->map(fn (array $row): ?string => $this->apexHost($row['endpoint'] ?? null))->filter()->unique();
            $failovers = $node->flatMap(fn (array $row): array => $row['failovers'] ?? [])->filter(fn (array $row): bool => $this->recent($row['observed_at'] ?? null))->take(20)->map(fn (array $row): array => ['observed_at' => $this->date($row['observed_at'] ?? null), 'from' => $this->apexHost($row['from'] ?? null), 'to' => $this->apexHost($row['to'] ?? null)])->all();

            return ['name' => $name, 'state' => $state, 'source' => $source, 'sample_count' => $sample->count(),
                'observed_at' => $checks->max('observed_at'), 'evidence' => $checks->isEmpty() ? 'Belum ada pemeriksaan sesi yang masih berlaku; heartbeat proses saja tidak membuktikan koneksi.' : 'Pemeriksaan sesi oleh worker; waktu pemeriksaan tidak diperbarui oleh heartbeat.',
                'last_success' => $this->date($success?->completed_at), 'last_failure' => $this->date($failure?->updated_at),
                'error' => $failure ? $this->telemetry->error($failure->error_message) : null,
                'duration_ms' => $success?->started_at && $success->completed_at ? max(0, (int) CarbonImmutable::parse($success->started_at)->diffInMilliseconds(CarbonImmutable::parse($success->completed_at))) : null,
                'endpoint' => $source === 'apex' && $hosts->count() === 1 ? $hosts->first() : null, 'recorded_endpoint' => $source === 'apex' ? ($endpoints[0]['host'] ?? null) : null,
                'failovers' => $failovers, 'source_freshness_at' => $this->date($success?->completed_at), 'recent_failures' => $sample->filter(fn ($row): bool => in_array($row->status, ['FAILED', 'NEEDS_ATTENTION'], true) && $this->recent($row->updated_at))->count()];
        })->values()->all());
    }

    /**
     * @param  list<array<string, mixed>>  $pipelines
     * @return list<array<string, mixed>>
     *
     * @phpstan-impure
     */
    private function diagnostics(array $pipelines): array
    {
        $rows = collect($pipelines)->filter(fn (array $row): bool => $row['error'] !== null && $this->recent($row['observed_at']))->map(fn (array $row): array => [
            'id' => $row['id'], 'correlation_id' => $row['id'], 'source' => $row['name'], 'observed_at' => $row['observed_at'],
            'kind' => str_starts_with($row['id'], 'attempt:') || $row['stage'] === 'RETRY_WAIT' ? 'FAILED_ATTEMPT' : ($row['has_error_evidence'] ? 'FAILED_RUN' : 'ATTENTION'),
            'attempt' => $row['attempts'], 'exception_type' => $row['exception_type'] ?? null, ...$row['error'],
        ])->values()->all();
        $failed = $this->attempt('failed_job_details', fn () => DB::connection(config('queue.failed.database'))->table(config('queue.failed.table'))->select(['id', 'queue', 'failed_at'])->selectRaw('SUBSTR(exception, 1, 512) as error_prefix')->orderByDesc('id')->limit(50)->get());
        foreach ($failed ?? [] as $row) {
            if ($this->recent($row->failed_at)) {
                preg_match('/^([A-Za-z0-9_\\\\]+)(?=:)/', $row->error_prefix, $type);
                $rows[] = ['id' => 'failed-job:'.$row->id, 'correlation_id' => 'failed-job:'.$row->id, 'source' => 'Queue '.$this->identifier($row->queue), 'kind' => 'FAILED_JOB', 'attempt' => null, 'exception_type' => isset($type[1]) ? class_basename($type[1]) : null, 'observed_at' => $this->date($row->failed_at), ...$this->telemetry->error($row->error_prefix)];
            }
        }
        $seen = [];
        foreach ($this->telemetry->read('errors') as $file) {
            foreach ($file['errors'] ?? [] as $index => $error) {
                if (! $this->recent($error['observed_at'] ?? null)) {
                    continue;
                }
                $eventId = $this->identifier($error['event_id'] ?? null) ?? substr(hash('sha256', json_encode([$file['observed_at'], $index], JSON_THROW_ON_ERROR)), 0, 16);
                if (isset($seen[$eventId])) {
                    continue;
                }
                $seen[$eventId] = true;
                $correlation = isset($error['report_id']) ? 'report:'.(int) $error['report_id'] : $this->identifier($error['correlation_id'] ?? null);
                $rows[] = ['id' => $correlation ?? 'exception:'.$eventId, 'correlation_id' => $correlation, 'source' => $this->identifier($error['component'] ?? null) ?? 'Application', 'kind' => 'ERROR_EVENT',
                    'exception_type' => $this->identifier($error['exception_class'] ?? null), 'attempt' => is_numeric($error['attempt'] ?? null) ? (int) $error['attempt'] : null,
                    'fingerprint' => isset($error['fingerprint']) && preg_match('/^[a-f0-9]{16}$/D', $error['fingerprint']) ? $error['fingerprint'] : null,
                    'observed_at' => $this->date($error['observed_at']), ...$this->telemetry->error(($error['code'] ?? '').':')];
            }
        }
        $groups = [];
        foreach ($rows as $row) {
            $fingerprint = $row['fingerprint'] ?? substr(hash('sha256', json_encode([$row['source'], $row['exception_type'], $row['code']], JSON_THROW_ON_ERROR)), 0, 16);
            $incident = substr(hash('sha256', json_encode([$row['source'], $fingerprint, $row['correlation_id']], JSON_THROW_ON_ERROR)), 0, 16);
            $key = $incident.':'.$row['kind'];
            if (! isset($groups[$key])) {
                $groups[$key] = [...$row, 'fingerprint' => $fingerprint, 'incident_key' => $incident, 'occurrences' => 0, 'first_at' => $row['observed_at'], 'last_at' => $row['observed_at'], 'attempts' => []];
            }
            $groups[$key]['occurrences']++;
            $groups[$key]['first_at'] = min($groups[$key]['first_at'], $row['observed_at']);
            $groups[$key]['last_at'] = max($groups[$key]['last_at'], $row['observed_at']);
            $groups[$key]['observed_at'] = $groups[$key]['last_at'];
            if ($row['attempt'] !== null) {
                $groups[$key]['attempts'] = array_values(array_unique([...$groups[$key]['attempts'], $row['attempt']]));
            }
        }
        $rows = array_values($groups);
        usort($rows, fn (array $a, array $b): int => strcmp($b['observed_at'] ?? '', $a['observed_at'] ?? ''));

        return $rows;
    }

    /**
     * @param  list<array<string, mixed>>  $workers
     * @param  list<array<string, mixed>>  $pipelines
     * @param  list<array<string, mixed>>  $scheduler
     * @param  list<array<string, mixed>>  $integrations
     * @return list<array<string, mixed>>
     */
    private function services(array $workers, array $pipelines, array $scheduler, array $integrations, bool $databaseAvailable, array $hosts): array
    {
        $definitions = [
            ['Web application', 'Laravel / Inertia', null], ['Database', DB::connection()->getDriverName(), null],
            ['PHP queues', 'PHP queue', null], ['Scheduler', 'PHP schedule', null],
            ['APEX JNE CCC', 'Node APEX', 'Report APEX'], ['Hybrid PM', 'Node Hybrid', 'Report ROBERTO'], ['Hybrid Puman', 'Node Hybrid', 'Report NURALAMT'],
            ['Cashless entry', 'Node Hybrid', 'Cashless entry'], ['CSV import', 'PHP queue', 'CSV import'], ['Customer mapping', 'PHP queue', 'Customer mapping'],
            ['Rekonsiliasi & kompilasi', 'PHP queue', 'Rekonsiliasi pickup'], ['Dokumen AWB', 'PHP queue', 'Dokumen AWB'],
            ['SMTP email', 'PHP queue', 'Email'], ['FCM push', 'PHP queue', 'Push'],
            ['Infrastructure / CPU / RAM / disk', $hosts === [] ? 'Not Instrumented' : 'Host agent', null],
            ['Cache / locks', 'Not Instrumented', null],
            ['CLI import & maintenance', 'PHP CLI', 'CLI import & maintenance'],
        ];

        $queueDependencies = [
            'PHP queues' => ['default', 'reconciliation', 'documents', 'deliveries', 'mobile-push'],
            'CSV import' => ['default'], 'Customer mapping' => ['default'],
            'Rekonsiliasi & kompilasi' => ['reconciliation'], 'Dokumen AWB' => ['documents'],
            'SMTP email' => ['deliveries'], 'FCM push' => ['mobile-push'],
        ];

        return array_values(array_map(function (array $definition) use ($workers, $pipelines, $scheduler, $integrations, $queueDependencies, $databaseAvailable, $hosts): array {
            [$name, $runtime, $prefix] = $definition;
            $sample = collect($pipelines)->filter(fn (array $row): bool => $prefix !== null && (str_starts_with($row['name'], $prefix) || ($name === 'Rekonsiliasi & kompilasi' && str_starts_with($row['name'], 'Kompilasi customer'))));
            $freshWorker = collect($workers)->filter(fn (array $row): bool => $row['runtime'] === $runtime && ! $row['stale']);
            $state = 'UNKNOWN';
            $evidence = $runtime === 'Not Instrumented' ? 'Belum diinstrumentasi; tidak ada pengukuran langsung.' : 'Heartbeat runtime belum tersedia atau kedaluwarsa.';
            $observed = $freshWorker->max('observed_at');
            if ($name === 'Infrastructure / CPU / RAM / disk' && $hosts !== []) {
                $state = collect($hosts)->contains('stale', true) ? 'UNKNOWN' : (collect($hosts)->contains('state', 'DEGRADED') ? 'DEGRADED' : 'HEALTHY');
                $observed = collect($hosts)->max('observed_at');
                $evidence = 'Pengukuran OS melalui agent worker setiap 15 detik. Disk mencakup volume penyimpanan telemetry; heartbeat terlambat bukan bukti server mati.';
            } elseif ($name === 'Web application') {
                $state = 'HEALTHY';
                $evidence = 'Request halaman ini berhasil dilayani.';
                $observed = now()->toIso8601String();
            } elseif ($name === 'Database') {
                $state = $databaseAvailable ? 'HEALTHY' : 'UNKNOWN';
                $evidence = $databaseAvailable ? 'SELECT 1 berhasil pada koneksi aplikasi; cakupan sumber diperiksa terpisah.' : 'Probe database tidak tersedia; periksa diagnostik sumber.';
                $observed = now()->toIso8601String();
            } elseif (isset($queueDependencies[$name])) {
                $required = $queueDependencies[$name];
                $freshWorker = $freshWorker->filter(fn (array $row): bool => ($row['connection'] ?? null) === config('queue.default') && array_intersect($required, explode(',', $row['queue'] ?? '')) !== []);
                $available = $freshWorker->filter(fn (array $row): bool => in_array($row['state'], ['BUSY', 'IDLE'], true));
                $missing = array_filter($required, fn (string $queue): bool => ! $available->contains(fn (array $row): bool => in_array($queue, explode(',', $row['queue'] ?? ''), true)));
                $state = $missing === [] ? 'HEALTHY' : ($available->isNotEmpty() ? 'DEGRADED' : ($freshWorker->contains(fn (array $row): bool => in_array($row['state'], ['UNHEALTHY', 'STOPPED'], true)) ? 'UNHEALTHY' : 'UNKNOWN'));
                $evidence = $state === 'HEALTHY' ? 'Worker aktif melayani queue '.implode(', ', $required).'; bukan jaminan hasil setiap job.' : 'Queue belum memiliki cakupan worker sehat: '.implode(', ', $missing).'.';
                $observed = $freshWorker->max('observed_at');
                if ($state === 'HEALTHY' && $freshWorker->contains('state', 'UNHEALTHY')) {
                    $state = 'DEGRADED';
                    $evidence .= ' Sebagian worker melaporkan error.';
                }
            } elseif ($name === 'Scheduler') {
                $observed = collect($scheduler)->max('observed_at');
                $known = collect($scheduler)->where('state', '!=', 'UNKNOWN');
                $state = $known->isEmpty() ? 'UNKNOWN' : ($known->count() !== count($scheduler) ? 'DEGRADED' : 'HEALTHY');
                $evidence = 'Event scheduler dibandingkan jadwal cron berikutnya + toleransi '.config('control-center.fresh_seconds').' detik; SKIPPED bukan kegagalan.';
            } elseif (in_array($runtime, ['Node APEX', 'Node Hybrid'], true)) {
                $available = $freshWorker->whereIn('state', ['BUSY', 'IDLE']);
                $state = $available->isNotEmpty() ? 'HEALTHY' : ($freshWorker->contains(fn (array $row): bool => in_array($row['state'], ['UNHEALTHY', 'STOPPED'], true)) ? 'UNHEALTHY' : 'UNKNOWN');
                $evidence = 'Heartbeat worker; status proses dipisahkan dari pemeriksaan sesi JNE.';
                if ($state === 'UNKNOWN') {
                    $evidence = 'Belum ada heartbeat Node atau komunikasi API worker yang masih berlaku; bukan bukti worker mati.';
                }
                if ($state === 'HEALTHY' && $freshWorker->contains('state', 'UNHEALTHY')) {
                    $state = 'DEGRADED';
                }
                if ($name === 'APEX JNE CCC' && $state === 'HEALTHY') {
                    foreach (array_keys(ReportJob::apexWorkerSlots()) as $slot) {
                        if (! $available->contains(fn (array $row): bool => str_starts_with($row['identity'] ?? '', $slot.':'))) {
                            $state = 'DEGRADED';
                            $evidence .= ' Belum semua instance APEX memiliki heartbeat sehat.';
                            break;
                        }
                    }
                }
            }
            $recentFailures = $sample->filter(fn (array $row): bool => in_array($row['outcome'], ['FAILED', 'ATTENTION', 'FAILED_ATTEMPT'], true) && $this->recent($row['observed_at']));
            $latestOutcome = $sample->filter(fn (array $row): bool => $this->recent($row['observed_at']) && in_array($row['outcome'], ['SUCCESS', 'FAILED', 'ATTENTION', 'FAILED_ATTEMPT'], true))->sortByDesc('observed_at')->first();
            $execution = $latestOutcome === null ? 'UNKNOWN' : (in_array($latestOutcome['outcome'], ['FAILED', 'ATTENTION', 'FAILED_ATTEMPT'], true) ? 'NEEDS_ATTENTION' : 'HEALTHY');
            if ($name === 'Scheduler') {
                $recentFailures = collect($scheduler)->filter(fn (array $row): bool => $this->recent($row['last_failure']) || ($row['last_state'] === 'FAILED' && $this->recent($row['observed_at'])));
                $unresolved = $recentFailures->contains(fn (array $row): bool => $row['last_success'] === null || strcmp($row['last_failure'] ?? $row['observed_at'], $row['last_success']) > 0);
                $executionObserved = max(collect($scheduler)->max('last_failure') ?? '', collect($scheduler)->max('last_success') ?? '') ?: null;
                $execution = $unresolved ? 'NEEDS_ATTENTION' : ($this->recent($executionObserved) ? 'HEALTHY' : 'UNKNOWN');
                $latestOutcome = ['observed_at' => $executionObserved];
            }
            $integration = collect($integrations)->firstWhere('name', $name);

            return ['name' => $name, 'runtime' => $runtime, 'state' => $state, 'runtime_state' => $state, 'readiness_state' => $integration['state'] ?? 'UNKNOWN', 'readiness_observed_at' => $integration['observed_at'] ?? null, 'execution_state' => $execution, 'execution_observed_at' => $latestOutcome['observed_at'] ?? null, 'recent_failures' => $recentFailures->count(), 'coverage' => in_array($name, ['Web application', 'Database'], true) ? 'VERIFIED' : ($runtime === 'Not Instrumented' ? 'UNAVAILABLE' : 'PARTIAL'),
                'observed_at' => $observed, 'evidence' => $evidence,
                'last_success' => $name === 'Scheduler' ? collect($scheduler)->max('last_success') : $sample->where('outcome', 'SUCCESS')->max('finished_at'), 'last_failure' => $name === 'Scheduler' ? collect($scheduler)->max('last_failure') : $sample->whereIn('outcome', ['FAILED', 'ATTENTION'])->max('observed_at'),
                'error' => $sample->whereIn('outcome', ['FAILED', 'ATTENTION'])->sortByDesc('observed_at')->first()['error'] ?? null];
        }, $definitions));
    }

    /** @phpstan-impure */
    private function attempt(string $source, callable $callback): mixed
    {
        $started = hrtime(true);
        try {
            $result = $callback();
            $this->sourceDiagnostics[] = ['source' => $source, 'state' => 'HEALTHY', 'observed_at' => now()->toIso8601String(), 'duration_ms' => round((hrtime(true) - $started) / 1e6, 1), 'exception_type' => null, 'sqlstate' => null, 'driver_code' => null, 'category' => null];

            return $result;
        } catch (Throwable $exception) {
            $this->unavailable[] = $source;
            $sqlstate = $exception instanceof QueryException ? (string) ($exception->errorInfo[0] ?? '') : null;
            $driverCode = $exception instanceof QueryException ? (int) ($exception->errorInfo[1] ?? 0) : null;
            $category = match (true) {
                $driverCode === 1064 => 'SQL_SYNTAX',
                in_array($driverCode, [1142, 1044, 1045], true) => 'PERMISSION_DENIED',
                in_array($driverCode, [3024, 1205], true) || $sqlstate === 'HYT00' => 'QUERY_TIMEOUT',
                in_array($sqlstate, ['42S02', '42S22'], true) => 'SCHEMA_MISMATCH',
                str_starts_with($sqlstate ?? '', '08') => 'CONNECTION_UNAVAILABLE',
                default => 'SOURCE_UNAVAILABLE',
            };
            $this->sourceDiagnostics[] = ['source' => $source, 'state' => 'UNKNOWN', 'observed_at' => now()->toIso8601String(), 'duration_ms' => round((hrtime(true) - $started) / 1e6, 1), 'exception_type' => class_basename($exception), 'sqlstate' => preg_match('/^[A-Z0-9]{5}$/D', $sqlstate ?? '') ? $sqlstate : null, 'driver_code' => $driverCode, 'category' => $category];

            return null;
        }
    }

    /** @return list<array<string, mixed>> */
    private function commands(): array
    {
        return array_values(collect($this->telemetry->read('commands'))->filter(fn (array $row): bool => in_array($row['name'] ?? null, config('control-center.command_names'), true))->map(fn (array $row): array => [
            'name' => $row['name'], 'state' => $this->identifier($row['state'] ?? null), 'observed_at' => $this->date($row['observed_at'] ?? null),
            'started_at' => $this->date($row['started_at'] ?? null), 'duration_ms' => is_numeric($row['duration_ms'] ?? null) ? max(0, (int) $row['duration_ms']) : null,
            'exit_code' => is_numeric($row['exit_code'] ?? null) ? (int) $row['exit_code'] : null,
        ])->values()->all());
    }

    /**
     * @return array<string, mixed>
     *
     * @phpstan-impure
     */
    private function instrumentation(): array
    {
        $free = @disk_free_space(storage_path());
        $total = @disk_total_space(storage_path());
        $load = function_exists('sys_getloadavg') ? sys_getloadavg() : false;
        $this->attempt('cache_read', fn () => Cache::store()->get('__operations_monitor_read_probe__'));
        $cacheAvailable = ! in_array('cache_read', $this->unavailable, true);

        return ['observed_at' => now()->toIso8601String(), 'scope' => 'Monitoring PHP runtime / storage volume only',
            'host' => substr(hash('sha256', gethostname() ?: 'local'), 0, 8), 'load_1m' => $load === false ? null : $load[0], 'cpu_percent' => null, 'host_ram_bytes' => null,
            'php_memory_bytes' => memory_get_usage(true), 'disk_free_bytes' => $free === false ? null : $free, 'disk_total_bytes' => $total === false ? null : $total,
            'cache_store' => $this->identifier(config('cache.default')), 'cache_read_state' => $cacheAvailable ? 'HEALTHY' : 'UNKNOWN',
            'locks_state' => 'UNKNOWN', 'cache_evidence' => 'Read-only lookup of a dedicated monitoring key; no lock acquisition, writes, or business keys. Read success does not verify distributed locks.',
        ];
    }

    private function date(?string $value): ?string
    {
        try {
            return $value ? CarbonImmutable::parse($value)->utc()->toIso8601String() : null;
        } catch (Throwable) {
            return null;
        }
    }

    private function recent(?string $value): bool
    {
        $date = $this->date($value);

        return $date !== null && CarbonImmutable::parse($date)->between(now()->subDay(), now());
    }

    private function fresh(?string $value, ?int $seconds = null): bool
    {
        $date = $this->date($value);

        return $date !== null && CarbonImmutable::parse($date)->between(now()->subSeconds($seconds ?? config('control-center.fresh_seconds')), now());
    }

    private function identifier(?string $value): ?string
    {
        return $value !== null && preg_match('/^[a-zA-Z0-9_ :.,\\\\\/\-]{1,150}$/D', $value) ? $value : null;
    }

    private function apexHost(?string $value): ?string
    {
        return $value !== null && preg_match('/^dash-ccc[0-9]+\.jne\.co\.id$/D', $value) ? $value : null;
    }

    /** @param Collection<int, mixed> $values */
    private function percentile(Collection $values, float $percentile): ?int
    {
        return $values->count() < 5 ? null : (int) $values[(int) ceil($values->count() * $percentile) - 1];
    }
}
