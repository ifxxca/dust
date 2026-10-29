<?php

use App\Actions\Handover\CloseSession;
use App\Actions\Handover\CreateSession;
use App\Actions\Handover\VerifyItem;
use App\Actions\Pickup\ReconcilePickupProcessing;
use App\Actions\Reports\ImportReportAwbs;
use App\Actions\Reports\ProjectJneShipments;
use App\Models\Customer;
use App\Models\JneShipment;
use App\Models\JneSourceContract;
use App\Models\PickupTask;
use App\Models\ReportJob;
use App\Models\User;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

test('two customer operational flow retains closed handover quantities across late shared account imports and replay', function () {
    Http::preventStrayRequests();
    Queue::fake();
    Storage::fake('local');
    Storage::fake('jne_reports');
    config(['pickup.automation.enabled' => false, 'jne-reports.evidence_policies_enabled' => true, 'jne-reports.category_reconciliation_enabled' => true]);
    $this->travelTo('2026-10-26 16:30:00 UTC');
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $staff = User::factory()->create(['role' => 'pickup_staff']);
    $tasks = new Collection;
    $csv = "AWB,ID_ACCOUNT,CUSTOMER_CODE,SHIPPER_NAME,STATUS_WEB,TGL_ENTRY,PROCESS_TYPE,QTY\n";
    foreach ([4001, 4002] as $code) {
        $customerId = $this->actingAs($admin)->postJson(route('api.customers.store'), ['name' => 'Validation '.$code, 'pickup_address' => 'Fixture address', 'contact' => 'fixture@example.test'])->assertCreated()->json('data.id');
        Customer::whereKey($customerId)->update(['customer_code' => (string) $code]);
        $taskId = $this->postJson(route('api.tasks.store'), ['customer_id' => $customerId, 'pickup_address' => 'Fixture address', 'scheduled_at' => '2026-10-26T23:30:00+07:00'])->assertCreated()->json('data.id');
        $task = PickupTask::findOrFail($taskId);
        $this->postJson(route('api.tasks.assign', $task), ['assigned_staff_id' => $staff->id, 'expected_version' => 1])->assertOk();
        $this->actingAs($staff)->postJson(route('api.tasks.start', $task), ['expected_version' => 2])->assertCreated();
        $this->postJson(route('api.tasks.visit', $task), ['expected_version' => 3, 'outcome' => 'COLLECTED'])->assertOk();
        $body = ['expected_version' => 4, 'submission_key' => (string) Str::uuid(), 'manual_hybrid' => 2, 'cashless_hybrid' => 1, 'css_orion' => 1,
            'cashless_capture' => true, 'cashless_awbs' => ['TGVALID'.$code], 'signature' => UploadedFile::fake()->image('signature.png')];
        $this->postJson(route('api.tasks.proof', $task), $body)->assertCreated()->assertJsonPath('data.total', 4);
        $this->postJson(route('api.tasks.proof', $task), $body)->assertOk();
        foreach (['MANUAL' => ['M'.$code.'A', 'M'.$code.'B'], 'CASHLESS' => ['TGVALID'.$code], 'ORION' => ['O'.$code]] as $category => $awbs) {
            foreach ($awbs as $awb) {
                $csv .= $awb.',SHARED_VALIDATION,'.$code.',Wrong Shipper,ON PROCESS,2026-10-26 23:30:00,'.$category.",5\n";
            }
        }
        $tasks->push($task->fresh());
    }
    $session = app(CreateSession::class)->handle($staff, $tasks->modelKeys(), (string) Str::uuid());
    foreach ($session->items as $item) {
        $session = app(VerifyItem::class)->handle($admin, $session->id, $item->id, ['expected_version' => $session->version, 'manual_hybrid' => 2, 'cashless_hybrid' => 1, 'css_orion' => 1]);
    }
    $session = app(CloseSession::class)->handle($admin, $session->id, $session->version);
    $baselines = $tasks->mapWithKeys(fn (PickupTask $task): array => [$task->id => $task->proof->getAttributes()]);
    $sessionVersion = $session->version;
    $this->travelTo('2026-10-26 17:30:00 UTC');
    JneSourceContract::factory()->create(['source' => 'apex', 'report_type' => 'apex', 'active_key' => JneSourceContract::key('apex', 'apex'), 'verified_by' => $admin->id, 'verified_at' => now(),
        'definition' => ['customer_code_column' => 'CUSTOMER_CODE', 'category_column' => 'PROCESS_TYPE', 'category_values' => ['MANUAL' => 'manual_hybrid', 'CASHLESS' => 'cashless_hybrid', 'ORION' => 'css_orion'],
            'automatic_reconciliation' => true, 'pickup_date_column' => 'TGL_ENTRY', 'collection_mode' => 'complete_date_report', 'collection_requirements' => ['apex:apex:SHARED_VALIDATION']]]);
    Storage::disk('jne_reports')->put('validation.csv', $csv);
    $report = ReportJob::factory()->create(['status' => 'COMPLETED', 'customer_account' => 'SHARED_VALIDATION', 'date_from' => '2026-10-26', 'date_thru' => '2026-10-26', 'started_at' => now(), 'completed_at' => now(), 'file_path' => 'validation.csv', 'file_checksum' => hash('sha256', $csv)]);
    foreach ([1, 2] as $attempt) {
        app(ImportReportAwbs::class)->handle($report->id);
        app(ProjectJneShipments::class)->handle($report->id);
        foreach ($tasks as $task) {
            expect(app(ReconcilePickupProcessing::class)->handle($task->id)->status)->toBe('DONE');
        }
    }
    foreach ($tasks as $task) {
        expect($task->proof->fresh()->getAttributes())->toBe($baselines[$task->id]);
        expect(JneShipment::where('customer_id', $task->customer_id)->where('pickup_task_id', $task->id)->count())->toBe(4);
    }
    expect($session->fresh()->status)->toBe('CLOSED');
    expect($session->fresh()->version)->toBe($sessionVersion);
    $this->assertDatabaseCount('pickup_records', 2);
    $this->assertDatabaseCount('pickup_cashless_awbs', 2);
    $this->assertDatabaseCount('jne_report_awbs', 8);
    $this->assertDatabaseCount('jne_shipment_observations', 8);
    $this->assertDatabaseCount('pickup_awb_manifests', 2);
    Http::assertNothingSent();
});
