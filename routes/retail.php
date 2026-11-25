<?php

use App\Http\Controllers\CashlessEntryResultController;
use App\Http\Controllers\CashlessHandoverController;
use App\Http\Controllers\CustomerController;
use App\Http\Controllers\HandoverController;
use App\Http\Controllers\MobileSubmissionController;
use App\Http\Controllers\PickupExecutionController;
use App\Http\Controllers\PickupLifecycleController;
use App\Http\Controllers\PickupNotificationController;
use App\Http\Controllers\PickupTaskController;
use App\Http\Controllers\ProofOfPickupController;
use App\Http\Controllers\RetailMobileController;
use App\Http\Middleware\EnsureRetailMobileSession;
use Illuminate\Support\Facades\Route;

Route::get('/m', [RetailMobileController::class, 'index'])->name('retail.app');
Route::get('/m/sw.js', [RetailMobileController::class, 'worker'])->name('retail.worker');
Route::prefix('m/api/v1')->name('retail.')->middleware(['auth', EnsureRetailMobileSession::class])->group(function (): void {
    Route::get('me', [RetailMobileController::class, 'me'])->name('me');
    Route::get('notifications', [PickupNotificationController::class, 'index'])->name('notifications.index');
    Route::get('cashless-entry-batches/{batch}', [CashlessEntryResultController::class, 'show'])->whereNumber('batch')->name('cashless-results.show');
    Route::post('cashless-entry-batches/{batch}/items/{item}/correction', [CashlessEntryResultController::class, 'correct'])->whereNumber(['batch', 'item'])->middleware('throttle:30,1')->name('cashless-results.correct');
    Route::patch('notifications/read', [PickupNotificationController::class, 'update'])->name('notifications.update');
    Route::get('cashless-handovers', [CashlessHandoverController::class, 'index'])->name('cashless-handover.index');
    Route::post('cashless-handovers/{task}', [CashlessHandoverController::class, 'store'])->whereNumber('task')->middleware('throttle:30,1')->name('cashless-handover.store');
    Route::get('pickup-tasks/takeover-candidates', [PickupTaskController::class, 'index'])->name('tasks.candidates');
    Route::get('pickup-tasks', [PickupTaskController::class, 'index'])->name('tasks.index');
    Route::post('pickup-tasks', [PickupTaskController::class, 'store'])->middleware('throttle:30,1')->name('tasks.store');
    Route::get('customers', [CustomerController::class, 'index'])->name('customers.index');
    Route::get('pickup-tasks/{task}', [PickupTaskController::class, 'show'])->name('tasks.show');
    Route::post('pickup-tasks/{task}/takeover', [PickupTaskController::class, 'takeover'])->name('tasks.takeover');
    Route::post('pickup-tasks/{task}/execution', [PickupExecutionController::class, 'start'])->name('tasks.start');
    Route::post('pickup-tasks/{task}/visits', [PickupExecutionController::class, 'record'])->name('tasks.visit');
    Route::post('pickup-tasks/{task}/retry', [PickupLifecycleController::class, 'retry'])->name('tasks.retry');
    Route::post('pickup-tasks/{task}/proof', [ProofOfPickupController::class, 'store'])->name('tasks.proof');
    Route::get('pickup-evidence/{attachment}', [ProofOfPickupController::class, 'attachment'])->name('evidence');
    Route::get('submissions/{submission_key}', [MobileSubmissionController::class, 'show'])->name('submissions.show');
    Route::get('handovers/candidates', [HandoverController::class, 'candidates'])->name('handovers.candidates');
    Route::get('handovers', [HandoverController::class, 'index'])->name('handovers.index');
    Route::post('handovers', [HandoverController::class, 'store'])->name('handovers.store');
    Route::get('handovers/{session}', [HandoverController::class, 'show'])->name('handovers.show');
    Route::post('handovers/{session}/members', [HandoverController::class, 'amend'])->name('handovers.amend');
    Route::post('handovers/{session}/items/{item}/verification', [HandoverController::class, 'verify'])->name('handovers.verify');
    Route::post('handovers/{session}/close', [HandoverController::class, 'close'])->name('handovers.close');
});
