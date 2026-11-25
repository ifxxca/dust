<?php

namespace App\Providers;

use App\Actions\Monitoring\RecordOperationsTelemetry;
use Illuminate\Console\Events\CommandFinished;
use Illuminate\Console\Events\CommandStarting;
use Illuminate\Console\Events\ScheduledBackgroundTaskFinished;
use Illuminate\Console\Events\ScheduledTaskFailed;
use Illuminate\Console\Events\ScheduledTaskFinished;
use Illuminate\Console\Events\ScheduledTaskSkipped;
use Illuminate\Console\Events\ScheduledTaskStarting;
use Illuminate\Queue\Events\JobExceptionOccurred;
use Illuminate\Queue\Events\JobProcessed;
use Illuminate\Queue\Events\JobProcessing;
use Illuminate\Queue\Events\Looping;
use Illuminate\Queue\Events\WorkerStopping;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\ServiceProvider;

class OperationsMonitoringServiceProvider extends ServiceProvider
{
    /**
     * Register services.
     */
    public function register(): void
    {
        $this->app->singleton(RecordOperationsTelemetry::class);
    }

    /**
     * Bootstrap services.
     */
    public function boot(): void
    {
        Event::listen(Looping::class, fn (Looping $event) => $this->app->make(RecordOperationsTelemetry::class)->worker('IDLE', $event->connectionName, $event->queue, $event->workerOptions));
        Event::listen(JobProcessing::class, fn (JobProcessing $event) => $this->app->make(RecordOperationsTelemetry::class)->worker('BUSY', $event->connectionName, $event->job->getQueue(), job: $event->job));
        Event::listen(JobProcessed::class, fn (JobProcessed $event) => $this->app->make(RecordOperationsTelemetry::class)->worker('IDLE', $event->connectionName, $event->job->getQueue(), job: $event->job));
        Event::listen(JobExceptionOccurred::class, fn (JobExceptionOccurred $event) => $this->app->make(RecordOperationsTelemetry::class)->worker('IDLE', $event->connectionName, $event->job->getQueue(), job: $event->job, exception: $event->exception));
        Event::listen(WorkerStopping::class, fn (WorkerStopping $event) => $this->app->make(RecordOperationsTelemetry::class)->worker('STOPPED', $event->connectionName, $event->queue, $event->workerOptions));
        Event::listen(ScheduledTaskStarting::class, fn (ScheduledTaskStarting $event) => $this->app->make(RecordOperationsTelemetry::class)->schedule($event->task, 'RUNNING'));
        Event::listen(ScheduledTaskFinished::class, function (ScheduledTaskFinished $event): void {
            if (! $event->task->runInBackground) {
                $this->app->make(RecordOperationsTelemetry::class)->schedule($event->task, $event->task->exitCode === 0 ? 'SUCCESS' : 'FAILED', $event->runtime);
            }
        });
        Event::listen(ScheduledTaskFailed::class, fn (ScheduledTaskFailed $event) => $this->app->make(RecordOperationsTelemetry::class)->schedule($event->task, 'FAILED'));
        Event::listen(ScheduledTaskSkipped::class, fn (ScheduledTaskSkipped $event) => $this->app->make(RecordOperationsTelemetry::class)->schedule($event->task, 'SKIPPED'));
        Event::listen(ScheduledBackgroundTaskFinished::class, fn (ScheduledBackgroundTaskFinished $event) => $this->app->make(RecordOperationsTelemetry::class)->schedule($event->task, $event->task->exitCode === 0 ? 'SUCCESS' : 'FAILED'));
        Event::listen(CommandStarting::class, fn (CommandStarting $event) => $this->app->make(RecordOperationsTelemetry::class)->command($event->command));
        Event::listen(CommandFinished::class, fn (CommandFinished $event) => $this->app->make(RecordOperationsTelemetry::class)->command($event->command, $event->exitCode));
    }
}
