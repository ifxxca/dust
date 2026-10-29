<?php

namespace App\Providers;

use App\Models\CashlessEntryBatch;
use App\Models\HandoverItem;
use App\Models\HandoverItemRevision;
use App\Models\JneCustomerCodeAlias;
use App\Models\JneShipperAlias;
use App\Models\JneSourceContract;
use App\Models\PickupRecord;
use App\Models\PickupRecordRevision;
use App\Models\PickupTask;
use App\Models\PickupTaskEvent;
use App\Observers\CashlessEntryAlertObserver;
use App\Observers\PickupAssignmentPushObserver;
use App\Observers\PickupAutomationObserver;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\DevCommands;
use Illuminate\Support\Facades\Date;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\ServiceProvider;
use Illuminate\Validation\Rules\Password;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        $this->configureDefaults();
        PickupTaskEvent::observe(PickupAssignmentPushObserver::class);
        CashlessEntryBatch::observe(CashlessEntryAlertObserver::class);
        foreach ([PickupTask::class, PickupRecord::class, PickupRecordRevision::class, HandoverItem::class, HandoverItemRevision::class, JneSourceContract::class, JneCustomerCodeAlias::class, JneShipperAlias::class] as $model) {
            $model::observe(PickupAutomationObserver::class);
        }
        DevCommands::artisan('queue:work --queue=reconciliation --sleep=2 --tries=4 --timeout=60', 'pickup-reconciliation');
        DevCommands::artisan('queue:work --queue=documents --sleep=2 --tries=4 --timeout=75', 'pickup-documents');
        DevCommands::artisan('queue:work --queue=deliveries --sleep=2 --tries=1 --timeout=60', 'pickup-deliveries');
        DevCommands::artisan('schedule:work', 'scheduler');
        DevCommands::artisan('queue:work database --queue=mobile-push --sleep=2 --tries=1 --timeout=60', 'mobile-push');
    }

    /**
     * Configure default behaviors for production-ready applications.
     */
    protected function configureDefaults(): void
    {
        Date::use(CarbonImmutable::class);

        DB::prohibitDestructiveCommands(
            app()->isProduction(),
        );

        Password::defaults(fn (): ?Password => app()->isProduction()
            ? Password::min(12)
                ->mixedCase()
                ->letters()
                ->numbers()
                ->symbols()
                ->uncompromised()
            : null,
        );
    }
}
