<?php

use App\Actions\Pickup\PickupAwbEligibility;
use App\Actions\Pickup\ReconcilePickupProcessing;
use App\Actions\Reports\ImportReportAwbs;
use App\Actions\Reports\ProjectJneShipments;
use App\Jobs\RenderPickupAwbManifestJob;
use App\Models\JneShipment;
use App\Models\ReportJob;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;

require_once __DIR__.'/../Fixtures/cross-customer-locking.php';
require_once __DIR__.'/../Fixtures/pickup-automation.php';
require_once __DIR__.'/../Fixtures/processing-efficiency.php';

test('native MySQL preserves unchanged reconciliation while measuring targeted locking cost', function (int $size) {
    if (getenv('CROSS_LOCKING') !== '1' || (int) getenv('HARDENING_MYSQL_PORT') !== 54184) {
        $this->markTestSkipped('Explicit disposable MySQL locking fixture required.');
    }
    Http::preventStrayRequests();
    Queue::fake();
    $this->travelTo('2026-10-29 08:00:00 UTC');
    Storage::set('jne_reports', Storage::fake('cross-perf-'.bin2hex(random_bytes(8))));
    $setup = crossLockDatabase();
    $database = $setup['database'];
    config(['database.connections.eff_observer' => [...$setup['settings'], 'database' => $database]]);
    try {
        $fixture = pickupAutomationFixture($size, 0);
        $csv = "AWB,ID_ACCOUNT,CUSTOMER_CODE,SHIPPER_NAME,TGL_ENTRY,PROCESS_TYPE\n";
        foreach (range(1, $size) as $index) {
            $csv .= 'LOCKPERF'.$index.",SIM_AUTO_ACCOUNT,4000,VANNY,2026-10-29 10:00:00,MANUAL\n";
        }
        Storage::disk('jne_reports')->put('cross-perf.csv', $csv);
        $report = ReportJob::factory()->create(['created_by' => $fixture['admin']->id, 'status' => 'COMPLETED', 'report_mode' => 'A', 'customer_account' => 'SIM_AUTO_ACCOUNT',
            'file_path' => 'cross-perf.csv', 'file_checksum' => hash('sha256', $csv), 'started_at' => now(), 'completed_at' => now(), 'date_from' => now()->toDateString(), 'date_thru' => now()->toDateString()]);
        app(ImportReportAwbs::class)->handle($report->id);
        app(ProjectJneShipments::class)->handle($report->id);
        expect(app(ReconcilePickupProcessing::class)->handle($fixture['task']->id)->status)->toBe('DONE');
        $events = DB::table('jne_shipment_match_events')->count();
        $manifestIds = DB::table('pickup_awb_manifests')->pluck('id')->all();
        $measure = processingEfficiencyProbe();
        foreach ([1, 2] as $repeat) {
            $row = $measure('unchanged_reconciliation_'.$repeat, fn () => app(ReconcilePickupProcessing::class)->handle($fixture['task']->id));
            file_put_contents(base_path('docs/technical-audit/evidence/cross-lock-efficiency.ndjson'), json_encode(['tag' => getenv('CROSS_LOCK_TAG') ?: 'baseline',
                'size' => $size, 'version' => DB::selectOne('SELECT VERSION() AS v')->v, ...$row], JSON_THROW_ON_ERROR).PHP_EOL, FILE_APPEND);
            expect($row['events_created'])->toBe(0);
            expect($row['shipment_rows_changed'])->toBe(0);
        }
        $rows = JneShipment::with('latestSource')->get();
        $task = $fixture['task']->load('proof');
        $eligibility = app(PickupAwbEligibility::class);
        $row = $measure('preloaded_same_day_checks', function () use ($rows, $task, $eligibility): void {
            foreach ($rows as $shipment) {
                expect($eligibility->sameDay($task, $shipment))->toBeTrue();
            }
        });
        file_put_contents(base_path('docs/technical-audit/evidence/cross-lock-efficiency.ndjson'), json_encode(['tag' => getenv('CROSS_LOCK_TAG') ?: 'baseline', 'size' => $size, ...$row], JSON_THROW_ON_ERROR).PHP_EOL, FILE_APPEND);
        $this->assertDatabaseCount('jne_shipment_match_events', $events);
        expect(DB::table('pickup_awb_manifests')->pluck('id')->all())->toBe($manifestIds);
        expect($fixture['task']->proof->effectiveValues()['manual_hybrid'])->toBe($size);
        Http::assertNothingSent();
        Queue::assertPushed(RenderPickupAwbManifestJob::class);
    } finally {
        config(['database.default' => 'sqlite']);
        DB::purge('cross_mysql');
        DB::purge('eff_observer');
        DB::connection('cross_server')->statement('DROP DATABASE '.$database);
    }
})->with([100, 1000, 5000])->group('cross-customer-locking');
