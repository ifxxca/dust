<?php

use App\Actions\Reports\QueryActiveJneAwbs;
use App\Actions\Reports\QueueScheduledJneReports;
use App\Models\JneReportProfile;
use App\Models\JneShipment;
use App\Models\JneShipmentObservation;
use App\Models\ReportJob;
use App\Models\User;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function () {
    $this->withoutVite();
    $this->travelTo('2026-10-24 05:00:00 UTC');
});

test('scheduled refresh selects new and due AWBs while manual refresh retains the guarded override', function () {
    $profile = JneReportProfile::factory()->create(['source' => 'apex', 'report_type' => 'unresolved', 'customer_account' => 'AWB_AKTIF', 'enabled' => true, 'interval_minutes' => 30]);
    JneShipment::factory()->create(['awb' => 'NEW']);
    foreach (['DUE' => 30, 'FRESH' => 29] as $awb => $minutes) {
        $shipment = JneShipment::factory()->create(['awb' => $awb, 'tracking_status' => 'IN_TRANSIT']);
        JneShipmentObservation::factory()->create(['jne_shipment_id' => $shipment->id, 'created_at' => now()->subMinutes($minutes)]);
    }
    JneShipment::factory()->create(['awb' => 'DONE', 'tracking_status' => 'DELIVERED']);

    app(QueueScheduledJneReports::class)->queueProfile($profile->id);
    $job = ReportJob::where('report_type', 'unresolved')->sole();
    expect($job->parameters['awbs'])->toBe(['DUE', 'NEW']);
    expect(app(QueueScheduledJneReports::class)->queueProfile($profile->id, true))->toBe(0);
    $job->update(['status' => 'COMPLETED', 'import_status' => 'IMPORTED', 'projection_status' => 'PROJECTED']);
    app(QueueScheduledJneReports::class)->queueProfile($profile->id, true);
    expect(ReportJob::where('report_type', 'unresolved')->latest('id')->first()->parameters['awbs'])->toBe(['DUE', 'FRESH', 'NEW']);
});

test('status minimum intervals never poll faster than the profile and recently received older snapshots are skipped', function () {
    config(['jne-reports.refresh_minimum_minutes.IN_TRANSIT' => 120, 'jne-reports.refresh_minimum_minutes.EXCEPTION' => 1]);
    foreach ([['TRANSIT', 'IN_TRANSIT', 60], ['EXCEPTION', 'EXCEPTION', 31], ['RECENT', 'UNKNOWN', 1], ['RETURNED', 'RETURNED', 31], ['CANCELLED', 'CANCELLED', 300]] as [$awb, $status, $minutes]) {
        $shipment = JneShipment::factory()->create(['awb' => $awb, 'tracking_status' => $status, 'last_observed_at' => now()->subDays(3)]);
        JneShipmentObservation::factory()->create(['jne_shipment_id' => $shipment->id, 'observed_at' => now()->subDays(3), 'created_at' => now()->subMinutes($minutes)]);
    }

    expect(app(QueryActiveJneAwbs::class)->due(60, 30)->orderBy('awb')->pluck('awb')->all())->toBe(['EXCEPTION', 'RETURNED']);
    $this->travel(60)->minutes();
    expect(app(QueryActiveJneAwbs::class)->due(60, 30)->where('awb', 'TRANSIT')->exists())->toBeTrue();
});

test('an old failed refresh does not block an empty due cycle or silently acknowledge its failure', function () {
    $profile = JneReportProfile::factory()->create(['source' => 'apex', 'report_type' => 'unresolved', 'customer_account' => 'AWB_AKTIF', 'enabled' => true, 'interval_minutes' => 30]);
    $shipment = JneShipment::factory()->create(['awb' => 'FRESH']);
    JneShipmentObservation::factory()->create(['jne_shipment_id' => $shipment->id]);
    $failed = ReportJob::factory()->create(['source' => 'apex', 'report_type' => 'unresolved', 'customer_account' => 'AWB_AKTIF', 'status' => 'NEEDS_ATTENTION', 'reviewed_at' => null]);

    expect(app(QueueScheduledJneReports::class)->queueProfile($profile->id))->toBe(1);
    expect($failed->fresh()->reviewed_at)->toBeNull();
    $cycle = ReportJob::where('report_type', 'unresolved')->latest('id')->first();
    expect($cycle->status)->toBe('NO_DATA')->and($cycle->awb_count)->toBe(0)->and($cycle->parameters['awbs'])->toBe([]);
    expect(ReportJob::where('report_type', 'unresolved')->where('status', 'QUEUED')->count())->toBe(0);
});

test('monitoring distinguishes observation time report receipt and the latest failed refresh for the exact AWB', function () {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $shipment = JneShipment::factory()->create(['awb' => '000123', 'last_observed_at' => now()->subDays(2)]);
    JneShipmentObservation::factory()->create(['jne_shipment_id' => $shipment->id, 'observed_at' => now()->subDays(2)]);
    $failure = ReportJob::factory()->create(['source' => 'apex', 'report_type' => 'unresolved', 'parameters' => ['awbs' => ['000123']], 'status' => 'NEEDS_ATTENTION', 'error_message' => 'WORKER_EXPIRED: fixture']);
    ReportJob::factory()->create(['source' => 'apex', 'report_type' => 'unresolved', 'parameters' => ['awbs' => ['123']], 'status' => 'COMPLETED']);

    $this->actingAs($admin)->get(route('jne-monitoring.show', $shipment))->assertOk()->assertInertia(fn (Assert $page) => $page
        ->where('shipment.observed_at', now()->subDays(2)->toIso8601String())
        ->where('shipment.last_report_received_at', now()->toIso8601String())
        ->where('shipment.last_refresh_attempt.id', $failure->id)
        ->where('shipment.last_refresh_attempt.stage', 'ATTENTION')
        ->where('shipment.last_refresh_attempt.error_message', 'WORKER_EXPIRED: fixture'));
});
