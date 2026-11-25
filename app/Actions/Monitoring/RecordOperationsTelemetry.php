<?php

namespace App\Actions\Monitoring;

use Illuminate\Console\Scheduling\Event as ScheduledEvent;
use Illuminate\Contracts\Queue\Job;
use Illuminate\Queue\WorkerOptions;
use Throwable;

class RecordOperationsTelemetry
{
    /** @var array<string, mixed> */
    private array $worker = [];

    /** @var list<array<string, mixed>> */
    private array $runs = [];

    /** @var array<string, array<string, mixed>> */
    private array $schedules = [];

    /** @var list<array<string, mixed>> */
    private array $errors = [];

    private float $jobStarted = 0;

    private float $lastHeartbeat = 0;

    /** @var array<string, array{clock: int|float, started_at: string}> */
    private array $commands = [];

    public function __construct(private OperationsTelemetry $store) {}

    public function worker(string $state, ?string $connection, ?string $queue, ?WorkerOptions $options = null, ?Job $job = null, ?Throwable $exception = null): void
    {
        if (! config('control-center.enabled') || in_array(config('queue.connections.'.$connection.'.driver'), ['sync', 'deferred', 'background', 'null'], true)) {
            return;
        }
        try {
            if ($state === 'IDLE' && microtime(true) - $this->lastHeartbeat < 10 && ($this->worker['state'] ?? '') === 'IDLE' && $job === null) {
                return;
            }
            $this->lastHeartbeat = microtime(true);
            $this->worker = array_replace($this->worker, [
                'identity' => 'php:'.substr(hash('sha256', gethostname() ?: 'local'), 0, 8).':'.getmypid(),
                'runtime' => 'PHP queue', 'pid' => getmypid(), 'state' => $state,
                'observed_at' => now()->toIso8601String(), 'connection' => $connection,
                'queue' => $options === null ? ($this->worker['queue'] ?? $queue) : $queue, 'timeout' => $options->timeout ?? $this->worker['timeout'] ?? null,
                'job' => $job ? class_basename($job->resolveName()) : null,
                'job_id' => $job ? (string) $job->getJobId() : null,
                'attempts' => $job?->attempts(),
                'queue_settings' => ['driver' => config('queue.connections.'.$connection.'.driver'), 'database_connection' => config('queue.connections.'.$connection.'.connection') ?? config('database.default'), 'table' => config('queue.connections.'.$connection.'.table'), 'retry_after' => config('queue.connections.'.$connection.'.retry_after'), 'configuration_cached' => app()->configurationIsCached()],
            ]);
            if ($state === 'BUSY') {
                $this->jobStarted = microtime(true);
                $this->worker['job_started_at'] = now()->toIso8601String();
            } elseif ($job !== null) {
                $duration = $this->jobStarted > 0 ? (int) round((microtime(true) - $this->jobStarted) * 1000) : null;
                $this->runs[] = [
                    'job' => class_basename($job->resolveName()), 'job_id' => (string) $job->getJobId(),
                    'queue' => $queue, 'state' => $exception ? 'FAILED_ATTEMPT' : 'PROCESSED',
                    'attempts' => $job->attempts(), 'observed_at' => now()->toIso8601String(),
                    'started_at' => $this->worker['job_started_at'] ?? null,
                    'duration_ms' => $duration,
                    'wait_ms' => $job->attempts() === 1 && isset($job->payload()['createdAt']) && $duration !== null ? max(0, (int) round((microtime(true) - (float) $job->payload()['createdAt']) * 1000) - $duration) : null,
                    'error' => $exception ? $this->store->exception($exception) : null,
                    'exception_class' => $exception ? class_basename($exception) : null,
                ];
                $this->runs = array_slice($this->runs, -30);
            }
            $this->store->write('workers', $this->worker['identity'], [...$this->worker, 'runs' => $this->runs]);
        } catch (Throwable) {
        }
    }

    public static function scheduleName(ScheduledEvent $task): string
    {
        return trim(preg_replace('/^.*?artisan[\'\"]?\s+/', '', $task->command ?? $task->description ?? 'callback'));
    }

    public function schedule(ScheduledEvent $task, string $state, ?float $runtime = null): void
    {
        try {
            $name = self::scheduleName($task);
            $previous = $this->schedules[$name] ?? collect($this->store->read('schedules'))->firstWhere('identity', $name) ?? [];
            $data = [...$previous, 'identity' => $name, 'state' => $state, 'observed_at' => now()->toIso8601String()];
            if ($state === 'RUNNING') {
                $data['started_at'] = now()->toIso8601String();
            }
            if (in_array($state, ['SUCCESS', 'FAILED'], true)) {
                $data[$state === 'SUCCESS' ? 'last_success' : 'last_failure'] = now()->toIso8601String();
                $data['duration_ms'] = $runtime === null ? null : (int) round($runtime * 1000);
            }
            $this->schedules[$name] = $data;
            $this->store->write('schedules', $name, $data);
        } catch (Throwable) {
        }
    }

    public function exception(Throwable $exception, ?int $reportId = null): void
    {
        try {
            $error = $this->store->exception($exception);
            $this->errors[] = ['event_id' => bin2hex(random_bytes(8)), 'observed_at' => now()->toIso8601String(), 'report_id' => $reportId,
                'component' => $reportId !== null ? 'Report pipeline' : ($this->worker['job'] ?? 'Application'),
                'correlation_id' => isset($this->worker['job_id']) ? 'queue:'.($this->worker['connection'] ?? '').':'.$this->worker['job_id'] : null,
                'attempt' => $this->worker['attempts'] ?? null,
                'fingerprint' => substr(hash('sha256', implode('|', [get_class($exception), $error['code'], $exception->getFile(), $exception->getLine()])), 0, 16),
                'exception_class' => class_basename($exception), ...$error];
            $this->errors = array_slice($this->errors, -20);
            $this->store->write('errors', (gethostname() ?: 'local').':'.getmypid(), ['observed_at' => now()->toIso8601String(), 'errors' => $this->errors]);
        } catch (Throwable) {
        }
    }

    public function command(string $name, ?int $exitCode = null): void
    {
        if (! in_array($name, config('control-center.command_names'), true)) {
            return;
        }
        try {
            if ($exitCode === null) {
                $this->commands[$name] = ['clock' => hrtime(true), 'started_at' => now()->toIso8601String()];
            }
            $started = $this->commands[$name] ?? null;
            $this->store->write('commands', $name, ['name' => $name, 'state' => $exitCode === null ? 'RUNNING' : ($exitCode === 0 ? 'SUCCESS' : 'FAILED'),
                'started_at' => $started['started_at'] ?? null, 'observed_at' => now()->toIso8601String(), 'exit_code' => $exitCode,
                'duration_ms' => $exitCode !== null && $started ? (int) round((hrtime(true) - $started['clock']) / 1e6) : null]);
            if ($exitCode !== null) {
                unset($this->commands[$name]);
            }
        } catch (Throwable) {
        }
    }
}
