<?php

return [
    'enabled' => (bool) env('CONTROL_CENTER_ENABLED', true),
    'path' => env('CONTROL_CENTER_PATH', storage_path('app/private/operations-telemetry')),
    'fresh_seconds' => 120,
    'integration_fresh_seconds' => 660,
    'sample_size' => 100,
    'command_names' => ['jne-reports:import-awbs', 'jne-monitoring:rebuild', 'jne-monitoring:classify', 'jne-customers:import', 'pickup-history:import', 'report-jobs:recover', 'jne-reports:queue-due', 'pickups:generate', 'pickups:queue-automation'],
];
