<?php

use App\Actions\Pickup\AssessPickupReportCoverage;
use App\Actions\Reports\AssessJneReportCollection;
use App\Actions\Reports\CombineHybridReports;
use App\Actions\Reports\ImportReportAwbs;
use App\Actions\Reports\ProjectJneShipments;
use App\Jobs\SyncJneCustomerMappings;
use App\Models\JneReportAwb;
use App\Models\JneShipment;
use App\Models\JneSourceContract;
use App\Models\ReportJob;
use App\Models\User;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;

require_once __DIR__.'/../Fixtures/pickup-automation.php';

beforeEach(function () {
    $this->travelTo('2026-10-26 12:00:00 UTC');
    config(['pickup.automation.enabled' => false, 'pickup.automation.send_enabled' => false,
        'jne-reports.evidence_policies_enabled' => true, 'jne-reports.category_reconciliation_enabled' => true,
        'jne-reports.collection_attestation_enabled' => false]);
});

/** @return array{fixture: array, job: ReportJob} */
function sourceCompletenessFixture(): array
{
    Storage::fake('jne_reports');
    $fixture = pickupAutomationFixture(1, 0);
    $job = importPickupAutomationReport($fixture, 1, 0);

    return compact('fixture', 'job');
}

test('a verified full date source proves coverage with traceable account date and contract evidence and repeat imports are idempotent', function () {
    ['fixture' => $fixture, 'job' => $job] = sourceCompletenessFixture();
    $before = JneReportAwb::pluck('id')->all();
    $coverage = app(AssessPickupReportCoverage::class)->handle($fixture['task']);

    expect($coverage)->toMatchArray(['complete' => true, 'state' => 'FULL_COLLECTION', 'reports' => [$job->id], 'required_dates' => ['2026-10-26']]);
    expect($coverage['cutoff_at'])->toBe('2026-10-26T12:00:00+00:00');
    expect($coverage['requirements'][0])->toMatchArray(['requirement' => 'apex:apex:SIM_AUTO_ACCOUNT', 'latest_attempt_id' => $job->id,
        'latest_successful_id' => $job->id, 'latest_coverage_eligible_id' => $job->id, 'state' => 'FULL_COLLECTION']);
    expect($coverage['requirements'][0]['evidence'])->toMatchArray(['report_id' => $job->id, 'contract_id' => $fixture['contract']->id,
        'contract_revision' => 1, 'account' => 'SIM_AUTO_ACCOUNT', 'checksum' => $job->file_checksum]);
    app(ImportReportAwbs::class)->handle($job->id);
    app(ProjectJneShipments::class)->handle($job->id);
    expect(app(AssessPickupReportCoverage::class)->handle($fixture['task']))->toBe($coverage);
    expect(JneReportAwb::pluck('id')->all())->toBe($before);
    $this->assertDatabaseCount('jne_shipments', 1);
    $this->assertDatabaseCount('jne_shipment_observations', 1);
});

test('successful collection is not sufficient when subset checksum contract or readiness is missing', function (array $changes, bool $verified, string $state) {
    ['fixture' => $fixture, 'job' => $job] = sourceCompletenessFixture();
    $job->update($changes);
    if (! $verified) {
        $fixture['contract']->update(['active_key' => null]);
    }
    $coverage = app(AssessPickupReportCoverage::class)->handle($fixture['task']);

    expect($coverage)->toMatchArray(['complete' => false, 'state' => $state, 'reports' => []]);
    $this->travel(30)->days();
    expect(app(AssessPickupReportCoverage::class)->handle($fixture['task']))->toBe($coverage);
})->with([
    'explicit subset' => [['parameters' => ['awbs' => ['000MANUAL1']]], true, 'SUBSET_COLLECTION'],
    'upload mode without list' => [['report_mode' => 'A'], true, 'SUBSET_COLLECTION'],
    'missing checksum' => [['file_checksum' => null], true, 'UNKNOWN'],
    'invalid checksum' => [['file_checksum' => 'not-a-checksum'], true, 'UNKNOWN'],
    'possible export truncation' => [['row_count' => 6000], true, 'UNKNOWN'],
    'unverified contract' => [[], false, 'UNKNOWN'],
    'collector failed' => [['status' => 'NEEDS_ATTENTION'], true, 'FAILED'],
    'projection failed' => [['projection_status' => 'FAILED'], true, 'FAILED'],
    'collector pending' => [['status' => 'RUNNING'], true, 'PENDING'],
    'import pending' => [['import_status' => 'QUEUED'], true, 'PENDING'],
    'projection pending' => [['projection_status' => 'QUEUED'], true, 'PENDING'],
]);

test('latest attempted successful and coverage eligible are distinct and older evidence never silently replaces a newer attempt', function (array $changes, string $state, bool $successful) {
    ['fixture' => $fixture, 'job' => $job] = sourceCompletenessFixture();
    $latest = ReportJob::factory()->create([...$job->only(['source', 'report_type', 'report_mode', 'customer_account', 'date_from', 'date_thru', 'file_checksum', 'status', 'import_status', 'projection_status']), ...$changes]);
    $coverage = app(AssessPickupReportCoverage::class)->handle($fixture['task']);

    expect($coverage)->toMatchArray(['complete' => false, 'state' => $state, 'reports' => []]);
    expect($coverage['requirements'][0])->toMatchArray(['latest_attempt_id' => $latest->id,
        'latest_successful_id' => $successful ? $latest->id : $job->id, 'latest_coverage_eligible_id' => $job->id]);
})->with([
    'new pending' => [['status' => 'QUEUED'], 'PENDING', false],
    'new failed' => [['status' => 'FAILED'], 'FAILED', false],
    'new subset' => [['parameters' => ['awbs' => ['000MANUAL1']]], 'SUBSET_COLLECTION', true],
    'new corrupt checksum' => [['file_checksum' => 'corrupt'], 'UNKNOWN', true],
    'new export limit' => [['row_count' => 6000], 'UNKNOWN', true],
]);

test('early morning JNE entries retain the pickup operational day but require each source calendar date', function () {
    ['fixture' => $fixture, 'job' => $job] = sourceCompletenessFixture();
    $this->travelTo('2026-10-26 20:00:00 UTC');
    JneReportAwb::where('report_job_id', $job->id)->update(['entry_at' => '2026-10-26 19:00:00']);
    $job->update(['date_from' => '2026-10-27', 'date_thru' => '2026-10-27', 'started_at' => now(),
        'parameters' => ['collection_evidence' => pickupAutomationCollectionEvidence('2026-10-27', '2026-10-27', 1)]]);
    $missing = app(AssessPickupReportCoverage::class)->handle($fixture['task']);
    expect($missing)->toMatchArray(['complete' => false, 'required_dates' => ['2026-10-26', '2026-10-27']]);
    expect(collect($missing['requirements'])->firstWhere('date', '2026-10-26'))->toMatchArray(['date' => '2026-10-26', 'latest_attempt_id' => null, 'state' => 'UNKNOWN']);

    $daytime = importPickupAutomationReport($fixture, 0, 0, '2026-10-26');
    expect(app(AssessPickupReportCoverage::class)->handle($fixture['task']))->toMatchArray(['complete' => true, 'reports' => [$daytime->id, $job->id]]);
});

test('a collection cutoff after midnight requires the second calendar date even when no next morning AWB is known yet', function () {
    ['fixture' => $fixture, 'job' => $job] = sourceCompletenessFixture();
    $this->travelTo('2026-10-26 19:00:00 UTC');
    $job->update(['started_at' => now()]);
    $missing = app(AssessPickupReportCoverage::class)->handle($fixture['task']);
    expect($missing)->toMatchArray(['complete' => false, 'required_dates' => ['2026-10-26', '2026-10-27']]);

    $morning = importPickupAutomationReport($fixture, 0, 0, '2026-10-27');
    expect(app(AssessPickupReportCoverage::class)->handle($fixture['task']))->toMatchArray(['complete' => true,
        'cutoff_at' => '2026-10-26T19:00:00+00:00', 'reports' => [$job->id, $morning->id]]);
});

test('a report collected before pickup cannot establish a fresh collection cutoff', function () {
    ['fixture' => $fixture, 'job' => $job] = sourceCompletenessFixture();
    $job->update(['started_at' => now()->subHours(4)]);

    expect(app(AssessPickupReportCoverage::class)->handle($fixture['task']))->toMatchArray(['complete' => false, 'state' => 'UNKNOWN']);
});

test('a different account cannot fill a missing required source and account scoped coverage never assigns unknown customers', function () {
    ['fixture' => $fixture, 'job' => $job] = sourceCompletenessFixture();
    $unknown = JneReportAwb::factory()->create(['report_job_id' => $job->id, 'awb' => 'UNIDENTIFIED1', 'shipper_name' => 'UNIDENTIFIED SENDER',
        'entry_at' => '2026-10-26 03:00:00', 'raw_data' => ['SHIPPER_NAME' => 'UNIDENTIFIED SENDER']]);
    app(ProjectJneShipments::class)->handle($job->id);
    $job->update(['customer_account' => 'OTHER_ACCOUNT']);

    expect(app(AssessPickupReportCoverage::class)->handle($fixture['task'])['complete'])->toBeFalse();
    expect(JneShipment::where('awb', $unknown->awb)->sole()->customer_id)->toBeNull();
});

test('unscoped automatic requirements do not prove a shared account is covered', function () {
    ['fixture' => $fixture] = sourceCompletenessFixture();
    $fixture['contract']->update(['definition' => [...$fixture['contract']->definition, 'collection_requirements' => ['apex:apex']]]);

    expect(app(AssessPickupReportCoverage::class)->handle($fixture['task']))->toMatchArray(['complete' => false, 'state' => 'UNKNOWN']);
});

test('a generated report cannot prove full coverage with imported evidence outside its requested scope', function (array $changes) {
    ['fixture' => $fixture, 'job' => $job] = sourceCompletenessFixture();
    JneReportAwb::where('report_job_id', $job->id)->update($changes);

    $coverage = app(AssessPickupReportCoverage::class)->handle($fixture['task']);
    expect($coverage)->toMatchArray(['complete' => false, 'state' => 'UNKNOWN']);
    expect(collect($coverage['requirements'])->flatMap(fn (array $row): array => $row['reasons'])->all())->toContain('Bukti CSV berisi tanggal/account di luar cakupan permintaan atau tanggal entry belum tersedia.');
})->with([
    'foreign account' => [['customer_account' => 'FOREIGN_ACCOUNT']],
    'outside source day' => [['entry_at' => '2026-10-25 03:00:00']],
    'missing entry date' => [['entry_at' => null]],
]);

test('combined Hybrid retains a child manifest without manufacturing pagination completeness', function () {
    Storage::fake('jne_reports');
    $batch = ReportJob::factory()->create(['source' => 'hybrid', 'report_type' => 'combined', 'customer_account' => 'HYBRID_PM',
        'status' => 'COLLECTING_SOURCES', 'date_from' => '2026-10-26', 'date_thru' => '2026-10-26']);
    foreach (['cashless' => 'CM00001', 'manual' => '01010001'] as $type => $awb) {
        $file = $type.'.csv';
        Storage::disk('jne_reports')->put($file, $awb);
        ReportJob::factory()->create(['source' => 'roberto', 'report_type' => $type, 'customer_account' => 'HYBRID_PM', 'hybrid_batch_id' => $batch->id,
            'date_from' => '2026-10-26', 'date_thru' => '2026-10-26', 'status' => 'SOURCE_SAVED', 'source_file_path' => $file,
            'source_file_checksum' => hash('sha256', $awb), 'source_row_count' => 1, 'awb_count' => 1, 'parameters' => ['awbs' => [$awb]]]);
    }
    app(CombineHybridReports::class)->handle($batch->id);
    $batch->refresh();
    $manifest = $batch->parameters['collection_manifest'];
    expect($manifest)->toMatchArray(['state' => 'UNKNOWN', 'pagination_complete' => null, 'source_total_verified' => false,
        'required_children' => ['roberto:cashless', 'roberto:manual'], 'enrichment_scope' => 'SUBSET_COLLECTION']);
    expect(array_column($manifest['children'], 'checksum'))->toBe([hash('sha256', 'CM00001'), hash('sha256', '01010001')]);
    $parameters = $batch->parameters;
    app(CombineHybridReports::class)->handle($batch->id);
    expect($batch->fresh()->parameters)->toBe($parameters);
    $batch->update(['status' => 'COMPLETED', 'import_status' => 'IMPORTED', 'projection_status' => 'PROJECTED', 'file_checksum' => hash('sha256', 'enriched'),
        'parameters' => [...$parameters, 'collection_manifest' => [...$manifest, 'state' => 'FULL_COLLECTION', 'pagination_complete' => true]]]);
    expect(app(AssessJneReportCollection::class)->handle($batch->fresh(), null))->toMatchArray(['complete' => false, 'state' => 'UNKNOWN']);
});

test('unsupported full Hybrid contracts can be drafted but not verified or activated and leave no partial activation', function () {
    $admin = User::factory()->create(['role' => 'admin_supervisor', 'is_active' => true]);
    $definition = ['automatic_reconciliation' => true, 'collection_mode' => 'complete_date_report', 'customer_code_column' => 'CODE',
        'pickup_date_column' => 'TGL_ENTRY', 'collection_requirements' => ['hybrid:combined:HYBRID_PM']];
    $body = ['kind' => 'contract', 'source' => 'hybrid', 'report_type' => 'combined', 'definition' => $definition, 'reason' => 'Draft awaiting collector pagination evidence', 'verified' => false];
    $this->actingAs($admin)->postJson(route('jne-evidence.store'), $body)->assertRedirect();
    $draft = JneSourceContract::sole();
    expect($draft->active_key)->toBeNull();
    $this->postJson(route('jne-evidence.store'), [...$body, 'verified' => true])->assertUnprocessable()
        ->assertJsonPath('message', 'Kontrak full collection belum dapat diaktifkan: kemampuan sumber belum diverifikasi secara independen. Simpan sebagai draft.');
    $this->postJson(route('jne-evidence.activate'), ['kind' => 'contract', 'id' => $draft->id, 'version' => 1, 'reason' => 'Attempt unsupported activation'])->assertUnprocessable();
    expect($draft->fresh()->active_key)->toBeNull();
    $this->assertDatabaseCount('jne_source_contracts', 1);
    $this->assertDatabaseCount('jne_evidence_rule_events', 1);
});

test('automatic contract verification requires explicit supported source accounts and still permits reviewed APEX date contracts', function () {
    pickupAutomationCapability('SHARED_ACCOUNT');
    Queue::fake([SyncJneCustomerMappings::class]);
    $admin = User::factory()->create(['role' => 'admin_supervisor', 'is_active' => true]);
    $body = ['kind' => 'contract', 'source' => 'apex', 'report_type' => 'apex', 'reason' => 'Reviewed synthetic generated date report only', 'verified' => true,
        'definition' => ['automatic_reconciliation' => true, 'collection_mode' => 'complete_date_report', 'customer_code_column' => 'CODE', 'pickup_date_column' => 'TGL_ENTRY', 'collection_requirements' => ['apex:apex']]];
    $this->actingAs($admin)->postJson(route('jne-evidence.store'), $body)->assertUnprocessable();
    $this->assertDatabaseCount('jne_source_contracts', 0);
    $body['definition']['collection_requirements'] = ['apex:apex:SHARED_ACCOUNT'];
    $this->postJson(route('jne-evidence.store'), $body)->assertRedirect();
    expect(JneSourceContract::sole()->verified_by)->toBe($admin->id);
    Queue::assertPushed(SyncJneCustomerMappings::class, 1);
});
