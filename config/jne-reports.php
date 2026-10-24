<?php

return [
    'batch_checkpoints_enabled' => (bool) env('JNE_APEX_BATCH_CHECKPOINTS_ENABLED', false),
    'evidence_policies_enabled' => (bool) env('JNE_EVIDENCE_POLICIES_ENABLED', false),
    'source_provenance_enabled' => (bool) env('JNE_SOURCE_EVIDENCE_ENABLED', false),
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
    'refresh_minimum_minutes' => [
        'IN_TRANSIT' => (int) env('JNE_REFRESH_IN_TRANSIT_MINUTES', 0),
        'EXCEPTION' => (int) env('JNE_REFRESH_EXCEPTION_MINUTES', 0),
        'UNKNOWN' => (int) env('JNE_REFRESH_UNKNOWN_MINUTES', 0),
        'RETURNED' => (int) env('JNE_REFRESH_RETURNED_MINUTES', 0),
    ],
];
