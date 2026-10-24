<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Schedule::command('pickups:generate')->everyMinute()->withoutOverlapping()->when(fn () => in_array(config('pickup.generation_policy'), ['today', 'catchup_7_days'], true));
Schedule::command('jne-reports:queue-due')->everyMinute()->withoutOverlapping(10);

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');
