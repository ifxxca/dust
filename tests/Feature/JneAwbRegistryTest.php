<?php

use App\Actions\Reports\ProjectJneShipments;
use App\Models\JneReportAwb;
use App\Models\JneShipment;
use App\Models\JneShipmentObservation;
use App\Models\ReportJob;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Schema;

test('cross account reports retain all original evidence without duplicating or regressing the AWB', function () {
    $this->travelTo('2026-10-24 12:00:00 UTC');
    $newJob = ReportJob::factory()->create(['status' => 'COMPLETED', 'import_status' => 'IMPORTED', 'national_account' => 'Y']);
    $new = JneReportAwb::factory()->create(['report_job_id' => $newJob->id, 'awb' => '000001', 'customer_account' => 'SHARED', 'observed_at' => now(), 'status_web' => 'DELIVERED', 'awb_cancel' => null, 'raw_data' => ['AWB' => "'000001", 'ID_ACCOUNT' => 'SHARED']]);
    app(ProjectJneShipments::class)->handle($newJob->id);
    $id = JneShipment::sole()->id;
    $olderJob = ReportJob::factory()->create(['source' => 'hybrid', 'report_type' => 'combined', 'status' => 'COMPLETED', 'import_status' => 'IMPORTED']);
    $older = JneReportAwb::factory()->create(['report_job_id' => $olderJob->id, 'awb' => '000001', 'customer_account' => 'OTHER', 'observed_at' => now()->subHours(2), 'status_web' => 'IN TRANSIT', 'raw_data' => ['AWB' => '000001', 'ID_ACCOUNT' => 'OTHER']]);

    app(ProjectJneShipments::class)->handle($olderJob->id);
    app(ProjectJneShipments::class)->handle($newJob->id);
    app(ProjectJneShipments::class)->handle($olderJob->id);

    $this->assertDatabaseCount('jne_shipments', 1);
    $this->assertDatabaseCount('jne_shipment_observations', 2);
    $this->assertDatabaseHas('jne_shipments', ['id' => $id, 'awb' => '000001', 'customer_account' => 'SHARED', 'latest_report_awb_id' => $new->id, 'tracking_status' => 'DELIVERED', 'customer_id' => null, 'pickup_task_id' => null]);
    expect(JneShipmentObservation::where('jne_report_awb_id', $older->id)->value('changes_current'))->toBeFalse();
    expect($new->fresh()->raw_data['AWB'])->toBe("'000001");
    expect($older->fresh()->raw_data['ID_ACCOUNT'])->toBe('OTHER');
    expect($newJob->fresh()->national_account)->toBe('Y');
});

test('registry upgrade refuses historical duplicate AWBs without deleting their evidence or claims', function () {
    Schema::table('jne_shipments', fn (Blueprint $table) => $table->dropUnique(['awb']));
    $one = JneShipment::factory()->create(['awb' => '000001', 'customer_account' => 'ONE']);
    $two = JneShipment::factory()->create(['awb' => '000001', 'customer_account' => 'TWO']);
    $migration = require database_path('migrations/2026_10_24_150411_enforce_unique_awbs_on_jne_shipments.php');

    expect(fn () => $migration->up())->toThrow(RuntimeException::class, 'duplicate normalized AWBs');

    $this->assertModelExists($one);
    $this->assertModelExists($two);
    $this->assertDatabaseCount('jne_shipments', 2);
});

test('a failed projection rolls back shipments and observations and can replay the imported rows', function () {
    $job = ReportJob::factory()->create(['status' => 'COMPLETED', 'import_status' => 'IMPORTED']);
    JneReportAwb::factory()->create(['report_job_id' => $job->id, 'awb' => 'FIRST']);
    JneReportAwb::factory()->create(['report_job_id' => $job->id, 'awb' => 'SECOND']);
    Event::listen('eloquent.updating: '.JneShipment::class, function (JneShipment $shipment): void {
        if ($shipment->awb === 'SECOND') {
            throw new RuntimeException('synthetic projection failure');
        }
    });

    expect(fn () => app(ProjectJneShipments::class)->handle($job->id))->toThrow(RuntimeException::class);

    $this->assertDatabaseCount('jne_shipments', 0);
    $this->assertDatabaseCount('jne_shipment_observations', 0);
    $this->assertDatabaseCount('jne_report_awbs', 2);
    expect($job->fresh()->import_status)->toBe('IMPORTED');
    Event::forget('eloquent.updating: '.JneShipment::class);

    app(ProjectJneShipments::class)->handle($job->id);

    $this->assertDatabaseCount('jne_shipments', 2);
    $this->assertDatabaseCount('jne_shipment_observations', 2);
    expect($job->fresh()->projection_status)->toBe('PROJECTED');
});
