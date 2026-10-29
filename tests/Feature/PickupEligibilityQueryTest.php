<?php

use App\Actions\Pickup\ReconcilePickupProcessing;
use App\Models\JneReportAwb;
use App\Models\JneShipment;
use App\Models\PickupPendingItem;
use App\Models\PickupRecord;
use App\Models\PickupTask;
use App\Models\ReportJob;
use Illuminate\Support\Facades\DB;

test('cross day reconciliation batches processed pending eligibility reads', function (int $size) {
    $this->travelTo('2026-10-27 08:00:00 UTC');
    $task = PickupTask::factory()->has(PickupRecord::factory()->state(['picked_up_at' => '2026-10-26 08:00:00']), 'proof')->create(['status' => 'PICKED_UP']);
    $report = ReportJob::factory()->create(['status' => 'COMPLETED', 'import_status' => 'IMPORTED', 'projection_status' => 'PROJECTED']);
    for ($index = 0; $index < $size; $index++) {
        $source = JneReportAwb::factory()->create(['report_job_id' => $report->id, 'source_row' => $index + 1, 'entry_at' => '2026-10-27 08:00:00']);
        $shipment = JneShipment::factory()->create(['awb' => $source->awb, 'latest_report_awb_id' => $source->id, 'pickup_task_id' => $task->id,
            'customer_id' => $task->customer_id, 'customer_match_status' => 'MATCHED', 'match_status' => 'MATCHED', 'category_status' => 'MATCHED', 'category' => 'manual_hybrid']);
        PickupPendingItem::factory()->create(['pickup_task_id' => $task->id, 'jne_shipment_id' => $shipment->id,
            'created_by' => $task->created_by, 'updated_by' => $task->created_by, 'status' => 'PROCESSED', 'processing_date' => '2026-10-27']);
    }
    DB::flushQueryLog();
    DB::enableQueryLog();
    $started = hrtime(true);
    memory_reset_peak_usage();

    try {
        $result = app(ReconcilePickupProcessing::class)->evaluate($task->id, false);
        $reads = count(array_filter(DB::getQueryLog(), fn (array $entry): bool => preg_match('/^select .*from ["`]*pickup_pending_items\b/is', $entry['query']) === 1));
        $queryCount = count(DB::getQueryLog());
        $selectCount = count(array_filter(DB::getQueryLog(), fn (array $entry): bool => str_starts_with(strtolower($entry['query']), 'select')));
        $duration = (hrtime(true) - $started) / 1e6;
    } finally {
        DB::disableQueryLog();
        DB::flushQueryLog();
    }

    expect($reads)->toBeLessThanOrEqual(1 + (int) ceil($size / 500));
    if (getenv('HARDENING_METRICS') === '1') {
        fwrite(STDERR, json_encode(['metric' => 'pending_selects', 'engine' => DB::getDriverName(), 'size' => $size, 'selects' => $reads, 'total_selects' => $selectCount, 'queries' => $queryCount, 'duration_ms' => round($duration, 2), 'peak_php_bytes' => memory_get_peak_usage(true)], JSON_THROW_ON_ERROR).PHP_EOL);
    }
    expect($result->categories['manual_hybrid']['confirmed'])->toBe($size);
    expect($task->proof->fresh()->manual_hybrid)->toBe(2);
})->with(getenv('VALIDATION_LOAD') === '1' ? [100, 1000, 5000] : [1, 50, 500]);
