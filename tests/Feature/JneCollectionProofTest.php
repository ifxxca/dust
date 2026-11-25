<?php

use App\Actions\Pickup\AssessPickupReportCoverage;
use App\Actions\Reports\AssessJneCollectionProof;
use App\Actions\Reports\AssessJneReportCollection;
use App\Actions\Reports\ImportReportAwbs;
use App\Actions\Reports\ProjectJneShipments;
use App\Models\JneSourceContract;
use App\Models\ReportJob;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

require_once __DIR__.'/../Fixtures/pickup-automation.php';

beforeEach(function () {
    $this->travelTo('2026-10-26 12:00:00 UTC');
    Storage::fake('jne_reports');
    Queue::fake();
    config(['jne-reports.evidence_policies_enabled' => true, 'jne-reports.category_reconciliation_enabled' => true,
        'jne-reports.collection_attestation_enabled' => false, 'jne-reports.collection_capabilities' => [],
        'jne-reports.worker_token' => str_repeat('m1-fixture-token', 4), 'jne-reports.worker_id' => 'jne-report-1']);
});

test('verified APEX contracts alone cannot certify an unverified source capability', function () {
    $fixture = pickupAutomationFixture(1, 0);
    $job = importPickupAutomationReport($fixture, 1, 0);
    config(['jne-reports.collection_capabilities' => []]);

    expect(app(AssessPickupReportCoverage::class)->handle($fixture['task']))->toMatchArray(['complete' => false, 'state' => 'UNKNOWN']);
    expect(app(AssessJneReportCollection::class)->handle($job, $fixture['contract'])['complete'])->toBeFalse();
    $admin = $fixture['admin'];
    $this->actingAs($admin)->postJson(route('jne-evidence.store'), ['kind' => 'contract', 'source' => 'apex', 'report_type' => 'apex',
        'verified' => true, 'definition' => $fixture['contract']->definition, 'reason' => 'Cannot self-certify a source capability'])->assertUnprocessable()
        ->assertJsonPath('message', 'Kontrak full collection belum dapat diaktifkan: kemampuan sumber belum diverifikasi secara independen. Simpan sebagai draft.');
    expect(JneSourceContract::sole()->revision)->toBe(1);
});

test('coverage requires independent source totals intact files and consistent imported counts even under a reviewed fixture capability', function (string $defect) {
    $fixture = pickupAutomationFixture(1, 0);
    $job = importPickupAutomationReport($fixture, 1, 0);
    $parameters = $job->parameters;
    match ($defect) {
        'truncated' => $parameters['collection_evidence']['before']['total_label'] = '2',
        'source changed' => $parameters['collection_evidence']['after']['total_label'] = '2',
        'missing upstream total' => $parameters['collection_evidence']['before']['total_label'] = null,
        'wrong account scope' => $parameters['collection_evidence']['before']['scope'] = 'OTHER_ACCOUNT',
        'wrong date scope' => $parameters['collection_evidence']['after']['date_thru'] = '2026-10-27',
        'filter retained' => $parameters['collection_evidence']['before']['filters_clear'] = false,
        'history changed' => $parameters['collection_evidence']['after']['history_id'] = 'OTHER_ARTIFACT',
        'unreviewed origin' => $parameters['collection_evidence']['origin'] = 'https://other.invalid',
        'synthesized zero' => $parameters['collection_evidence']['synthesized'] = true,
        'no proof' => $parameters = [],
        'file lost' => Storage::disk('jne_reports')->delete($job->file_path),
        'file altered' => Storage::disk('jne_reports')->put($job->file_path, 'different contents'),
        'import mismatch' => $job->update(['imported_awb_count' => 0]),
        'export cap' => config(['jne-reports.collection_capabilities.apex:apex:SIM_AUTO_ACCOUNT.export_limit' => 1]),
        'national scope' => $job->update(['national_account' => 'Y']),
    };
    $job->update(['parameters' => $parameters]);

    $result = app(AssessJneReportCollection::class)->handle($job->fresh(), $fixture['contract']);
    expect($result)->toMatchArray(['complete' => false, 'state' => 'UNKNOWN']);
    expect($result['reasons'])->not->toBeEmpty();
})->with(['truncated', 'source changed', 'missing upstream total', 'wrong account scope', 'wrong date scope', 'filter retained',
    'history changed', 'unreviewed origin', 'synthesized zero', 'no proof', 'file lost', 'file altered', 'import mismatch', 'export cap', 'national scope']);

test('an Orion-only authoritative capability cannot certify a required manual category', function () {
    $fixture = pickupAutomationFixture(1, 0);
    importPickupAutomationReport($fixture, 1, 0);
    config(['jne-reports.collection_capabilities.apex:apex:SIM_AUTO_ACCOUNT.categories' => ['css_orion']]);

    $result = app(AssessPickupReportCoverage::class)->handle($fixture['task']);
    expect($result['complete'])->toBeFalse();
    expect(collect($result['requirements'])->flatMap(fn (array $row): array => $row['reasons'])->all())
        ->toContain('Sumber coverage belum terbukti mencakup seluruh kategori paket yang diwajibkan POP.');
});

test('full APEX evidence travels through owned upload import and projection before coverage can become eligible', function () {
    $fixture = pickupAutomationFixture(1, 0);
    $job = ReportJob::factory()->create(['created_by' => $fixture['admin']->id, 'customer_account' => 'SIM_AUTO_ACCOUNT', 'date_from' => '2026-10-26', 'date_thru' => '2026-10-26']);
    $headers = ['Authorization' => 'Bearer '.config('jne-reports.worker_token'), 'X-Worker-ID' => 'jne-report-1'];
    $claim = $this->postJson(route('internal.report-jobs.claim'), ['claim_key' => (string) Str::uuid()], $headers)->assertOk()->json('data.claim_token');
    $headers['X-Report-Claim'] = $claim;
    foreach (['WAITING_REPORT', 'DOWNLOADING'] as $status) {
        $this->postJson(route('internal.report-jobs.progress', $job), ['status' => $status], $headers)->assertOk();
    }
    $proof = pickupAutomationCollectionEvidence('2026-10-26', '2026-10-26', 1);
    $csv = "AWB,ID_ACCOUNT,CUSTOMER_CODE,SHIPPER_NAME,TGL_ENTRY,PROCESS_TYPE\n000MANUAL1,SIM_AUTO_ACCOUNT,4000,VANNY,2026-10-26 10:00:00,MANUAL\n";
    $payload = fn (array $evidence): array => ['file' => UploadedFile::fake()->createWithContent('source.csv', $csv), 'collection_evidence' => json_encode($evidence)];
    $this->postJson(route('internal.report-jobs.upload', $job), $payload($proof), $headers)->assertOk();
    expect($job->fresh()->parameters['collection_evidence'])->toBe($proof);
    expect(app(AssessPickupReportCoverage::class)->handle($fixture['task'])['complete'])->toBeFalse();
    app(ImportReportAwbs::class)->handle($job->id);
    app(ProjectJneShipments::class)->handle($job->id);
    expect(app(AssessPickupReportCoverage::class)->handle($fixture['task']))->toMatchArray(['complete' => true, 'reports' => [$job->id]]);
    $changed = $proof;
    $changed['after']['total_label'] = '2';
    $this->postJson(route('internal.report-jobs.upload', $job), $payload($changed), $headers)->assertConflict();
    expect($job->fresh()->parameters['collection_evidence'])->toBe($proof);
});

/** @return array{ReportJob, array<string, mixed>} */
function hybridCollectionProofFixture(int $rows, string $label, bool $empty = false): array
{
    $content = "Cnote no,Date\n";
    for ($i = 1; $i <= $rows; $i++) {
        $content .= '0101000'.$i.",26-OCT-2026 12:00\n";
    }
    Storage::disk('jne_reports')->put('m1-hybrid.csv', $content);
    $scope = ['date_from' => '2026-10-26', 'date_thru' => '2026-10-26', 'scope' => 'ALL_USERS',
        'filters_clear' => true, 'total_label' => $label, 'empty' => $empty];
    $proof = ['version' => 1, 'protocol' => 'hybrid_ir_total_v1', 'origin' => 'https://fixture.invalid', 'before' => $scope, 'after' => $scope, 'synthesized' => false];
    $job = ReportJob::factory()->create(['source' => 'roberto', 'report_type' => 'manual', 'customer_account' => 'HYBRID_PM',
        'date_from' => '2026-10-26', 'date_thru' => '2026-10-26', 'status' => 'SOURCE_SAVED', 'source_file_path' => 'm1-hybrid.csv',
        'source_file_checksum' => hash('sha256', $content), 'source_row_count' => $rows, 'parameters' => ['collection_evidence' => $proof]]);

    return [$job, $proof];
}

test('Hybrid export completeness uses upstream total rather than visible page size and never certifies date semantics by itself', function (int $rows, string $label, bool $empty, bool $verified) {
    [$job] = hybridCollectionProofFixture($rows, $label, $empty);

    expect(app(AssessJneCollectionProof::class)->handle($job)['complete'])->toBe($verified);
    expect(app(AssessJneReportCollection::class)->handle($job, null))->toMatchArray(['complete' => false, 'state' => 'UNKNOWN']);
})->with([
    'full export beyond first page' => [2, '1 - 1 of 2', false, true],
    'truncated export' => [1, '1 - 1 of 2', false, false],
    'unknown total' => [2, '1 - 2 of more than 2', false, false],
    'live Hybrid pagination without total' => [2, '1 - 2', false, false],
    'wrong start page' => [2, '2 - 2 of 2', false, false],
    'impossible range' => [2, '1 - 3 of 2', false, false],
    'zero rows with upstream proof' => [0, 'No data found.', true, true],
    'zero rows without upstream proof' => [0, 'No data found.', false, false],
]);

test('Hybrid upload binds proof to owned file and preserves immutable evidence on retries', function () {
    $scope = ['date_from' => '2026-10-26', 'date_thru' => '2026-10-26', 'scope' => 'ALL_USERS', 'filters_clear' => true, 'total_label' => '1 - 1 of 1', 'empty' => false];
    $proof = ['version' => 1, 'protocol' => 'hybrid_ir_total_v1', 'origin' => 'https://fixture.invalid', 'before' => $scope, 'after' => $scope, 'synthesized' => false];
    $job = ReportJob::factory()->create(['source' => 'roberto', 'report_type' => 'manual', 'customer_account' => 'HYBRID_PM', 'date_from' => '2026-10-26', 'date_thru' => '2026-10-26']);
    $headers = ['Authorization' => 'Bearer '.config('jne-reports.worker_token'), 'X-Worker-ID' => 'hybrid-roberto'];
    $claim = $this->postJson(route('internal.report-jobs.claim'), ['claim_key' => (string) Str::uuid()], $headers)->assertOk()->json('data.claim_token');
    $headers['X-Report-Claim'] = $claim;
    foreach (['WAITING_REPORT', 'DOWNLOADING'] as $status) {
        $this->postJson(route('internal.report-jobs.progress', $job), ['status' => $status], $headers)->assertOk();
    }
    $payload = fn (array $evidence): array => ['file' => UploadedFile::fake()->createWithContent('source.csv', "Cnote no,Date\n01010001,26-OCT-2026 12:00\n"), 'collection_evidence' => json_encode($evidence)];

    $this->postJson(route('internal.report-jobs.source-upload', $job), $payload([...$proof, 'state' => 'FULL_COLLECTION']), $headers)->assertUnprocessable();
    expect($job->fresh()->source_file_path)->toBeNull();
    $this->postJson(route('internal.report-jobs.source-upload', $job), $payload($proof), [...$headers, 'X-Report-Claim' => 'wrong-claim'])->assertForbidden();
    $this->postJson(route('internal.report-jobs.source-upload', $job), $payload($proof), $headers)->assertOk();
    $stored = $job->fresh()->parameters;
    expect($stored['collection_evidence'])->toBe($proof);
    expect(app(AssessJneCollectionProof::class)->handle($job->fresh())['complete'])->toBeTrue();
    $this->postJson(route('internal.report-jobs.source-upload', $job), $payload($proof), $headers)->assertOk();
    $reordered = array_reverse($proof, true);
    $reordered['before'] = array_reverse($proof['before'], true);
    $this->postJson(route('internal.report-jobs.source-upload', $job), $payload($reordered), $headers)->assertOk();
    $changed = $proof;
    $changed['after']['total_label'] = '1 - 1 of 2';
    $this->postJson(route('internal.report-jobs.source-upload', $job), $payload($changed), $headers)->assertConflict();
    expect($job->fresh()->parameters)->toBe($stored);
});
