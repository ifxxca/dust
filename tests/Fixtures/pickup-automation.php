<?php

use App\Actions\Handover\CreateSession;
use App\Actions\Handover\VerifyItem;
use App\Actions\Reports\ImportReportAwbs;
use App\Actions\Reports\ProjectJneShipments;
use App\Models\Customer;
use App\Models\JneSourceContract;
use App\Models\PickupRecord;
use App\Models\PickupTask;
use App\Models\ReportJob;
use App\Models\User;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/** @return array{admin: User, customer: Customer, task: PickupTask, contract: JneSourceContract} */
function pickupAutomationFixture(int $manual = 2, int $orion = 1): array
{
    $admin = User::factory()->create(['role' => 'admin_supervisor', 'is_active' => true]);
    $customer = Customer::factory()->create(['created_by' => $admin->id, 'customer_code' => '4000', 'name' => 'Vanny', 'is_active' => true]);
    $task = PickupTask::factory()->create(['customer_id' => $customer->id, 'customer_name_snapshot' => 'Vanny', 'status' => 'PICKED_UP', 'scheduled_at' => now(), 'created_by' => $admin->id]);
    PickupRecord::factory()->create(['pickup_task_id' => $task->id, 'manual_hybrid' => $manual, 'cashless_hybrid' => 0, 'css_orion' => $orion]);
    $session = app(CreateSession::class)->handle($admin, [$task->id], (string) Str::uuid());
    app(VerifyItem::class)->handle($admin, $session->id, $session->items()->sole()->id, ['expected_version' => 1, 'manual_hybrid' => $manual, 'cashless_hybrid' => 0, 'css_orion' => $orion]);
    $contract = JneSourceContract::factory()->create(['source' => 'apex', 'report_type' => 'apex', 'active_key' => JneSourceContract::key('apex', 'apex'), 'created_by' => $admin->id, 'verified_by' => $admin->id, 'verified_at' => now(),
        'definition' => ['customer_code_column' => 'CUSTOMER_CODE', 'category_column' => 'PROCESS_TYPE', 'category_values' => ['MANUAL' => 'manual_hybrid', 'ORION' => 'css_orion'],
            'automatic_reconciliation' => true, 'pickup_date_column' => 'TGL_ENTRY', 'collection_mode' => 'complete_date_report', 'collection_requirements' => ['apex:apex:SIM_AUTO_ACCOUNT']]]);

    return compact('admin', 'customer', 'task', 'contract');
}

/** @param array{admin: User, customer: Customer, task: PickupTask, contract: JneSourceContract} $fixture */
function importPickupAutomationReport(array $fixture, int $manual = 2, int $orion = 1, ?string $entryDate = null): ReportJob
{
    $stream = fopen('php://temp', 'w+b');
    fputcsv($stream, ['AWB', 'ID_ACCOUNT', 'CUSTOMER_CODE', 'SHIPPER_NAME', 'CONSIGNEE_NAME', 'STATUS_WEB', 'STATUS_POD', 'AWB_CANCEL', 'NOREF', 'TGL_ENTRY', 'PROCESS_TYPE', 'QTY'], ',', '"', '');
    foreach (['MANUAL' => $manual, 'ORION' => $orion] as $category => $count) {
        for ($index = 1; $index <= $count; $index++) {
            fputcsv($stream, ['000'.$category.$index, 'SIM_AUTO_ACCOUNT', '4000', 'VANNY', 'Penerima '.$index, 'ON PROCESS', '', 'N', '', ($entryDate ?? now()->toDateString()).' 10:00:00', $category, 3], ',', '"', '');
        }
    }
    rewind($stream);
    $csv = stream_get_contents($stream);
    fclose($stream);
    $path = 'automation-tests/'.Str::uuid().'.csv';
    Storage::disk('jne_reports')->put($path, $csv);
    $job = ReportJob::factory()->create(['created_by' => $fixture['admin']->id, 'customer_account' => 'SIM_AUTO_ACCOUNT', 'date_from' => $entryDate ?? now()->toDateString(), 'date_thru' => $entryDate ?? now()->toDateString(),
        'status' => 'COMPLETED', 'file_path' => $path, 'file_checksum' => hash('sha256', $csv), 'started_at' => now(), 'completed_at' => now()]);
    app(ImportReportAwbs::class)->handle($job->id);
    app(ProjectJneShipments::class)->handle($job->id);

    return $job->fresh();
}
