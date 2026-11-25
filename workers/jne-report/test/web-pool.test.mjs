import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const windows = process.platform === 'win32';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const quote = (value) => "'" + value.replaceAll("'", "''") + "'";
function powershell(code) {
    return spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(code, 'utf16le').toString('base64')], { encoding: 'utf8', windowsHide: true, timeout: 20000 });
}

test('Nginx handles concurrent requests on separate PHP processes and denies nonpublic files', { skip: !windows, timeout: 45000 }, async () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'retail-web-pool-'));
    const port = 20000 + Math.floor(Math.random() * 15000);
    const log = path.join(directory, 'intervals.log');
    mkdirSync(path.join(directory, 'public'));
    writeFileSync(path.join(directory, '.env'), 'PRIVATE_FIXTURE_ONLY');
    writeFileSync(path.join(directory, 'public/index.php'), `<?php
if (getenv('APP_ENV') !== 'testing') { http_response_code(500); exit; }
$start = microtime(true);
usleep(350000);
file_put_contents(dirname(__DIR__).'/intervals.log', json_encode(['start'=>$start,'end'=>microtime(true),'pid'=>getmypid()]).PHP_EOL, FILE_APPEND|LOCK_EX);
header('Content-Type: application/json');
header('X-Fixture-Preload: '.str_repeat('x', 7000));
echo json_encode(['pid'=>getmypid()]);
`);
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', path.join(root, 'workers/jne-report/start-web.ps1'), '-ProjectDirectory', directory, '-Port', String(port), '-PhpWorkers', '4'], { env: { ...process.env, APP_ENV: 'testing' }, windowsHide: true });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    try {
        const deadline = Date.now() + 15000;
        while (!output.includes('Nginx ready') && child.exitCode === null && Date.now() < deadline) {
            await new Promise((resolve) => setTimeout(resolve, 100));
        }
        assert.match(output, /Nginx ready/, output);
        const responses = await Promise.all(Array.from({ length: 4 }, () => fetch(`http://127.0.0.1:${port}/`)));
        for (const response of responses) assert.equal(response.status, 200, output);
        const rows = readFileSync(log, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
        assert.ok(new Set(rows.map((row) => row.pid)).size >= 2, 'Requests must execute in separate PHP processes.');
        assert.ok(rows.some((a, i) => rows.some((b, j) => i !== j && a.start < b.end && b.start < a.end)), 'Requests must overlap instead of waiting behind one PHP process.');
        assert.equal((await fetch(`http://127.0.0.1:${port}/.env`)).status, 403);
        assert.equal((await fetch(`http://127.0.0.1:${port}/missing.php`)).status, 404);
        const ownership = powershell('. ' + quote(path.join(root, 'workers/jne-report/local-services.ps1')) + '; $p = @(Get-CimInstance Win32_Process); @(Get-PenarikanServiceProcesses -Processes $p -ProjectDirectory ' + quote(directory) + ' -Service web) | Select-Object -ExpandProperty Name');
        assert.equal(ownership.status, 0, ownership.stderr);
        assert.match(ownership.stdout, /nginx.exe/);
        assert.match(ownership.stdout, /php-cgi.exe/);
    } finally {
        const cleanup = powershell('. ' + quote(path.join(root, 'workers/jne-report/local-services.ps1')) + '; $p = @(Get-CimInstance Win32_Process); $roots = @($p | Where-Object { $_.ProcessId -eq ' + child.pid + ' -and $_.CommandLine -like ' + quote('*' + directory + '*') + ' }); foreach ($owned in @(Get-PenarikanProcessTree -Processes $p -Roots $roots)) { Stop-Process -Id $owned.ProcessId -ErrorAction SilentlyContinue }');
        assert.equal(cleanup.status, 0, cleanup.stderr);
        const resolved = realpathSync(directory);
        assert.ok(resolved.toLowerCase().startsWith(realpathSync(tmpdir()).toLowerCase() + path.sep + 'retail-web-pool-'));
        rmSync(resolved, { recursive: true, force: true });
    }
});

test('web pool settings preserve the existing driver until explicit activation', { skip: !windows }, () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'retail-web-settings-'));
    const helper = quote(path.join(root, 'workers/jne-report/local-services.ps1'));
    const query = '. ' + helper + '; Get-PenarikanSettings -ProjectDirectory ' + quote(directory) + ' | ConvertTo-Json -Compress';
    try {
        writeFileSync(path.join(directory, '.env'), 'SERVER_PORT=8026\nLOCAL_WEB_DRIVER=nginx\nLOCAL_WEB_PHP_WORKERS=4\n');
        const result = powershell(query);
        assert.equal(result.status, 0, result.stderr);
        assert.equal(JSON.parse(result.stdout).WebDriver, 'nginx');
        writeFileSync(path.join(directory, '.env'), 'LOCAL_WEB_DRIVER=unknown\n');
        assert.notEqual(powershell(query).status, 0);
    } finally {
        const resolved = realpathSync(directory);
        assert.ok(resolved.toLowerCase().startsWith(realpathSync(tmpdir()).toLowerCase() + path.sep + 'retail-web-settings-'));
        rmSync(resolved, { recursive: true, force: true });
    }
});

test('web-only restart selection leaves queue workers outside the stop operation', { skip: !windows }, () => {
    const helper = quote(path.join(root, 'workers/jne-report/local-services.ps1'));
    const project = String.raw`C:\Retail`;
    const processes = [
        { ProcessId: 111, ParentProcessId: 1, Name: 'php.exe', CommandLine: String.raw`php.exe "C:\Retail\artisan" serve` },
        { ProcessId: 222, ParentProcessId: 1, Name: 'php.exe', CommandLine: String.raw`php.exe "C:\Retail\artisan" queue:work --queue=default,reconciliation,documents,deliveries` },
    ];
    const result = powershell('. ' + helper + '; function Get-CimInstance { foreach ($process in (ConvertFrom-Json ' + quote(JSON.stringify(processes)) + ')) { $process } }; Stop-PenarikanProcesses -ProjectDirectory ' + quote(project) + ' -Services web -CheckOnly');
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /PID 111/);
    assert.doesNotMatch(result.stdout, /PID 222/);
});
