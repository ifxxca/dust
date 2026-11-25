<?php

use App\Http\Controllers\DocumentDeliveryController;
use App\Http\Controllers\Settings\ProfileController;
use App\Http\Controllers\Settings\SecurityController;
use Illuminate\Auth\Middleware\RequirePassword;
use Illuminate\Support\Facades\Route;

Route::middleware(['auth'])->group(function () {
    Route::get('settings', fn () => to_route('profile.edit'));

    Route::get('settings/profile', [ProfileController::class, 'edit'])->name('profile.edit');
    Route::patch('settings/profile', [ProfileController::class, 'update'])->name('profile.update');
});

Route::middleware(['auth', 'verified'])->group(function () {
    Route::get('settings/document-delivery', [DocumentDeliveryController::class, 'edit'])->name('document-delivery.edit');
    Route::patch('settings/document-delivery', [DocumentDeliveryController::class, 'update'])->middleware('throttle:10,1')->name('document-delivery.update');
    Route::get('settings/document-delivery/groups', [DocumentDeliveryController::class, 'groups'])->middleware('throttle:30,1')->name('document-delivery.groups');
    Route::get('operations/pickup-tasks/{task}/document-deliveries', [DocumentDeliveryController::class, 'history'])->whereNumber('task')->name('document-delivery.history');
    Route::post('operations/pickup-tasks/{task}/document-deliveries', [DocumentDeliveryController::class, 'send'])->whereNumber('task')->middleware('throttle:10,1')->name('document-delivery.send');
    Route::post('operations/pickup-tasks/{task}/document-deliveries/{delivery}/retry', [DocumentDeliveryController::class, 'retry'])->whereNumber('task')->whereNumber('delivery')->middleware('throttle:10,1')->name('document-delivery.retry');
    Route::delete('settings/profile', [ProfileController::class, 'destroy'])->name('profile.destroy');

    Route::get('settings/security', [SecurityController::class, 'edit'])
        ->middleware(RequirePassword::class)
        ->name('security.edit');

    Route::put('settings/password', [SecurityController::class, 'update'])
        ->middleware('throttle:6,1')
        ->name('user-password.update');

    Route::inertia('settings/appearance', 'settings/appearance')->name('appearance.edit');
});
