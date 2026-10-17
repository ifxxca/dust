<?php

use App\Http\Controllers\CustomerController;
use App\Http\Controllers\HandoverController;
use App\Http\Controllers\MobilePushDeviceController;
use App\Http\Controllers\MobileSubmissionController;
use App\Http\Controllers\MobileTokenController;
use App\Http\Controllers\PickupExecutionController;
use App\Http\Controllers\PickupLifecycleController;
use App\Http\Controllers\PickupTaskController;
use App\Http\Controllers\ProofOfPickupController;
use App\Http\Middleware\EnsureMobileToken;
use Illuminate\Support\Facades\Route;

Route::prefix('mobile/v1')->name('mobile.')->group(function (): void {
    Route::post('auth/tokens', [MobileTokenController::class, 'store'])->middleware('throttle:login')->name('auth.store');
    Route::middleware(['auth:sanctum', EnsureMobileToken::class])->group(function (): void {
        Route::delete('auth/token', [MobileTokenController::class, 'destroy'])->name('auth.destroy');
        Route::get('me', [MobileTokenController::class, 'me'])->name('me');
        Route::post('push-device', [MobilePushDeviceController::class, 'store'])->middleware('throttle:30,1')->name('push.store');
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
});
