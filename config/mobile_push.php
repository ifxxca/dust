<?php

return [
    'enabled' => env('MOBILE_PUSH_ENABLED', false),
    'project_id' => env('FCM_PROJECT_ID'),
    'credentials' => env('FCM_CREDENTIALS_PATH'),
    'queue_connection' => 'database',
];
