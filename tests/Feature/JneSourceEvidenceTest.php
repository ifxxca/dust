<?php

use App\Actions\Reports\ImportReportAwbs;
use App\Models\JneReportAwb;
use App\Models\JneSourceContract;
use App\Models\ReportJob;
use App\Models\User;
use Illuminate\Support\Facades\Storage;

function evidenceReport(string $csv, string $source = 'apex', string $type = 'apex'): ReportJob
{
    $job = ReportJob::factory()->create(['source' => $source, 'report_type' => $type, 'status' => 'COMPLETED', 'file_checksum' => hash('sha256', $csv), 'file_path' => 'evidence/'.fake()->uuid().'.csv']);
    Storage::disk('jne_reports')->put($job->file_path, $csv);

    return $job;
}

beforeEach(function () {
    Storage::fake('jne_reports');
});

test('source code capture stays disabled without an activated verified source contract', function () {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    JneSourceContract::factory()->create(['definition' => ['customer_code_column' => 'RETAIL_CODE_FIXTURE'], 'active_key' => JneSourceContract::key('apex', 'apex'), 'verified_by' => $admin->id, 'verified_at' => now()]);
    $csv = "AWB,ID_ACCOUNT,RETAIL_CODE_FIXTURE\n001,TESTACCOUNT,4000A\n";
    $job = evidenceReport($csv);
    app(ImportReportAwbs::class)->handle($job->id);
    expect(JneReportAwb::sole()->original_customer_code)->toBeNull();
    expect(JneReportAwb::sole()->raw_data['RETAIL_CODE_FIXTURE'])->toBe('4000A');
});

test('verified synthetic code extraction preserves the exact original without treating accounts as customer codes', function () {
    config(['jne-reports.evidence_policies_enabled' => true]);
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $contract = JneSourceContract::factory()->create(['definition' => ['customer_code_column' => 'RETAIL_CODE_FIXTURE'], 'active_key' => JneSourceContract::key('apex', 'apex'), 'verified_by' => $admin->id, 'verified_at' => now()]);
    $job = evidenceReport("AWB,ID_ACCOUNT,RETAIL_CODE_FIXTURE\n001,TESTACCOUNT,'004000A\n");
    app(ImportReportAwbs::class)->handle($job->id);
    app(ImportReportAwbs::class)->handle($job->id);
    $row = JneReportAwb::sole();
    expect($row->original_customer_code)->toBe("'004000A")->and($row->customer_account)->toBe('TESTACCOUNT');
    expect($row->source_evidence['contract']['id'])->toBe($contract->id);
    expect($row->raw_data['RETAIL_CODE_FIXTURE'])->toBe("'004000A");
    $this->assertDatabaseCount('jne_report_awbs', 1);
});

test('one standardized AWB retains all Hybrid process origins after merge deduplication', function () {
    config(['jne-reports.source_provenance_enabled' => true]);
    $job = evidenceReport("AWB,ID_ACCOUNT\n001,SHARED\n", 'hybrid', 'combined');
    foreach (['cashless', 'manual'] as $type) {
        ReportJob::factory()->create(['hybrid_batch_id' => $job->id, 'source' => 'roberto', 'report_type' => $type, 'status' => 'SOURCE_SAVED', 'parameters' => ['awbs' => ['001']], 'source_file_checksum' => hash('sha256', $type)]);
    }
    app(ImportReportAwbs::class)->handle($job->id);
    $origins = JneReportAwb::sole()->source_evidence['hybrid_origins'];
    expect(array_column($origins, 'report_type'))->toBe(['cashless', 'manual']);
    expect(array_column($origins, 'checksum'))->toBe([hash('sha256', 'cashless'), hash('sha256', 'manual')]);
    expect(JneReportAwb::sole()->original_customer_code)->toBeNull();
});
