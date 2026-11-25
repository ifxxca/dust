<?php

use App\Actions\Monitoring\OperationsTelemetry;
use App\Actions\Monitoring\QueryItControlCenter;
use App\Actions\Monitoring\QueryServerHeartbeats;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Str;

function serverHeartbeatFixture(array $overrides = []): array
{
    return ['host' => 'abcd1234', 'platform' => 'win32', 'observed_at' => now()->toIso8601String(),
        'cpu_percent' => 24.5, 'cpu_count' => 8, 'memory_total_bytes' => 1000, 'memory_free_bytes' => 400,
        'disk_total_bytes' => 10000, 'disk_free_bytes' => 8000, 'uptime_seconds' => 12345, 'history' => [], ...$overrides];
}

test('host dashboard uses the newest actual measurement across workers and excludes private fields', function () {
    $this->freezeTime();
    $query = app(QueryServerHeartbeats::class);
    $observations = [
        ['host_metrics' => serverHeartbeatFixture(['observed_at' => now()->subSeconds(30)->toIso8601String(), 'cpu_percent' => 99])],
        ['host_metrics' => serverHeartbeatFixture(['password' => 'PRIVATE_SECRET', 'history' => [['observed_at' => now()->toIso8601String(), 'cpu_percent' => 24.5, 'memory_percent' => 60, 'secret' => 'PRIVATE_SECRET']]])],
    ];
    $workers = [['host' => 'abcd1234', 'stale' => false, 'state' => 'BUSY'], ['host' => 'abcd1234', 'stale' => true, 'state' => 'UNKNOWN']];

    $rows = $query->handle($observations, $workers);

    expect($rows)->toHaveCount(1);
    expect($rows[0])->toMatchArray(['state' => 'HEALTHY', 'cpu_percent' => 24.5, 'memory_percent' => 60.0, 'disk_percent' => 20.0, 'workers_online' => 1, 'stale' => false]);
    expect(json_encode($rows))->not->toContain('PRIVATE_SECRET', 'password', 'secret');
});

test('missed host heartbeat keeps the old measurement but cannot report online or fresh resource alarms', function () {
    $this->freezeTime();
    $rows = app(QueryServerHeartbeats::class)->handle([['host_metrics' => serverHeartbeatFixture(['observed_at' => now()->subSeconds(121)->toIso8601String(), 'cpu_percent' => 99])]], []);
    expect($rows[0])->toMatchArray(['state' => 'STALE', 'cpu_percent' => 99, 'stale' => true, 'age_seconds' => 121, 'warnings' => []]);
});

test('invalid host measurements stay unmeasured and cannot become fake zeros', function () {
    $this->freezeTime();
    $query = app(QueryServerHeartbeats::class);
    expect($query->handle([['host_metrics' => serverHeartbeatFixture(['host' => '<script>'])]], []))->toBe([]);
    expect($query->handle([['host_metrics' => serverHeartbeatFixture(['observed_at' => now()->addMinute()->toIso8601String()])]], []))->toBe([]);
    $rows = $query->handle([['host_metrics' => serverHeartbeatFixture(['cpu_percent' => 101, 'memory_free_bytes' => -1, 'disk_free_bytes' => 20000])]], []);
    expect($rows[0])->toMatchArray(['cpu_percent' => null, 'memory_percent' => null, 'disk_percent' => null]);
});

test('server heartbeat integration reports pressure and becomes unknown when measurement expires without changing queues', function () {
    $this->freezeTime();
    $directory = storage_path('framework/testing/server-heartbeat-'.Str::uuid());
    config(['control-center.path' => $directory, 'control-center.enabled' => true]);
    try {
        app(OperationsTelemetry::class)->write('workers', 'node:abcd1234:42', ['identity' => 'node:abcd1234:42', 'runtime' => 'Node APEX', 'state' => 'IDLE', 'observed_at' => now()->toIso8601String(), 'host_metrics' => serverHeartbeatFixture(['memory_free_bytes' => 50])]);
        $data = app(QueryItControlCenter::class)->handle();
        expect($data['hosts'][0]['warnings'])->toBe(['RAM terpakai ≥90%']);
        expect(collect($data['services'])->firstWhere('name', 'Infrastructure / CPU / RAM / disk'))->toMatchArray(['runtime' => 'Host agent', 'state' => 'DEGRADED']);
        $this->travel(121)->seconds();
        $stale = app(QueryItControlCenter::class)->handle();
        expect($stale['hosts'][0]['stale'])->toBeTrue();
        expect(collect($stale['services'])->firstWhere('name', 'Infrastructure / CPU / RAM / disk')['state'])->toBe('UNKNOWN');
        $this->assertDatabaseCount('jobs', 0);
    } finally {
        File::deleteDirectory($directory);
    }
});
