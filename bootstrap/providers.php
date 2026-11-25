<?php

use App\Providers\AppServiceProvider;
use App\Providers\FortifyServiceProvider;
use App\Providers\OperationsMonitoringServiceProvider;

return [
    AppServiceProvider::class,
    FortifyServiceProvider::class,
    OperationsMonitoringServiceProvider::class,
];
