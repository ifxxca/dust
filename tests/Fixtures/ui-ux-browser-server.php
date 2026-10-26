<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Vite;
use Illuminate\Http\Request;

if (getenv('APP_ENV') !== 'testing') {
    throw new RuntimeException('This browser fixture server requires APP_ENV=testing.');
}

$projectDirectory = dirname(__DIR__, 2);
$outputDirectory = realpath($projectDirectory.'/output');
$databasePath = realpath(getenv('DB_DATABASE') ?: '');
if (! $outputDirectory || ! $databasePath
    || ! str_starts_with(strtolower(str_replace('\\', '/', $databasePath)), strtolower(str_replace('\\', '/', $outputDirectory)).'/')
    || ! str_ends_with(strtolower($databasePath), '.sqlite')) {
    throw new RuntimeException('Use an existing isolated SQLite fixture inside output.');
}

$publicDirectory = realpath($projectDirectory.'/public');
$requestPath = rawurldecode(parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/');
$assetPath = realpath($publicDirectory.$requestPath);
if ($assetPath && is_file($assetPath) && ! str_ends_with(strtolower($assetPath), '.php')
    && str_starts_with(strtolower(str_replace('\\', '/', $assetPath)), strtolower(str_replace('\\', '/', $publicDirectory)).'/')) {
    return false;
}

define('LARAVEL_START', microtime(true));
require $projectDirectory.'/vendor/autoload.php';

/** @var Application $app */
$app = require $projectDirectory.'/bootstrap/app.php';
$app->booted(static function () use ($app, $databasePath): void {
    if (config('database.default') !== 'sqlite'
        || realpath(config('database.connections.sqlite.database')) !== $databasePath) {
        throw new RuntimeException('The application must use the isolated fixture database.');
    }

    $fixtureHotFile = $databasePath.'.unused-hot';
    if (file_exists($fixtureHotFile)) {
        throw new RuntimeException('The isolated fixture hot-file path must not exist.');
    }

    $app->make(Vite::class)->useHotFile($fixtureHotFile);
});
$app->handleRequest(Request::capture());
