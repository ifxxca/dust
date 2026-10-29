<?php

return [
    'timezone' => env('PICKUP_TIMEZONE', 'Asia/Jakarta'),
    'generation_policy' => env('PICKUP_GENERATION_POLICY'),
    'receipt_channel' => env('PICKUP_RECEIPT_CHANNEL'),
    'cashless_entry' => [
        'enabled' => (bool) env('CASHLESS_ENTRY_ENABLED', false),
    ],
    'automation' => [
        'enabled' => (bool) env('PICKUP_AUTOMATION_ENABLED', false),
        'send_enabled' => (bool) env('PICKUP_AWB_SEND_ENABLED', false),
        'node_binary' => env('PICKUP_PDF_NODE_BINARY', 'node'),
    ],
];
