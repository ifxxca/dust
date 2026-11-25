<?php

return [
    'awb_signatures' => json_decode(file_get_contents(__DIR__.'/awb-signatures.json'), true, flags: JSON_THROW_ON_ERROR),
    'timezone' => env('PICKUP_TIMEZONE', 'Asia/Jakarta'),
    'generation_policy' => env('PICKUP_GENERATION_POLICY'),
    'receipt_channel' => env('PICKUP_RECEIPT_CHANNEL'),
    'email_recipients' => [
        'enabled' => (bool) env('PICKUP_MULTIPLE_EMAIL_RECIPIENTS', false),
        'limit' => (int) env('PICKUP_EMAIL_RECIPIENT_LIMIT', 5),
    ],
    'allow_incomplete_customer' => (bool) env('PICKUP_ALLOW_INCOMPLETE_CUSTOMER', false),
    'cashless_entry' => [
        'report_confirmation_enabled' => (bool) env('CASHLESS_REPORT_CONFIRMATION_ENABLED', false),
        'handover_lock' => (bool) env('CASHLESS_HANDOVER_LOCK_ENABLED', true),
        'per_user_accounts' => (bool) env('CASHLESS_PER_USER_ACCOUNTS', false),
        'enabled' => (bool) env('CASHLESS_ENTRY_ENABLED', false),
    ],
    'automation' => [
        'auto_lock' => true,
        'enabled' => (bool) env('PICKUP_AUTOMATION_ENABLED', false),
        'send_enabled' => (bool) env('PICKUP_AWB_SEND_ENABLED', false),
        'node_binary' => env('PICKUP_PDF_NODE_BINARY', 'node'),
    ],
];
