<?php

return [
    'waha' => [
        'base_url' => env('WAHA_BASE_URL'),
        'api_key' => env('WAHA_API_KEY'),
        'delivery' => [
            'start_hour' => 8,
            'end_hour' => 20,
            'send_seen' => (bool) env('WAHA_SEND_SEEN', true),
            'recipient_hourly_limit' => (int) env('WAHA_RECIPIENT_HOURLY_LIMIT', 8),
            'recipient_daily_limit' => (int) env('WAHA_RECIPIENT_DAILY_LIMIT', 24),
        ],
    ],

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Resend, Postmark, AWS, and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

];
