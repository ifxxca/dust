<?php

use App\Actions\Pickup\PickupAwbEligibility;
use App\Models\JneReportAwb;
use App\Models\JneShipment;
use App\Models\PickupRecord;
use App\Models\PickupTask;
use Carbon\CarbonImmutable;
use Illuminate\Database\Events\QueryExecuted;
use Illuminate\Support\Facades\DB;

test('operational day eligibility loads missing evidence once and preserves the five am boundary', function (string $entry, bool $sameDay) {
    $task = PickupTask::factory()->has(PickupRecord::factory(['picked_up_at' => CarbonImmutable::parse('2026-10-29 05:00:00', 'Asia/Jakarta')->utc()]), 'proof')->create();
    $source = JneReportAwb::factory()->create(['entry_at' => CarbonImmutable::parse($entry, 'Asia/Jakarta')->utc()]);
    $shipment = JneShipment::factory()->create(['latest_report_awb_id' => $source->id]);
    $selects = 0;
    DB::listen(function (QueryExecuted $query) use (&$selects): void {
        if (str_starts_with($query->sql, 'select')) {
            $selects++;
        }
    });
    $eligibility = app(PickupAwbEligibility::class);
    expect($eligibility->sameDay($task, $shipment))->toBe($sameDay);
    expect($selects)->toBe(2);
    expect($eligibility->sameDay($task, $shipment))->toBe($sameDay);
    expect($selects)->toBe(2);
})->with(['before next boundary' => ['2026-10-30 04:59:59', true], 'next boundary' => ['2026-10-30 05:00:00', false]]);

test('eligibility reuses loaded evidence and observes a replacement source without stale memoization', function () {
    $task = PickupTask::factory()->has(PickupRecord::factory(['picked_up_at' => CarbonImmutable::parse('2026-10-29 05:00:00', 'Asia/Jakarta')->utc()]), 'proof')->create()->load('proof');
    $same = JneReportAwb::factory()->create(['entry_at' => CarbonImmutable::parse('2026-10-29 06:00:00', 'Asia/Jakarta')->utc()]);
    $other = JneReportAwb::factory()->create(['entry_at' => CarbonImmutable::parse('2026-10-30 05:00:00', 'Asia/Jakarta')->utc()]);
    $shipment = JneShipment::factory()->create(['latest_report_awb_id' => $same->id])->load('latestSource');
    $selects = 0;
    DB::listen(function (QueryExecuted $query) use (&$selects): void {
        if (str_starts_with($query->sql, 'select')) {
            $selects++;
        }
    });
    $eligibility = app(PickupAwbEligibility::class);
    expect($eligibility->sameDay($task, $shipment))->toBeTrue();
    $shipment->setRelation('latestSource', $other);
    expect($eligibility->sameDay($task, $shipment))->toBeFalse();
    expect($selects)->toBe(0);
});
