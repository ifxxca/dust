<?php

use App\Actions\Reports\ImportReportAwbs;
use App\Actions\Reports\ProjectJneShipments;
use App\Actions\Reports\QueueScheduledJneReports;
use App\Jobs\ImportJneReportAwbs;
use App\Models\JneReportProfile;
use App\Models\ReportJob;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;

test('unexpected report failures retain safe diagnostics and existing business states', function (string $phase) {
    $job = ReportJob::factory()->create(['import_status' => $phase === 'projection' ? 'IMPORTED' : 'QUEUED', 'projection_status' => 'QUEUED']);
    $secret = 'token=private-token raw_csv=private-customer,password';
    $exception = new RuntimeException($secret, previous: new LogicException($secret));
    $importer = Mockery::mock(ImportReportAwbs::class);
    $projector = Mockery::mock(ProjectJneShipments::class);
    if ($phase === 'import') {
        $importer->shouldReceive('handle')->once()->with($job->id)->andThrow($exception);
        $projector->shouldNotReceive('handle');
    } else {
        $importer->shouldReceive('handle')->once()->with($job->id);
        $projector->shouldReceive('handle')->once()->with($job->id)->andThrow($exception);
    }
    Log::spy();

    (new ImportJneReportAwbs($job->id))->handle($importer, $projector);

    $job->refresh();
    expect($job->import_status)->toBe($phase === 'import' ? 'FAILED' : 'IMPORTED');
    expect($job->projection_status)->toBe($phase === 'import' ? 'QUEUED' : 'FAILED');
    expect($job->import_error ?? $job->projection_error)->not->toContain('private');
    Log::shouldHaveReceived('error')->once()->with('JNE report pipeline failed.', Mockery::on(function (array $context) use ($phase, $job): bool {
        expect($context['phase'])->toBe($phase);
        expect($context['report_job_id'])->toBe($job->id);
        expect($context['exception_class'])->toBe(RuntimeException::class);
        expect($context['previous_exception_class'])->toBe(LogicException::class);
        expect($context['file'])->toBe(__FILE__);
        expect($context['trace'])->not->toBeEmpty();
        expect(json_encode($context))->not->toContain('private-token', 'private-customer', 'password', 'raw_csv', 'args');

        return true;
    }));
})->with(['import', 'projection']);

test('scheduler failures retain profile correlation without leaking exception data or retrying', function () {
    $profile = JneReportProfile::factory()->create(['enabled' => true, 'next_run_at' => now()->subMinute()]);
    $scheduler = Mockery::mock(QueueScheduledJneReports::class)->makePartial();
    $scheduler->shouldReceive('queueProfile')->once()->with($profile->id)->andThrow(new RuntimeException('password=private-token'));
    Log::spy();

    expect($scheduler->handle())->toBe(0);

    expect($profile->fresh()->last_error)->toBe('Gagal membuat antrean report. Periksa konfigurasi dan database.');
    $this->assertDatabaseCount('report_jobs', 0);
    Log::shouldHaveReceived('error')->once()->with('JNE report pipeline failed.', Mockery::on(function (array $context) use ($profile): bool {
        expect($context['phase'])->toBe('queue_profile');
        expect($context['profile_id'])->toBe($profile->id);
        expect($context['exception_class'])->toBe(RuntimeException::class);
        expect(json_encode($context))->not->toContain('private-token', 'password');

        return true;
    }));
});

test('known import validation failures keep the public field error without unexpected diagnostics', function () {
    $job = ReportJob::factory()->create(['import_status' => 'QUEUED']);
    $importer = Mockery::mock(ImportReportAwbs::class);
    $importer->shouldReceive('handle')->once()->andThrow(ValidationException::withMessages(['import' => 'Checksum CSV berubah.']));
    $projector = Mockery::mock(ProjectJneShipments::class);
    $projector->shouldNotReceive('handle');
    Log::spy();

    (new ImportJneReportAwbs($job->id))->handle($importer, $projector);

    expect($job->fresh()->import_error)->toBe('Checksum CSV berubah.');
    Log::shouldNotHaveReceived('error');
});

test('terminal worker failure retains redacted diagnostics without resetting completed import evidence', function () {
    $job = ReportJob::factory()->create(['import_status' => 'IMPORTED', 'projection_status' => 'QUEUED', 'imported_awb_count' => 4]);
    Log::spy();

    (new ImportJneReportAwbs($job->id))->failed(new RuntimeException('password=private-token'));

    expect($job->fresh()->import_status)->toBe('IMPORTED');
    expect($job->fresh()->imported_awb_count)->toBe(4);
    expect($job->fresh()->projection_status)->toBe('FAILED');
    Log::shouldHaveReceived('error')->once()->with('JNE report pipeline failed.', Mockery::on(function (array $context) use ($job): bool {
        expect($context['phase'])->toBe('worker_failure');
        expect($context['report_job_id'])->toBe($job->id);
        expect(json_encode($context))->not->toContain('password', 'private-token');

        return true;
    }));
});
