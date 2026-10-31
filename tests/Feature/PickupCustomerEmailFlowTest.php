<?php

use App\Jobs\DeliverPickupAwbManifestJob;
use App\Jobs\ImportJneReportAwbs;
use App\Models\CashlessEntryBatch;
use App\Models\Customer;
use App\Models\HandoverSession;
use App\Models\JneShipment;
use App\Models\JneSourceContract;
use App\Models\PickupAwbDelivery;
use App\Models\PickupAwbManifest;
use App\Models\PickupCashlessAwb;
use App\Models\PickupCustomerReconciliation;
use App\Models\PickupProcessingReconciliation;
use App\Models\PickupTask;
use App\Models\ReportJob;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Mail\Events\MessageSent;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

test('pickup lifecycle sends a POP receipt before the reconciled 20 manual and 30 cashless shipment recap', function () {
    $liveRecipient = getenv('PICKUP_FLOW_SMTP_TO') ?: null;
    $exportArtifacts = $liveRecipient !== null || getenv('PICKUP_FLOW_PREVIEW') === '1';
    expect(config('database.default'))->toBe('sqlite');
    expect(config('database.connections.sqlite.database'))->toBe(':memory:');
    if ($liveRecipient !== null) {
        expect(filter_var($liveRecipient, FILTER_VALIDATE_EMAIL))->not->toBeFalse();
        expect(config('mail.mailers.smtp.host'))->not->toBeEmpty();
        expect(config('mail.mailers.smtp.password'))->not->toBeEmpty();
    } else {
        $this->travelTo('2026-10-31 10:00:00 UTC');
    }
    $recipient = $liveRecipient ?? 'pickup-flow@example.test';
    Storage::fake('local');
    Storage::fake('jne_reports');
    config([
        'mail.default' => 'smtp', 'mail.mailers.smtp.transport' => $liveRecipient ? 'smtp' : 'array',
        'queue.default' => 'database', 'queue.connections.database.retry_after' => 120,
        'cache.default' => 'array', 'mobile-push.enabled' => false,
        'pickup.receipt_channel' => 'email', 'pickup.cashless_entry.enabled' => false,
        'pickup.automation.enabled' => false, 'pickup.automation.send_enabled' => true,
        'jne-reports.evidence_policies_enabled' => true, 'jne-reports.category_reconciliation_enabled' => true,
        'jne-reports.category_markers_enabled' => true,
    ]);
    app('mail.manager')->purge();
    $messages = [];
    $artifactRoot = base_path('output/pickup-email-flow/'.Str::uuid());
    if ($exportArtifacts) {
        File::ensureDirectoryExists($artifactRoot);
    }
    Event::listen(MessageSent::class, function (MessageSent $event) use (&$messages, $exportArtifacts, $artifactRoot): void {
        $messages[] = [
            'subject' => $event->message->getSubject(),
            'recipient' => $event->message->getTo()[0]->getAddress(),
            'message_id' => $event->sent->getMessageId(),
            'attachments' => array_map(fn ($part): string => $part->getFilename(), $event->message->getAttachments()),
        ];
        if ($exportArtifacts) {
            File::put($artifactRoot.'/messages.json', json_encode($messages, JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR));
            File::put($artifactRoot.'/email-'.count($messages).'.html', $event->message->getHtmlBody());
        }
    });
    $admin = User::factory()->create(['name' => 'Admin Uji Alur', 'role' => 'admin_supervisor', 'is_active' => true]);
    $staff = User::factory()->create(['name' => 'Petugas Uji Alur', 'role' => 'pickup_staff', 'is_active' => true]);
    $customerResponse = $this->actingAs($admin)->postJson(route('api.customers.store'), [
        'name' => 'Irfan [UJI COBA]', 'customer_code' => '999900', 'email' => $recipient,
        'pickup_address' => 'Alamat pickup contoh — pengujian alur email', 'is_active' => true,
    ])->assertCreated();
    $customer = Customer::findOrFail($customerResponse->json('data.id'));
    JneSourceContract::factory()->create([
        'source' => 'apex', 'report_type' => 'unresolved', 'active_key' => JneSourceContract::key('apex', 'unresolved'),
        'created_by' => $admin->id, 'verified_by' => $admin->id, 'verified_at' => now(),
        'definition' => ['customer_code_column' => 'CUSTOMER_CODE', 'pickup_date_column' => 'TGL_ENTRY',
            'category_column' => 'PROCESS_TYPE', 'category_values' => ['MANUAL' => 'manual_hybrid', 'CASHLESS' => 'cashless_hybrid'],
            'automatic_reconciliation' => true],
    ]);
    config(['pickup.automation.enabled' => true]);
    $created = $this->postJson(route('api.tasks.store'), [
        'customer_id' => $customer->id, 'pickup_address' => $customer->pickup_address,
        'scheduled_at' => now()->toIso8601String(), 'notes' => 'UJI ALUR EMAIL: 20 Manual, 30 Cashless; seluruh resi dummy.',
    ])->assertCreated()->assertJsonPath('data.status', 'SCHEDULED');
    $task = PickupTask::findOrFail($created->json('data.id'));
    $this->postJson(route('api.tasks.assign', $task), ['assigned_staff_id' => $staff->id, 'expected_version' => $task->version])->assertOk();
    $this->post(route('pickup-automation.preference', $task), [
        'expected_revision' => 0, 'enabled' => true, 'recipient' => $recipient, 'reason' => 'Pengujian dua email melalui alur operasional.',
    ])->assertRedirect();
    $this->actingAs($staff)->postJson(route('api.tasks.start', $task), ['expected_version' => $task->fresh()->version])->assertCreated();
    $this->postJson(route('api.tasks.visit', $task), ['expected_version' => $task->fresh()->version, 'outcome' => 'COLLECTED'])->assertOk();
    $manual = array_map(fn (int $number): string => '0101'.str_pad((string) $number, 12, '0', STR_PAD_LEFT), range(1, 20));
    $cashless = array_map(fn (int $number): string => 'TGSMTP'.str_pad((string) $number, 10, '0', STR_PAD_LEFT), range(1, 30));
    $proofPayload = [
        'expected_version' => $task->fresh()->version, 'submission_key' => (string) Str::uuid(),
        'manual_hybrid' => 20, 'cashless_hybrid' => 30, 'css_orion' => 0,
        'cashless_capture' => true, 'cashless_awbs' => $cashless,
        'signature' => UploadedFile::fake()->image('tanda-tangan-uji.png', 400, 160),
        'photos' => [UploadedFile::fake()->image('foto-paket-uji.jpg', 400, 300)],
        'notes' => 'UJI COBA: 50 paket dummy. Tanda tangan dan foto contoh; bukan bukti pickup aktual.',
    ];
    $this->postJson(route('api.tasks.proof', $task), $proofPayload)->assertCreated()
        ->assertJsonPath('data.total', 50)->assertJsonPath('data.receipt.status', 'ACCEPTED_BY_PROVIDER');
    expect($messages)->toHaveCount(1);
    expect($messages[0]['subject'])->toContain('Receipt Pickup');
    expect($messages[0]['attachments'])->toHaveCount(2);
    expect(PickupCashlessAwb::where('pickup_task_id', $task->id)->count())->toBe(30);
    expect(CashlessEntryBatch::sole()->status)->toBe('QUEUED');
    $this->postJson(route('api.tasks.proof', $task), $proofPayload)->assertOk();
    expect($messages)->toHaveCount(1);
    $handover = $this->postJson(route('api.handovers.store'), ['task_ids' => [$task->id], 'submission_key' => (string) Str::uuid()])->assertSuccessful();
    $session = HandoverSession::findOrFail($handover->json('data.id'));
    $item = $session->items()->sole();
    $this->actingAs($admin)->postJson(route('api.handovers.verify', ['session' => $session->id, 'item' => $item->id]), [
        'expected_version' => $session->version, 'manual_hybrid' => 20, 'cashless_hybrid' => 30, 'css_orion' => 0,
    ])->assertOk();
    $this->postJson(route('api.handovers.close', $session), ['expected_version' => $session->fresh()->version])->assertOk();
    expect($session->fresh()->status)->toBe('CLOSED');
    expect($messages)->toHaveCount(1);
    $stream = fopen('php://temp', 'w+');
    fputcsv($stream, ['AWB', 'ID_ACCOUNT', 'CUSTOMER_CODE', 'SHIPPER_NAME', 'CONSIGNEE_NAME', 'STATUS_WEB', 'STATUS_POD', 'AWB_CANCEL', 'NOREF', 'TGL_ENTRY', 'PROCESS_TYPE'], ',', '"', '');
    foreach (['MANUAL' => $manual, 'CASHLESS' => $cashless] as $category => $awbs) {
        foreach ($awbs as $index => $awb) {
            fputcsv($stream, [$awb, 'SMTP_FLOW_ACCOUNT', $customer->customer_code, $customer->customer_code.' '.$customer->name, 'Penerima Uji '.($index + 1),
                'ON PROCESS', '', 'N', $task->reference, now()->timezone(config('pickup.timezone'))->format('Y-m-d H:i:s'), $category], ',', '"', '');
        }
    }
    rewind($stream);
    $csv = stream_get_contents($stream);
    fclose($stream);
    $path = 'smtp-flow/dummy-report.csv';
    Storage::disk('jne_reports')->put($path, $csv);
    $job = ReportJob::factory()->create([
        'source' => 'apex', 'report_type' => 'unresolved', 'report_mode' => 'A', 'created_by' => $admin->id,
        'customer_account' => 'SMTP_FLOW_ACCOUNT', 'date_from' => now()->toDateString(), 'date_thru' => now()->toDateString(),
        'status' => 'COMPLETED', 'file_path' => $path, 'file_checksum' => hash('sha256', $csv), 'started_at' => now(), 'completed_at' => now(),
    ]);
    ImportJneReportAwbs::dispatch($job->id)->onQueue('reports-import');
    Artisan::call('queue:work', ['connection' => 'database', '--queue' => 'reports-import,default,reconciliation,documents,deliveries',
        '--stop-when-empty' => true, '--sleep' => 0, '--tries' => 1, '--max-jobs' => 100, '--max-time' => 50]);
    expect($job->fresh()->workflowStage())->toBe('READY');
    expect(DB::table('failed_jobs')->count())->toBe(0);
    expect(JneShipment::where('pickup_task_id', $task->id)->where('category', 'manual_hybrid')->count())->toBe(20);
    expect(JneShipment::where('pickup_task_id', $task->id)->where('category', 'cashless_hybrid')->count())->toBe(30);
    $result = PickupProcessingReconciliation::where('pickup_task_id', $task->id)->sole();
    expect($result->status)->toBe('DONE');
    expect(PickupCustomerReconciliation::sole()->status)->toBe('DONE');
    $manifest = PickupAwbManifest::sole();
    expect($manifest->status)->toBe('READY');
    expect(DB::table('pickup_awb_manifest_items')->where('pickup_awb_manifest_id', $manifest->id)->count())->toBe(50);
    expect(Storage::disk('local')->get($manifest->pdf_path))->toStartWith('%PDF-');
    $delivery = PickupAwbDelivery::sole();
    expect($delivery->status)->toBe('ACCEPTED');
    expect($messages)->toHaveCount(2);
    expect($messages[1]['subject'])->toContain('Daftar resi pickup');
    expect($messages[1]['attachments'])->toHaveCount(2);
    expect(collect($messages)->pluck('recipient')->unique()->all())->toBe([$recipient]);
    expect($task->fresh()->status)->toBe('PICKED_UP');
    expect($task->proof->receipt->attempts()->count())->toBe(1);
    expect(DB::table('pickup_awb_delivery_attempts')->count())->toBe(1);
    expect(DB::table('jobs')->count())->toBe(0);
    DeliverPickupAwbManifestJob::dispatch($delivery->id);
    Artisan::call('queue:work', ['connection' => 'database', '--queue' => 'deliveries', '--stop-when-empty' => true, '--sleep' => 0, '--tries' => 1]);
    expect($messages)->toHaveCount(2);
    expect(DB::table('pickup_awb_delivery_attempts')->count())->toBe(1);
    if ($exportArtifacts) {
        $report = ['mode' => $liveRecipient ? 'isolated-database-real-smtp' : 'isolated-database-array-mailer', 'pickup_id' => $task->id, 'reference' => $task->reference,
            'customer' => $customer->name, 'handover' => $session->fresh()->status, 'reconciliation' => $result->status,
            'manual' => 20, 'cashless' => 30, 'total_awbs' => 50, 'emails' => $messages,
            'categories' => $result->categories, 'receipt_status' => $task->proof->receipt->status, 'recap_status' => $delivery->status,
            'task_events' => $task->events()->orderBy('id')->pluck('action')->all(),
            'upstream' => 'Dummy CSV imported through real queue; no Hybrid or APEX server inputs.',
        ];
        File::put($artifactRoot.'/result.json', json_encode($report, JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE));
        File::put($artifactRoot.'/rekap.xlsx', Storage::disk('local')->get($manifest->xlsx_path));
        File::put($artifactRoot.'/rekap.pdf', Storage::disk('local')->get($manifest->pdf_path));
    }
});
