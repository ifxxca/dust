<?php

use Laravel\Telescope\Http\Middleware\Authorize;
use Laravel\Telescope\Watchers;

return [
    'enabled' => (bool) env('TELESCOPE_ENABLED', false),
    'domain' => null,
    'path' => 'telescope',
    'driver' => 'database',
    'storage' => [
        'database' => ['connection' => 'telescope', 'chunk' => 100],
    ],
    'queue' => ['connection' => 'sync', 'queue' => 'telescope', 'delay' => 0],
    'middleware' => ['web', 'auth', Authorize::class],
    'only_paths' => [],
    'ignore_paths' => ['api/internal/*', 'login*', 'register*', '*password*', '*two-factor*', '.well-known*', '_boost*'],
    'ignore_commands' => ['migrate', 'config:cache', 'config:clear', 'telescope:prune'],
    'watchers' => [
        Watchers\ExceptionWatcher::class => true,
        Watchers\JobWatcher::class => true,
        Watchers\MailWatcher::class => true,
        Watchers\ScheduleWatcher::class => true,
    ],
];
