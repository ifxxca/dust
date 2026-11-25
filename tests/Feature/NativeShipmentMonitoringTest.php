<?php

use App\Actions\Reports\ImportReportAwbs;
use App\Actions\Reports\ProjectJneShipments;
use App\Actions\Reports\QueryShipmentMonitoring;
use App\Actions\Reports\ResolveJneCustomerCodes;
use App\Jobs\ImportJneReportAwbs;
use App\Models\JneReportAwb;
use App\Models\JneShipment;
use App\Models\JneShipmentObservation;
use App\Models\ReportJob;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function () {
    $this->withoutVite();
});

test('potential overdue remains a source indication across unknown service units and invalid metadata', function (array $raw, string $status, bool $potential) {
    $source = JneReportAwb::factory()->create(['entry_at' => now()->subDay(), 'service' => 'UNVERIFIED', 'raw_data' => array_replace([
        'AGING' => '0', 'AGING_ONGOING' => '5', 'ETD' => '3', 'SLA' => '-3', 'CARRER' => 'On Time SLA (became)',
    ], $raw)]);
    JneShipment::factory()->create(['awb' => $source->awb, 'tracking_status' => $status, 'latest_report_awb_id' => $source->id, 'customer_id' => null]);

    $this->actingAs(User::factory()->create(['role' => 'admin_supervisor']))->get(route('shipment-monitoring.index'))
        ->assertOk()->assertInertia(fn (Assert $page) => $page->where('shipments.data.0.potential_overdue', $potential));
})->with([
    'unknown service is indication only' => [[], 'IN_TRANSIT', true],
    'unknown native grade can still have indication' => [['SLA' => null], 'IN_TRANSIT', true],
    'exception overlaps indication' => [[], 'EXCEPTION', true],
    'zero ETD is preserved' => [['ETD' => '0'], 'IN_TRANSIT', true],
    'equal boundary is not indication' => [['AGING_ONGOING' => '3'], 'IN_TRANSIT', false],
    'below boundary is not indication' => [['AGING_ONGOING' => '2'], 'IN_TRANSIT', false],
    'native over is separate' => [['SLA' => '2', 'CARRER' => 'Over SLA'], 'IN_TRANSIT', false],
    'missing ETD stays missing' => [['ETD' => null], 'IN_TRANSIT', false],
    'empty ETD stays empty' => [['ETD' => ''], 'IN_TRANSIT', false],
    'invalid ongoing is not substituted' => [['AGING_ONGOING' => '-1', 'AGING' => '10'], 'IN_TRANSIT', false],
    'delivered is historical' => [[], 'DELIVERED', false],
    'cancelled became is excluded' => [[], 'CANCELLED', false],
    'return is separate' => [[], 'RETURNED', false],
    'unknown lifecycle is quality only' => [[], 'UNKNOWN', false],
]);

test('audit population regression retains native grades and deduplicates overlapping attention', function () {
    $this->travelTo('2026-11-24 10:00:00 UTC');
    $report = ReportJob::factory()->create();
    $groups = [
        ['DELIVERED', 'On Time SLA', -1, 2, 19481], ['DELIVERED', 'Over SLA', 1, 4, 713],
        ['CANCELLED', 'On Time SLA (became)', -3, 5, 50],
        ['RETURNED', 'On Time SLA', -1, 2, 6], ['RETURNED', 'Over SLA', 1, 4, 18],
        ['EXCEPTION', 'Over SLA', 1, 4, 5], ['IN_TRANSIT', 'Over SLA (became)', 1, 4, 3],
        ['EXCEPTION', 'On Time SLA', -1, 5, 8], ['EXCEPTION', 'On Time SLA', -1, 2, 20],
        ['IN_TRANSIT', 'On Time SLA (became)', -3, 5, 22], ['IN_TRANSIT', 'On Time SLA (became)', -3, 2, 1828],
    ];
    $id = 0;
    foreach ($groups as [$status, $carrer, $sla, $ongoing, $count]) {
        $sourceTemplate = JneReportAwb::factory()->raw(['report_job_id' => $report->id, 'service' => 'REG23', 'entry_at' => '2026-11-01 01:00:00',
            'raw_data' => json_encode(['AGING' => (string) (3 + $sla), 'AGING_ONGOING' => (string) $ongoing, 'ETD' => '3', 'SLA' => (string) $sla, 'CARRER' => $carrer], JSON_THROW_ON_ERROR)]);
        $shipmentTemplate = JneShipment::factory()->raw(['tracking_status' => $status, 'customer_id' => null, 'last_observed_at' => '2026-11-24 09:20:00']);
        foreach (array_chunk(range(1, $count), 250) as $chunk) {
            $sources = [];
            $shipments = [];
            foreach ($chunk as $offset) {
                $id++;
                $awb = 'AUDIT'.str_pad((string) $id, 8, '0', STR_PAD_LEFT);
                $sources[] = [...$sourceTemplate, 'id' => $id, 'awb' => $awb, 'source_row' => $id];
                $shipments[] = [...$shipmentTemplate, 'awb' => $awb, 'latest_report_awb_id' => $id, 'latest_report_job_id' => $report->id];
            }
            DB::table('jne_report_awbs')->insert($sources);
            DB::table('jne_shipments')->insert($shipments);
        }
    }
    $monitoring = app(QueryShipmentMonitoring::class);

    $summary = $monitoring->summary([]);

    expect($summary)->toMatchArray(['total' => 22154, 'active' => 1886, 'delivered' => 20194, 'over_sla' => 8,
        'potential_overdue' => 30, 'attention' => 82, 'exception' => 33, 'returned' => 24, 'excluded' => 74, 'delivered_evaluated' => 20194, 'delivered_unknown' => 0]);
    expect($summary['sla_distribution'])->toMatchArray(['DELIVERED_LATE' => 713, 'DELIVERED_ON_TIME' => 19481]);
    expect($summary['native_sla_distribution'])->toBe(['ON_TIME' => 21415, 'OVER_SLA' => 739, 'UNKNOWN' => 0]);
    expect($monitoring->handle(['attention' => 'all'])->where('potential_overdue', 0)->count())->toBe(52);
    expect($monitoring->handle(['attention' => 'all'])->where(fn ($query) => $query->where('sla_status', 'OVER_SLA')->orWhereIn('tracking_status', ['EXCEPTION', 'RETURNED']))->count())->toBe(60);
    expect($monitoring->handle(['native_sla_grade' => 'OVER_SLA'])->count())->toBe(739);
});

test('large report resolves one report identity without exceeding MySQL placeholder limits', function () {
    config(['jne-reports.evidence_policies_enabled' => true]);
    $source = JneReportAwb::factory()->create(['entry_at' => now()->subDay(), 'shipper_name' => 'No registered code']);
    $bindingCounts = [];
    DB::listen(function ($query) use (&$bindingCounts): void {
        if (str_contains($query->sql, 'report_jobs') && str_contains($query->sql, ' in (')) {
            $bindingCounts[] = count($query->bindings);
        }
    });

    $result = app(ResolveJneCustomerCodes::class)->handle(collect(array_fill(0, 66000, $source)));

    expect($result)->toBe([]);
    expect($bindingCounts)->toBe([1]);
});

test('existing import recovery projects stored evidence once and never regresses the latest pointer', function () {
    config(['jne-reports.evidence_policies_enabled' => true, 'pickup.automation.enabled' => false]);
    $this->travelTo('2026-11-24 10:00:00 UTC');
    Storage::fake('jne_reports');
    Queue::fake();
    Http::preventStrayRequests();
    $older = ReportJob::factory()->create(['status' => 'COMPLETED', 'import_status' => 'IMPORTED', 'projection_status' => 'PROJECTED']);
    $newer = ReportJob::factory()->create(['status' => 'COMPLETED', 'import_status' => 'IMPORTED', 'projection_status' => 'FAILED', 'projection_error' => 'Fixture recovery']);
    $oldSource = JneReportAwb::factory()->create(['entry_at' => now()->subDay(), 'report_job_id' => $older->id, 'shipper_name' => 'Unmapped source', 'observed_at' => '2026-11-23 09:20:00', 'raw_data' => ['SLA' => '-3', 'CARRER' => 'On Time SLA (became)']]);
    $newSource = JneReportAwb::factory()->create(['entry_at' => now()->subDay(), 'report_job_id' => $newer->id, 'awb' => $oldSource->awb, 'shipper_name' => 'Unmapped source', 'observed_at' => '2026-11-24 09:20:00', 'raw_data' => ['SLA' => '2', 'CARRER' => 'Over SLA']]);
    $shipment = JneShipment::factory()->create(['awb' => $oldSource->awb, 'latest_report_awb_id' => $oldSource->id, 'latest_report_job_id' => $older->id, 'last_observed_at' => $oldSource->observed_at]);

    (new ImportJneReportAwbs($newer->id))->handle(app(ImportReportAwbs::class), app(ProjectJneShipments::class));
    (new ImportJneReportAwbs($older->id))->handle(app(ImportReportAwbs::class), app(ProjectJneShipments::class));
    (new ImportJneReportAwbs($newer->id))->handle(app(ImportReportAwbs::class), app(ProjectJneShipments::class));

    expect($newer->fresh()->projection_status)->toBe('PROJECTED');
    expect($shipment->fresh()->latest_report_awb_id)->toBe($newSource->id);
    expect(JneShipmentObservation::where('jne_report_awb_id', $newSource->id)->count())->toBe(1);
    expect(app(QueryShipmentMonitoring::class)->summary([])['native_sla_distribution']['OVER_SLA'])->toBe(1);
    Http::assertNothingSent();
    expect(Storage::disk('jne_reports')->allFiles())->toBe([]);
    Queue::assertNothingPushed();
});
