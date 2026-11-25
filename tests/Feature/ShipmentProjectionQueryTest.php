<?php

use App\Actions\Reports\MatchJneShipments;
use App\Actions\Reports\ProjectJneShipments;
use App\Models\Customer;
use App\Models\JneReportAwb;
use App\Models\JneShipment;
use App\Models\JneShipperAlias;
use App\Models\JneSourceContract;
use App\Models\PickupRecord;
use App\Models\PickupTask;
use App\Models\ReportJob;
use Illuminate\Support\Facades\DB;

test('projection bounds source date fallback reads and preserves retry observations', function (int $size, bool $missingDate) {
    $this->travelTo('2026-10-26 08:00:00 UTC');
    $customer = Customer::factory()->create();
    JneShipperAlias::factory()->create(['customer_id' => $customer->id, 'shipper_name' => 'Measured Sender']);
    $task = PickupTask::factory()->has(PickupRecord::factory(), 'proof')->create(['customer_id' => $customer->id, 'status' => 'PICKED_UP']);
    $report = ReportJob::factory()->create(['status' => 'COMPLETED', 'import_status' => 'IMPORTED']);
    for ($index = 0; $index < $size; $index++) {
        JneReportAwb::factory()->create(['report_job_id' => $report->id, 'source_row' => $index + 1,
            'reference' => $task->reference, 'shipper_name' => 'Measured Sender', 'entry_at' => $missingDate ? null : now()]);
    }
    DB::flushQueryLog();
    DB::enableQueryLog();

    try {
        app(ProjectJneShipments::class)->handle($report->id);
        $fallbackReads = count(array_filter(DB::getQueryLog(), fn (array $entry): bool => preg_match('/^select .*from ["`]*jne_report_awbs["`]* where ["`]*jne_report_awbs["`]*\.["`]*id["`]* (=|in)/i', $entry['query']) === 1));
    } finally {
        DB::disableQueryLog();
        DB::flushQueryLog();
    }

    expect($fallbackReads)->toBeLessThanOrEqual(1);
    if (getenv('HARDENING_METRICS') === '1') {
        fwrite(STDERR, json_encode(['metric' => 'projection_fallback_selects', 'size' => $size, 'missing_date' => $missingDate, 'selects' => $fallbackReads], JSON_THROW_ON_ERROR).PHP_EOL);
    }
    expect(JneShipment::where('pickup_task_id', $task->id)->count())->toBe($size);
    $this->assertDatabaseCount('jne_shipment_observations', $size);
    app(ProjectJneShipments::class)->handle($report->id);
    $this->assertDatabaseCount('jne_shipment_observations', $size);
})->with([1, 10, 100])->with([false, true]);

test('historical matching retains verified customer code evidence without hydrating unrelated CSV payloads', function () {
    config(['jne-reports.evidence_policies_enabled' => true]);
    $customer = Customer::factory()->create(['customer_code' => '472']);
    JneSourceContract::factory()->create(['active_key' => JneSourceContract::key('apex', 'apex'), 'verified_at' => now(), 'definition' => ['customer_code_column' => 'CUST_CODE']]);
    $report = ReportJob::factory()->create(['status' => 'COMPLETED', 'import_status' => 'IMPORTED']);
    $source = JneReportAwb::factory()->create(['report_job_id' => $report->id, 'shipper_name' => '', 'raw_data' => ['CUST_CODE' => '472', 'UNUSED' => str_repeat('x', 1000000)]]);
    $seen = null;
    $queryListener = function (JneReportAwb $row) use (&$seen): void {
        if ($row->getAttribute('awb') !== null) {
            $seen = $row->raw_data;
        }
    };
    JneReportAwb::retrieved($queryListener);
    try {
        $result = app(MatchJneShipments::class)->candidates(collect([$source]));
    } finally {
        JneReportAwb::flushEventListeners();
    }
    expect($seen)->toBe(['CUST_CODE' => '472']);
    expect($result[$source->id]['customer_id'])->toBe($customer->id);
    expect(strlen($source->fresh()->raw_data['UNUSED']))->toBe(1000000);
});
