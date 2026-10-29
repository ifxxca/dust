<?php

use App\Actions\Reports\ProjectJneShipments;
use App\Actions\Reports\ReadJneSourceEvidence;
use App\Actions\Reports\ResolveJneCategories;
use App\Models\JneReportAwb;
use App\Models\JneShipment;
use App\Models\PickupRecord;
use App\Models\PickupTask;
use App\Models\ReportJob;
use App\Models\User;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function () {
    $this->withoutVite();
    config(['jne-reports.category_markers_enabled' => true, 'jne-reports.evidence_policies_enabled' => false,
        'jne-reports.category_reconciliation_enabled' => false]);
});

function categoryMarkerSource(string $awb, string $source = 'hybrid', string $mode = 'A', ?string $kind = null): JneReportAwb
{
    $job = ReportJob::factory()->create(['source' => $source, 'report_type' => $source === 'hybrid' ? 'combined' : ($mode === 'P' ? 'apex' : 'unresolved'),
        'report_mode' => $mode, 'status' => 'COMPLETED', 'import_status' => 'IMPORTED']);
    if ($kind !== null) {
        ReportJob::factory()->create(['source' => 'roberto', 'report_type' => $kind, 'hybrid_batch_id' => $job->id,
            'status' => 'SOURCE_SAVED', 'source_file_checksum' => str_repeat('a', 64), 'parameters' => ['awbs' => [$awb]]]);
    }

    return JneReportAwb::factory()->create(['report_job_id' => $job->id, 'awb' => $awb]);
}

test('known AWB prefixes mark categories without enabling reconciliation policies', function (string $awb, string $category) {
    $shipment = JneShipment::factory()->create(['awb' => $awb]);

    app(ResolveJneCategories::class)->handle(JneShipment::whereKey($shipment->id)->get());

    expect($shipment->fresh()->only(['category', 'category_status']))->toBe(['category' => $category, 'category_status' => 'MATCHED']);
    expect(ResolveJneCategories::enabled())->toBeFalse();
})->with([
    ['010100012345678', 'manual_hybrid'], ['016660047446626', 'manual_hybrid'],
    ['CM123456789', 'cashless_hybrid'], ['TG3583843345', 'cashless_hybrid'],
]);

test('manual and cashless source reports classify additional prefixes from their recorded origins', function (string $awb, string $kind, string $category) {
    $source = categoryMarkerSource($awb, kind: $kind);

    app(ProjectJneShipments::class)->handle($source->report_job_id);

    $shipment = JneShipment::where('awb', $awb)->sole();
    expect($shipment->category)->toBe($category);
    expect($shipment->category_status)->toBe('MATCHED');
    expect(collect($shipment->category_evidence)->pluck('rule')->all())->toContain('hybrid_report_type');
})->with([
    ['JT700123456', 'cashless', 'cashless_hybrid'], ['BLI00123456', 'cashless', 'cashless_hybrid'],
    ['2600153321502M01', 'manual', 'manual_hybrid'],
]);

test('customer reports establish Orion while active AWB refresh preserves the original hybrid category', function () {
    $orion = categoryMarkerSource('890001234567', 'apex', 'P');
    $manual = categoryMarkerSource('016660000000001', kind: 'manual');
    app(ProjectJneShipments::class)->handle($orion->report_job_id);
    app(ProjectJneShipments::class)->handle($manual->report_job_id);
    $refresh = categoryMarkerSource($manual->awb, 'apex', 'A');

    app(ProjectJneShipments::class)->handle($refresh->report_job_id);

    expect(JneShipment::where('awb', $orion->awb)->sole()->category)->toBe('css_orion');
    expect(JneShipment::where('awb', $manual->awb)->sole()->only(['category', 'category_status']))->toBe(['category' => 'manual_hybrid', 'category_status' => 'MATCHED']);
});

test('contradictory category evidence stays in review and does not change pickup quantities or ownership', function () {
    $proof = PickupRecord::factory()->create(['manual_hybrid' => 50, 'cashless_hybrid' => 50, 'css_orion' => 0]);
    $source = categoryMarkerSource('TG3583843345', kind: 'manual');
    $shipment = JneShipment::factory()->create(['awb' => $source->awb, 'pickup_task_id' => $proof->pickup_task_id, 'customer_id' => PickupTask::findOrFail($proof->pickup_task_id)->customer_id]);
    $ownership = $shipment->only(['customer_id', 'pickup_task_id']);
    $before = $proof->fresh()->getAttributes();

    app(ResolveJneCategories::class)->handle(JneShipment::whereKey($shipment->id)->get());

    expect($shipment->fresh()->category_status)->toBe('CONFLICT');
    expect($shipment->fresh()->category)->toBeNull();
    expect($shipment->fresh()->only(['customer_id', 'pickup_task_id']))->toBe($ownership);
    expect($proof->fresh()->getAttributes())->toBe($before);
});

test('unknown AWBs and upload-only APEX results are not presumed to be Orion', function () {
    $source = categoryMarkerSource('UNKNOWN123', 'apex', 'A');

    app(ProjectJneShipments::class)->handle($source->report_job_id);

    expect(JneShipment::where('awb', $source->awb)->sole()->only(['category', 'category_status']))->toBe(['category' => null, 'category_status' => 'UNMATCHED']);
});

test('reviewed category choices are retained when conflicting prefix evidence appears', function () {
    $shipment = JneShipment::factory()->create(['awb' => 'TG123456789', 'category' => 'manual_hybrid', 'category_status' => 'MATCHED', 'category_method' => 'REVIEW']);

    app(ResolveJneCategories::class)->handle(JneShipment::whereKey($shipment->id)->get());

    expect($shipment->fresh()->only(['category', 'category_status', 'category_method']))->toBe(['category' => 'manual_hybrid', 'category_status' => 'CONFLICT', 'category_method' => 'REVIEW']);
});

test('bulk refresh source evidence retains only the requested AWB origins across hybrid daily batches', function () {
    $source = categoryMarkerSource('JT700012345', kind: 'cashless');
    categoryMarkerSource('016600099999', kind: 'manual');
    $bulk = ReportJob::factory()->create(['source' => 'apex', 'report_type' => 'unresolved', 'report_mode' => 'A', 'parameters' => ['awbs' => [$source->awb]]]);

    $context = app(ReadJneSourceEvidence::class)->context($bulk);

    expect(array_keys($context['origins']))->toBe(['awb:JT700012345']);
    expect($context['origins']['awb:JT700012345'][0])->toMatchArray(['source' => 'roberto', 'report_type' => 'cashless', 'checksum' => str_repeat('a', 64)]);
});

test('classification backfill is idempotent and never creates new report requests', function () {
    $shipment = JneShipment::factory()->create(['awb' => '016600000001']);

    $this->artisan('jne-monitoring:classify')->assertSuccessful();
    $this->artisan('jne-monitoring:classify')->assertSuccessful();

    expect($shipment->fresh()->category)->toBe('manual_hybrid');
    $this->assertDatabaseCount('jne_shipment_match_events', 1);
    $this->assertDatabaseCount('report_jobs', 0);
});

test('shipment lists and exports separate matched categories from records that require review', function () {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $manual = JneShipment::factory()->create(['awb' => '016600000001', 'category' => 'manual_hybrid', 'category_status' => 'MATCHED']);
    JneShipment::factory()->create(['awb' => 'TG1234', 'category' => 'cashless_hybrid', 'category_status' => 'MATCHED']);
    $review = JneShipment::factory()->create(['awb' => 'CONFLICT123', 'category' => 'manual_hybrid', 'category_status' => 'CONFLICT']);
    $this->actingAs($admin);

    $this->get(route('jne-monitoring.index', ['category' => 'manual_hybrid']))->assertOk()
        ->assertInertia(fn (Assert $page) => $page->where('shipments.total', 1)->where('shipments.data.0.id', $manual->id)
            ->where('shipments.data.0.category', 'manual_hybrid')->where('shipments.data.0.category_status', 'MATCHED'));
    $this->get(route('jne-monitoring.index', ['category' => 'review']))->assertOk()
        ->assertInertia(fn (Assert $page) => $page->where('shipments.total', 1)->where('shipments.data.0.id', $review->id));
    $csv = $this->get(route('jne-monitoring.export', ['category' => 'manual_hybrid']))->assertOk()->streamedContent();
    expect($csv)->toContain('Kategori', '016600000001', 'manual_hybrid')->not->toContain('TG1234', 'CONFLICT123');
    $this->getJson(route('jne-monitoring.index', ['category' => 'arbitrary']))->assertUnprocessable()->assertJsonValidationErrors('category');
});
