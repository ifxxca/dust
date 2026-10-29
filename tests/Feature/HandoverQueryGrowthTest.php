<?php

use App\Actions\Handover\AmendSession;
use App\Actions\Handover\CreateSession;
use App\Models\PickupRecord;
use App\Models\PickupTask;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

test('handover relationship SELECTs stay bounded for bulk selections', function (int $size, string $operation) {
    $actor = User::factory()->create(['role' => 'admin_supervisor']);
    $tasks = PickupTask::factory()->count($size)->has(PickupRecord::factory(), 'proof')->create(['status' => 'PICKED_UP']);
    $key = (string) Str::uuid();
    $session = $operation === 'amend' ? app(CreateSession::class)->handle($actor, [$tasks->first()->id], $key) : null;
    DB::flushQueryLog();
    DB::enableQueryLog();
    $started = hrtime(true);
    memory_reset_peak_usage();

    try {
        $result = $session
            ? app(AmendSession::class)->handle($actor, $session->id, 1, 'Tambah anggota', $tasks->modelKeys())
            : app(CreateSession::class)->handle($actor, $tasks->modelKeys(), $key);
        $selects = count(array_filter(DB::getQueryLog(), fn (array $entry): bool => preg_match('/^select .*\bfrom ["`]*(users|pickup_tasks|pickup_records|handover_items|handover_sessions)\b/is', $entry['query']) === 1));
        $queryCount = count(DB::getQueryLog());
        $duration = (hrtime(true) - $started) / 1e6;
    } finally {
        DB::disableQueryLog();
        DB::flushQueryLog();
    }

    expect($selects)->toBeLessThanOrEqual(6);
    if (getenv('HARDENING_METRICS') === '1') {
        fwrite(STDERR, json_encode(['metric' => 'handover_selects', 'engine' => DB::getDriverName(), 'operation' => $operation, 'size' => $size, 'selects' => $selects, 'queries' => $queryCount, 'duration_ms' => round($duration, 2), 'peak_php_bytes' => memory_get_peak_usage(true)], JSON_THROW_ON_ERROR).PHP_EOL);
    }
    expect($result->items()->pluck('pickup_task_id')->sort()->values()->all())->toBe($tasks->modelKeys());
    expect($result->items()->count())->toBe($size);
})->with([1, 10, 100])->with(['create', 'amend']);
