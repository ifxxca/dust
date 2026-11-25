<?php

use App\Actions\Monitoring\OperationsTelemetry;
use App\Models\ReportJob;
use Illuminate\Support\Facades\DB;

require __DIR__.'/ui-ux-browser.php';

$telemetryDirectory = getenv('CONTROL_CENTER_PATH');
if (! $telemetryDirectory || ! str_starts_with(strtolower(str_replace('\\', '/', $telemetryDirectory)), strtolower(str_replace('\\', '/', $outputRoot)).'/it-control-center-')) {
    throw new RuntimeException('Use a dedicated telemetry directory within output.');
}
config(['control-center.path' => $telemetryDirectory, 'control-center.enabled' => true]);
app(OperationsTelemetry::class)->write('workers', 'fixture-host:abcd1234:123', ['identity' => 'fixture-host:abcd1234:123', 'runtime' => 'Node APEX', 'state' => 'IDLE', 'observed_at' => now()->toIso8601String(), 'host_metrics' => [
    'host' => 'abcd1234', 'platform' => 'win32', 'observed_at' => now()->toIso8601String(), 'cpu_percent' => 24.5, 'cpu_count' => 8,
    'memory_total_bytes' => 32 * 1024 ** 3, 'memory_free_bytes' => 12 * 1024 ** 3,
    'disk_total_bytes' => 1000 * 1024 ** 3, 'disk_free_bytes' => 620 * 1024 ** 3, 'uptime_seconds' => 194400,
    'history' => array_map(fn (int $index): array => ['observed_at' => now()->subSeconds((20 - $index) * 15)->toIso8601String(), 'cpu_percent' => 12 + ($index * 13 % 55), 'memory_percent' => 62.5], range(1, 20)),
]]);
foreach (['BUSY', 'IDLE', 'STOPPED', 'UNHEALTHY', 'UNKNOWN'] as $index => $state) {
    app(OperationsTelemetry::class)->write('workers', 'fixture-'.$index, ['identity' => 'fixture-'.$index, 'runtime' => 'PHP queue', 'queue' => 'default', 'connection' => 'database', 'state' => $state, 'observed_at' => now()->toIso8601String(), 'job' => 'ImportJneReportAwbs', 'job_id' => '123', 'timeout' => 75]);
}
app(OperationsTelemetry::class)->write('workers', 'fixture-retired', ['identity' => 'fixture-retired', 'runtime' => 'PHP queue', 'queue' => 'default', 'state' => 'STOPPED', 'observed_at' => now()->subMinutes(10)->toIso8601String()]);
ReportJob::factory()->create(['status' => 'WAITING_REPORT', 'started_at' => now()->subMinutes(2), 'lease_expires_at' => now()->addMinute(), 'worker_id' => 'fixture-apex']);
ReportJob::factory()->create(['status' => 'COMPLETED', 'started_at' => now()->subMinutes(5), 'completed_at' => now()->subMinute(), 'import_status' => 'IMPORTED', 'projection_status' => 'PROJECTED', 'imported_awb_count' => 34, 'duplicate_awb_count' => 2]);
for ($index = 0; $index < 25; $index++) {
    ReportJob::factory()->create(['status' => 'NEEDS_ATTENTION', 'error_message' => $index % 2 ? 'FORM_VALUE: PRIVATE_DIAGNOSTIC_SECRET' : 'REPORT_TIMEOUT: PRIVATE_DIAGNOSTIC_SECRET']);
}
DB::table('jobs')->insert(['queue' => 'default', 'payload' => '{}', 'attempts' => 0, 'reserved_at' => null, 'available_at' => now()->timestamp + 3600, 'created_at' => now()->timestamp]);
echo PHP_EOL.'IT Control Center isolated representative fixture ready.'.PHP_EOL;
