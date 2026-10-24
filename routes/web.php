<?php

use App\Http\Controllers\AdminPushTestController;
use App\Http\Controllers\ApexBatchController;
use App\Http\Controllers\CustomerController;
use App\Http\Controllers\DiscrepancyController;
use App\Http\Controllers\HandoverController;
use App\Http\Controllers\JneCustomerDashboardController;
use App\Http\Controllers\JneEvidenceRuleController;
use App\Http\Controllers\JneMonitoringController;
use App\Http\Controllers\JneShipperAliasController;
use App\Http\Controllers\OperationalCorrectionController;
use App\Http\Controllers\OperationalDashboardController;
use App\Http\Controllers\OperationalUserController;
use App\Http\Controllers\PickupCashlessAwbController;
use App\Http\Controllers\PickupExecutionController;
use App\Http\Controllers\PickupLifecycleController;
use App\Http\Controllers\PickupNotificationController;
use App\Http\Controllers\PickupProcessingController;
use App\Http\Controllers\PickupReceiptController;
use App\Http\Controllers\PickupResultController;
use App\Http\Controllers\PickupScheduleController;
use App\Http\Controllers\PickupTaskController;
use App\Http\Controllers\ProofOfPickupController;
use App\Http\Controllers\ReportJobController;
use App\Http\Controllers\ReportRunController;
use App\Models\HandoverSession;
use App\Models\PickupTask;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;
use Inertia\Response;

Route::inertia('/', 'welcome')->name('home');

Route::middleware(['auth'])->group(function () {
    Route::get('dashboard', OperationalDashboardController::class)->name('dashboard');
});

require __DIR__.'/settings.php';

Route::middleware('auth')->group(function (): void {
    Route::get('/admin/report-runs', [ReportRunController::class, 'index'])->name('report-runs.index');
    Route::post('/admin/report-runs', [ReportRunController::class, 'store'])->middleware('throttle:10,1')->name('report-runs.store');
    Route::post('/admin/report-runs/recover', [ReportRunController::class, 'recover'])->name('report-runs.recover');
    Route::post('/admin/report-runs/{reportJob}/retry-sources', [ReportRunController::class, 'retrySources'])->whereNumber('reportJob')->middleware('throttle:10,1')->name('report-runs.retry-sources');
    Route::get('/admin/jne-shipper-aliases', [JneShipperAliasController::class, 'index'])->name('jne-shipper-aliases.index');
    Route::post('/admin/jne-shipper-aliases', [JneShipperAliasController::class, 'store'])->name('jne-shipper-aliases.store');
    Route::put('/admin/jne-shipper-aliases/{alias}', [JneShipperAliasController::class, 'update'])->whereNumber('alias')->name('jne-shipper-aliases.update');
    Route::post('/admin/jne-shipper-aliases/import', [JneShipperAliasController::class, 'import'])->middleware('throttle:5,1')->name('jne-shipper-aliases.import');
    Route::get('/admin/jne-monitoring', [JneMonitoringController::class, 'index'])->name('jne-monitoring.index');
    Route::get('/admin/jne-monitoring/evidence-rules', [JneEvidenceRuleController::class, 'index'])->name('jne-evidence.index');
    Route::post('/admin/jne-monitoring/evidence-rules', [JneEvidenceRuleController::class, 'store'])->middleware('throttle:30,1')->name('jne-evidence.store');
    Route::post('/admin/jne-monitoring/evidence-rules/disable', [JneEvidenceRuleController::class, 'disable'])->middleware('throttle:30,1')->name('jne-evidence.disable');
    Route::post('/admin/report-runs/{reportJob}/apex-recovery', [ApexBatchController::class, 'review'])->whereNumber('reportJob')->middleware('throttle:20,1')->name('report-runs.apex-recovery');
    Route::get('/admin/jne-monitoring/customer-dashboard', JneCustomerDashboardController::class)->name('jne-monitoring.customer-dashboard');
    Route::get('/admin/jne-monitoring/profiles', [JneMonitoringController::class, 'profiles'])->name('jne-monitoring.profiles');
    Route::post('/admin/jne-monitoring/profiles', [JneMonitoringController::class, 'saveProfile'])->name('jne-monitoring.profile-store');
    Route::post('/admin/jne-monitoring/profiles/bulk', [JneMonitoringController::class, 'bulkProfiles'])->middleware('throttle:5,1')->name('jne-monitoring.profile-bulk');
    Route::put('/admin/jne-monitoring/profiles/{profile}', [JneMonitoringController::class, 'saveProfile'])->whereNumber('profile')->name('jne-monitoring.profile-update');
    Route::post('/admin/jne-monitoring/rebuild', [JneMonitoringController::class, 'rebuild'])->middleware('throttle:5,1')->name('jne-monitoring.rebuild');
    Route::post('/admin/jne-monitoring/reports/{reportJob}/review', [JneMonitoringController::class, 'review'])->whereNumber('reportJob')->name('jne-monitoring.review-report');
    Route::get('/admin/jne-monitoring/reconciliation', [JneMonitoringController::class, 'reconciliation'])->name('jne-monitoring.reconciliation');
    Route::get('/admin/jne-monitoring/{shipment}', [JneMonitoringController::class, 'show'])->whereNumber('shipment')->name('jne-monitoring.show');
    Route::post('/admin/jne-monitoring/{shipment}/match', [JneMonitoringController::class, 'match'])->whereNumber('shipment')->name('jne-monitoring.match');
    Route::get('/admin/jne-reports', [ReportJobController::class, 'index'])->name('jne-reports.index');
    Route::post('/admin/jne-reports', [ReportJobController::class, 'store'])->name('jne-reports.store');
    Route::post('/admin/jne-reports/recover', [ReportJobController::class, 'recover'])->name('jne-reports.recover');
    Route::get('/admin/jne-reports/{reportJob}/download', [ReportJobController::class, 'download'])->whereNumber('reportJob')->name('jne-reports.download');
    Route::get('/admin/jne-reports/{reportJob}/awbs', [ReportJobController::class, 'awbs'])->whereNumber('reportJob')->name('jne-reports.awbs');
    Route::post('/admin/jne-reports/{reportJob}/project', [ReportJobController::class, 'project'])->whereNumber('reportJob')->middleware('throttle:10,1')->name('jne-reports.project');
    Route::post('/admin/jne-shipper-aliases/sync/{run}', [JneShipperAliasController::class, 'retrySync'])->whereNumber('run')->middleware('throttle:10,1')->name('jne-shipper-aliases.retry-sync');
    Route::post('/admin/jne-reports/{reportJob}/import-awbs', [ReportJobController::class, 'importAwbs'])->whereNumber('reportJob')->middleware('throttle:10,1')->name('jne-reports.import-awbs');
    Route::get('/hasil-pickup', [PickupResultController::class, 'index'])->name('pickup-results.index');
    Route::get('/hasil-pickup/export', [PickupResultController::class, 'export'])->name('pickup-results.export');
    Route::get('/hasil-pickup/{task}/quick', [PickupResultController::class, 'quick'])->whereNumber('task')->name('pickup-results.quick');
    Route::get('/hasil-pickup/{task}', [PickupResultController::class, 'show'])->whereNumber('task')->name('pickup-results.show');
    Route::get('/admin/push-test', [AdminPushTestController::class, 'page'])->name('push-test');
    Route::get('/discrepancies', function (Request $request): Response {
        abort_unless($request->user()->canExecutePickup(), 403);

        return Inertia::render('discrepancies', ['timezone' => config('pickup.timezone')]);
    })->name('discrepancies');
    Route::get('/pickup-schedules', function (Request $request): Response {
        abort_unless($request->user()->canManagePickup(), 403);

        return Inertia::render('pickup-schedules', ['timezone' => config('pickup.timezone')]);
    })->name('pickup-schedules');
    Route::get('/handover/{session?}', function (Request $request, ?string $session = null): Response {
        abort_unless($request->user()->canExecutePickup(), 403);
        if ($session !== null) {
            HandoverSession::findOrFail($session);
        }

        return Inertia::render('handover', ['sessionId' => $session ? (int) $session : null, 'timezone' => config('pickup.timezone')]);
    })->whereNumber('session')->name('handover');
    Route::get('/operations/{screen?}/{task?}', function (Request $request, string $screen = 'tasks', ?string $task = null): Response {
        $roles = match ($screen) {
            'customers' => ['cs', 'admin_supervisor'], 'users' => ['admin_supervisor'],
            'mine', 'available' => ['pickup_staff', 'retail_staff', 'admin_supervisor'], 'create' => ['cs', 'admin_supervisor', 'pickup_staff'],
            'execute' => ['pickup_staff', 'retail_staff', 'admin_supervisor'],
            'tasks', 'detail' => ['cs', 'admin_supervisor', 'pickup_staff', 'retail_staff'],
            default => [],
        };
        abort_unless(in_array($request->user()->role, $roles, true), 403);
        if ($screen === 'customers') {
            return Inertia::render('customers');
        }
        if (in_array($screen, ['detail', 'execute'], true)) {
            $record = PickupTask::findOrFail($task);
            abort_unless($request->user()->can('view', $record), 404);
            if ($screen === 'execute') {
                abort_unless($record->assigned_staff_id === $request->user()->id && $request->user()->canExecutePickup(), 404);

                return Inertia::render('pickup-wizard', ['taskId' => $record->id, 'timezone' => config('pickup.timezone')]);
            }
        }

        $workspaceStats = null;
        if ($request->user()->canExecutePickup() && in_array($screen, ['mine', 'available', 'tasks'], true)) {
            $day = CarbonImmutable::now(config('pickup.timezone'))->startOfDay();
            $own = PickupTask::where('assigned_staff_id', $request->user()->id);
            $workspaceStats = ['today' => (clone $own)->where('scheduled_at', '>=', $day->utc())->where('scheduled_at', '<', $day->addDay()->utc())->count(), 'date' => $day->toDateString(), 'next' => (clone $own)->where('status', 'ASSIGNED')->where(fn ($query) => $query->whereNull('execution_started_at')->orWhereDoesntHave('latestVisit', fn ($visit) => $visit->where('outcome', 'NO_PACKAGES')))->orderBy('scheduled_at')->value('scheduled_at')];
        }

        return Inertia::render('operations', ['screen' => $screen, 'taskId' => $task ? (int) $task : null, 'timezone' => config('pickup.timezone'), 'workspaceStats' => $workspaceStats]);
    })->whereNumber('task')->name('operations');

    Route::prefix('api/v1')->name('api.')->group(function (): void {
        Route::get('pickup-tasks/{task}/cashless-awbs', [PickupCashlessAwbController::class, 'index'])->whereNumber('task')->name('cashless-awbs.index');
        Route::get('pickup-tasks/{task}/cashless-awbs/{evidence}/history', [PickupCashlessAwbController::class, 'history'])->whereNumber(['task', 'evidence'])->name('cashless-awbs.history');
        Route::post('pickup-tasks/{task}/cashless-awbs', [PickupCashlessAwbController::class, 'store'])->whereNumber('task')->middleware('throttle:120,1')->name('cashless-awbs.store');
        Route::post('pickup-tasks/{task}/cashless-awbs/corrections', [PickupCashlessAwbController::class, 'correct'])->whereNumber('task')->middleware('throttle:60,1')->name('cashless-awbs.correct');
        Route::get('pickup-notifications', [PickupNotificationController::class, 'index'])->name('pickup-notifications.index');
        Route::patch('pickup-notifications/read', [PickupNotificationController::class, 'update'])->name('pickup-notifications.update');
        Route::get('admin/push-test/devices', [AdminPushTestController::class, 'index'])->name('push-test.devices');
        Route::post('admin/push-test', [AdminPushTestController::class, 'store'])->middleware('throttle:6,1')->name('push-test.store');
        Route::get('admin/push-test/{testId}', [AdminPushTestController::class, 'show'])->whereUuid('testId')->name('push-test.show');
        Route::get('discrepancies', [DiscrepancyController::class, 'index'])->name('discrepancies.index');
        Route::get('pickup-schedules', [PickupScheduleController::class, 'index'])->name('schedules.index');
        Route::post('pickup-schedules', [PickupScheduleController::class, 'store'])->name('schedules.store');
        Route::patch('pickup-schedules/{schedule}', [PickupScheduleController::class, 'update'])->name('schedules.update');
        Route::get('me', fn (Request $request) => response()->json(['data' => $request->user()->only(['id', 'name', 'role', 'is_active']), 'meta' => ['operational_timezone' => config('pickup.timezone')]]))->name('me');
        Route::get('customers', [CustomerController::class, 'index'])->name('customers.index');
        Route::post('customers', [CustomerController::class, 'store'])->name('customers.store');
        Route::patch('customers/{customer}', [CustomerController::class, 'update'])->name('customers.update');
        Route::get('pickup-staff', [OperationalUserController::class, 'staff'])->name('staff');
        Route::get('users', [OperationalUserController::class, 'index'])->name('users.index');
        Route::post('users', [OperationalUserController::class, 'store'])->name('users.store');
        Route::patch('users/{user}', [OperationalUserController::class, 'update'])->name('users.update');
        Route::get('pickup-tasks/takeover-candidates', [PickupTaskController::class, 'index'])->name('tasks.candidates');
        Route::get('pickup-tasks', [PickupTaskController::class, 'index'])->name('tasks.index');
        Route::post('pickup-tasks', [PickupTaskController::class, 'store'])->name('tasks.store');
        Route::post('pickup-tasks/bulk-assignment', [PickupTaskController::class, 'bulkAssign'])->name('tasks.bulkAssign');
        Route::get('pickup-tasks/{task}', [PickupTaskController::class, 'show'])->name('tasks.show');
        Route::post('pickup-tasks/{task}/assignment', [PickupTaskController::class, 'assign'])->name('tasks.assign');
        Route::post('pickup-tasks/{task}/takeover', [PickupTaskController::class, 'takeover'])->name('tasks.takeover');
        Route::post('pickup-tasks/{task}/execution', [PickupExecutionController::class, 'start'])->name('tasks.start');
        Route::post('pickup-tasks/{task}/visits', [PickupExecutionController::class, 'record'])->name('tasks.visit');
        Route::post('pickup-tasks/{task}/retry', [PickupLifecycleController::class, 'retry'])->name('tasks.retry');
        Route::post('pickup-tasks/{task}/cancel', [PickupLifecycleController::class, 'cancel'])->name('tasks.cancel');
        Route::post('pickup-tasks/{task}/corrections', [OperationalCorrectionController::class, 'proof'])->name('tasks.correct');
        Route::post('pickup-tasks/{task}/processing', [PickupProcessingController::class, 'store'])->name('tasks.processing');
        Route::post('pickup-tasks/{task}/receipt', [PickupReceiptController::class, 'send'])->name('tasks.receipt');
        Route::post('handovers/{session}/items/{item}/corrections', [OperationalCorrectionController::class, 'verification'])->name('handovers.correct');
        Route::post('pickup-tasks/{task}/proof', [ProofOfPickupController::class, 'store'])->name('tasks.proof');
        Route::get('pickup-evidence/{attachment}', [ProofOfPickupController::class, 'attachment'])->name('evidence');
        Route::get('handovers/candidates', [HandoverController::class, 'candidates'])->name('handovers.candidates');
        Route::get('handovers', [HandoverController::class, 'index'])->name('handovers.index');
        Route::post('handovers', [HandoverController::class, 'store'])->name('handovers.store');
        Route::get('handovers/{session}', [HandoverController::class, 'show'])->name('handovers.show');
        Route::post('handovers/{session}/items/{item}/verification', [HandoverController::class, 'verify'])->name('handovers.verify');
        Route::post('handovers/{session}/close', [HandoverController::class, 'close'])->name('handovers.close');
        Route::post('handovers/{session}/reopen', [HandoverController::class, 'reopen'])->name('handovers.reopen');
        Route::patch('handovers/{session}/members', [HandoverController::class, 'amend'])->name('handovers.amend');
    });
});
