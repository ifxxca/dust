<?php

use App\Actions\Reports\ImportReportAwbs;
use App\Actions\Reports\ProjectJneShipments;
use Illuminate\Database\Events\QueryExecuted;
use Illuminate\Database\Events\TransactionBeginning;
use Illuminate\Database\Events\TransactionCommitted;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Storage;

require_once __DIR__.'/../Fixtures/pickup-automation.php';

test('synthetic repeated imports retain evidence and expose opt in local measurements', function (int $size) {
    Storage::fake('jne_reports');
    $this->travelTo('2026-10-27 08:00:00 UTC');
    config(['pickup.automation.enabled' => false, 'jne-reports.evidence_policies_enabled' => true]);
    $fixture = pickupAutomationFixture($size, 0);
    $queries = 0;
    $selects = 0;
    $transactionMilliseconds = 0;
    $transactions = [];
    DB::listen(function (QueryExecuted $event) use (&$queries, &$selects): void {
        $queries++;
        $selects += str_starts_with(strtolower($event->sql), 'select') ? 1 : 0;
    });
    Event::listen(TransactionBeginning::class, function () use (&$transactions): void {
        $transactions[] = hrtime(true);
    });
    Event::listen(TransactionCommitted::class, function () use (&$transactions, &$transactionMilliseconds): void {
        if ($transactions !== []) {
            $transactionMilliseconds += (hrtime(true) - array_pop($transactions)) / 1e6;
        }
    });
    memory_reset_peak_usage();
    $started = hrtime(true);
    $first = importPickupAutomationReport($fixture, $size, 0);
    $this->travel(1)->minute();
    $second = importPickupAutomationReport($fixture, $size, 0);
    $queryCount = $queries;
    $selectCount = $selects;
    $metrics = ['rows_per_report' => $size, 'reports' => 2, 'duration_ms' => round((hrtime(true) - $started) / 1e6, 2),
        'peak_php_bytes' => memory_get_peak_usage(true), 'queries' => $queryCount, 'selects' => $selectCount, 'transaction_ms_sum' => round($transactionMilliseconds, 2)];
    if (getenv('HARDENING_METRICS') === '1') {
        fwrite(STDERR, json_encode($metrics, JSON_THROW_ON_ERROR).PHP_EOL);
    }

    $this->assertDatabaseCount('jne_shipments', $size);
    $this->assertDatabaseCount('jne_report_awbs', 2 * $size);
    $this->assertDatabaseCount('jne_shipment_observations', 2 * $size);
    expect($first->imported_awb_count)->toBe($size);
    expect($second->duplicate_awb_count)->toBe(0);
    app(ImportReportAwbs::class)->handle($second->id);
    app(ProjectJneShipments::class)->handle($first->id);
    $this->assertDatabaseCount('jne_shipment_observations', 2 * $size);
    $this->assertDatabaseHas('jne_shipments', ['latest_report_job_id' => $second->id]);
})->with([100, 1000]);
