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
$fixtureAssets = getenv('UI_UX_ASSET_DIRECTORY') ? realpath(getenv('UI_UX_ASSET_DIRECTORY')) : false;
if ($fixtureAssets && ! str_starts_with(strtolower(str_replace('\\', '/', $fixtureAssets)), strtolower(str_replace('\\', '/', $outputDirectory)).'/')) {
    throw new RuntimeException('Fixture assets must be inside output.');
}
if ($fixtureAssets && str_starts_with($requestPath, '/build/')) {
    $fixtureAsset = realpath($fixtureAssets.substr($requestPath, strlen('/build')));
    $extension = $fixtureAsset ? pathinfo($fixtureAsset, PATHINFO_EXTENSION) : '';
    $types = ['js' => 'text/javascript', 'css' => 'text/css', 'woff2' => 'font/woff2', 'woff' => 'font/woff', 'svg' => 'image/svg+xml'];
    if (! $fixtureAsset || ! is_file($fixtureAsset) || ! isset($types[$extension])
        || ! str_starts_with(strtolower(str_replace('\\', '/', $fixtureAsset)), strtolower(str_replace('\\', '/', $fixtureAssets)).'/')) {
        http_response_code(404);

        return true;
    }
    header('Content-Type: '.$types[$extension]);
    readfile($fixtureAsset);

    return true;
}
$assetPath = realpath($publicDirectory.$requestPath);
if ($assetPath && is_file($assetPath) && ! str_ends_with(strtolower($assetPath), '.php')
    && str_starts_with(strtolower(str_replace('\\', '/', $assetPath)), strtolower(str_replace('\\', '/', $publicDirectory)).'/')) {
    return false;
}

define('LARAVEL_START', microtime(true));
require $projectDirectory.'/vendor/autoload.php';

/** @var Application $app */
$app = require $projectDirectory.'/bootstrap/app.php';
$app->booted(static function () use ($app, $databasePath, $fixtureAssets, $projectDirectory): void {
    if (config('database.default') !== 'sqlite'
        || realpath(config('database.connections.sqlite.database')) !== $databasePath) {
        throw new RuntimeException('The application must use the isolated fixture database.');
    }

    $fixtureHotFile = $databasePath.'.unused-hot';
    if (file_exists($fixtureHotFile)) {
        throw new RuntimeException('The isolated fixture hot-file path must not exist.');
    }

    $app->make(Vite::class)->useHotFile($fixtureHotFile);
    if ($fixtureAssets) {
        $relativeAssets = substr(str_replace('\\', '/', $fixtureAssets), strlen(str_replace('\\', '/', $projectDirectory)) + 1);
        $app->make(Vite::class)->useManifestFilename('../../'.$relativeAssets.'/manifest.json');
    }
});
$app->handleRequest(Request::capture());
