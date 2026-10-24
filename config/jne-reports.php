<?php

return [
    'worker_token' => env('JNE_REPORT_WORKER_TOKEN'),
    'worker_id' => env('JNE_REPORT_WORKER_ID', 'jne-report-1'),
    'lease_seconds' => (int) env('JNE_REPORT_LEASE_SECONDS', 300),
    'max_file_kb' => (int) env('JNE_REPORT_MAX_FILE_KB', 20480),
    'report_mode' => env('JNE_REPORT_MODE', 'P'),
    'max_report_days' => 5,
    'max_request_days' => 366,
    'max_awbs' => 6000,
    'source_timezone' => env('JNE_REPORT_SOURCE_TIMEZONE', 'Asia/Jakarta'),
    'max_scheduled_jobs_per_cycle' => 200,
    'non_identifying_shipper_names' => ['Shopee International', 'Tokopedia'],
];
