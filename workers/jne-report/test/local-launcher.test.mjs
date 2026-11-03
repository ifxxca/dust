import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import {
    mkdtempSync,
    mkdirSync,
    writeFileSync,
    rmSync,
    realpathSync,
    copyFileSync,
    appendFileSync,
} from 'node:fs';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const windows = process.platform === 'win32';
const projectDirectory = fileURLToPath(new URL('../../../', import.meta.url));
const helpers = path.join(
    projectDirectory,
    'workers/jne-report/local-services.ps1',
);
const quote = (value) => "'" + value.replaceAll("'", "''") + "'";

function powershell(code) {
    const command =
        "$ErrorActionPreference = 'Stop'; . " + quote(helpers) + '; ' + code;
    return spawnSync(
        'powershell.exe',
        [
            '-NoProfile',
            '-NonInteractive',
            '-EncodedCommand',
            Buffer.from(command, 'utf16le').toString('base64'),
        ],
        { encoding: 'utf8', windowsHide: true, timeout: 20000 },
    );
}

function runJson(code) {
    const result = powershell(code);
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout.trim());
}

test(
    'web readiness uses a real TCP connection when Windows omits the listener and verifies the project and port',
    { skip: !windows },
    async () => {
        const server = createServer((socket) => socket.destroy());
        server.listen(0, '127.0.0.1');
        await once(server, 'listening');
        const port = server.address().port;
        const project = 'C:\\Retail App';
        const processes = [
            {
                ProcessId: 123,
                Name: 'php.exe',
                CommandLine:
                    'php.exe -S 127.0.0.1:' +
                    port +
                    ' C:\\Retail App\\vendor\\laravel\\framework\\src\\Illuminate\\Foundation\\Console/../resources/server.php',
            },
        ];
        const setup =
            'function Get-NetTCPConnection {}; $processes = ConvertFrom-Json ' +
            quote(JSON.stringify(processes)) +
            '; ';
        const query =
            'Get-PenarikanWebListener -Processes $processes -ProjectDirectory ' +
            quote(project) +
            ' -Port ' +
            port;
        try {
            assert.deepEqual(
                runJson(setup + query + ' | ConvertTo-Json -Compress'),
                {
                    ProcessId: 123,
                },
            );
            const wrongProject = powershell(
                setup + query.replace(quote(project), quote('C:\\Other App')),
            );
            assert.notEqual(wrongProject.status, 0);
            assert.match(wrongProject.stderr, /owner could not be verified/);
            const wrongPort = powershell(
                setup +
                    '$processes[0].CommandLine = $processes[0].CommandLine.Replace(' +
                    quote(':' + port + ' ') +
                    ', ' +
                    quote(':1 ') +
                    '); ' +
                    query,
            );
            assert.notEqual(wrongPort.status, 0);
            assert.match(wrongPort.stderr, /owner could not be verified/);
        } finally {
            await new Promise((resolve) => server.close(resolve));
        }
        assert.equal(
            runJson(
                'Test-PenarikanTcpPort -Port ' + port + ' | ConvertTo-Json',
            ),
            false,
        );
    },
);

test(
    'web readiness rejects a known foreign owner even when a project server process exists',
    { skip: !windows },
    () => {
        const result = powershell(
            'function Test-PenarikanTcpPort { $true }; ' +
                'function Get-NetTCPConnection { [pscustomobject]@{OwningProcess=999} }; ' +
                'function Get-PenarikanServiceProcesses { [pscustomobject]@{ProcessId=123} }; ' +
                "Get-PenarikanWebListener -Processes @() -ProjectDirectory 'C:\\Retail App' -Port 8010",
        );
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, /owned by another application \(PID 999\)/);
    },
);

test(
    'web wait retries until ready and reports a failed startup without claiming success',
    { skip: !windows },
    () => {
        const setup =
            'function Get-CimInstance {}; function Start-Sleep {}; ' +
            '$script:checks = 0; function Get-PenarikanWebListener { ' +
            '$script:checks++; if ($script:checks -eq 2) { [pscustomobject]@{ProcessId=123} } }; ';
        const ready = runJson(
            setup +
                "$listener = Wait-PenarikanWebServer -ProjectDirectory 'C:\\Retail App' -Port 8010; " +
                '@{ProcessId=$listener.ProcessId;Checks=$script:checks} | ConvertTo-Json -Compress',
        );
        assert.deepEqual(ready, { ProcessId: 123, Checks: 2 });
        const failed = powershell(
            'function Get-CimInstance {}; function Start-Sleep {}; function Get-PenarikanWebListener {}; ' +
                "Wait-PenarikanWebServer -ProjectDirectory 'C:\\Retail App' -Port 8010 -TimeoutSeconds 0",
        );
        assert.notEqual(failed.status, 0);
        assert.match(failed.stderr, /Web server did not start on port 8010/);
        assert.match(failed.stderr, /supervisor-web-/);
    },
);

test(
    'background web startup succeeds without TCP inventory and a second start reuses the server',
    { skip: !windows, timeout: 30000 },
    async () => {
        const directory = mkdtempSync(
            path.join(tmpdir(), 'retail-launcher-start-'),
        );
        const launcherDirectory = path.join(directory, 'workers/jne-report');
        const serverDirectory = path.join(
            directory,
            'vendor/laravel/framework/src/Illuminate/Foundation/resources',
        );
        mkdirSync(launcherDirectory, { recursive: true });
        mkdirSync(serverDirectory, { recursive: true });
        mkdirSync(
            path.join(
                directory,
                'vendor/laravel/framework/src/Illuminate/Foundation/Console',
            ),
        );
        mkdirSync(path.join(directory, 'public/build'), { recursive: true });
        copyFileSync(
            helpers,
            path.join(launcherDirectory, 'local-services.ps1'),
        );
        copyFileSync(
            path.join(path.dirname(helpers), 'start-local.ps1'),
            path.join(launcherDirectory, 'start-local.ps1'),
        );
        appendFileSync(
            path.join(launcherDirectory, 'local-services.ps1'),
            '\n$script:originalServiceProcesses = ${function:Get-PenarikanServiceProcesses}\n' +
                'function Get-PenarikanServiceProcesses { param($Processes,$ProjectDirectory,$Service)\n' +
                'if ($Service -eq "web") { & $script:originalServiceProcesses @PSBoundParameters } else { [pscustomobject]@{ProcessId=999} }\n}\n' +
                'function Get-NetTCPConnection {}\n',
        );
        writeFileSync(path.join(directory, 'public/build/manifest.json'), '{}');
        writeFileSync(
            path.join(serverDirectory, 'server.php'),
            '<?php echo "isolated launcher fixture";',
        );
        const reservation = createServer();
        reservation.listen(0, '127.0.0.1');
        await once(reservation, 'listening');
        const port = reservation.address().port;
        await new Promise((resolve) => reservation.close(resolve));
        writeFileSync(
            path.join(directory, '.env'),
            'SERVER_PORT=' + port + '\n',
        );
        writeFileSync(
            path.join(directory, 'artisan'),
            '<?php\n' +
                '$server = __DIR__ . "/vendor/laravel/framework/src/Illuminate/Foundation/Console/../resources/server.php";\n' +
                'passthru(escapeshellarg(PHP_BINARY) . " -S 127.0.0.1:' +
                port +
                ' " . escapeshellarg($server), $code);\n' +
                'exit($code);\n',
        );
        const command =
            '& ' +
            quote(path.join(launcherDirectory, 'start-local.ps1')) +
            ' -KeepTunnel';
        try {
            const started = powershell(command);
            assert.equal(started.status, 0, started.stderr);
            assert.match(
                started.stdout,
                new RegExp('web ready on port ' + port),
            );
            const again = powershell(command);
            assert.equal(again.status, 0, again.stderr);
            assert.match(
                again.stdout,
                new RegExp('web already running on port ' + port),
            );
            assert.doesNotMatch(again.stdout, /web started \(/);
        } finally {
            const stopped = powershell(
                'Stop-PenarikanProcesses -ProjectDirectory ' + quote(directory),
            );
            assert.equal(stopped.status, 0, stopped.stderr);
            const resolved = realpathSync(directory);
            assert.ok(
                resolved
                    .toLowerCase()
                    .startsWith(
                        realpathSync(tmpdir()).toLowerCase() +
                            path.sep +
                            'retail-launcher-start-',
                    ),
            );
            rmSync(resolved, { recursive: true, force: true });
        }
    },
);

test(
    'launcher uses the tunnel port by default and reads SERVER_PORT from the ordinary env file',
    { skip: !windows },
    () => {
        const directory = mkdtempSync(
            path.join(tmpdir(), 'retail-launcher-settings-'),
        );
        try {
            const query =
                'Get-PenarikanSettings -ProjectDirectory ' +
                quote(directory) +
                ' | ConvertTo-Json -Compress';
            assert.deepEqual(runJson(query), {
                WebPort: 8010,
                WorkerUrl: 'http://127.0.0.1:8010',
            });
            writeFileSync(
                path.join(directory, '.env'),
                'SERVER_PORT="8123"\nAPP_URL=https://retail.example.test\n',
            );
            assert.deepEqual(runJson(query), {
                WebPort: 8123,
                WorkerUrl: 'http://127.0.0.1:8123',
            });
            for (const value of ['0', '65536', 'invalid']) {
                writeFileSync(
                    path.join(directory, '.env'),
                    'SERVER_PORT=' + value + '\n',
                );
                const invalid = powershell(query);
                assert.notEqual(invalid.status, 0);
                assert.match(invalid.stderr, /SERVER_PORT must be between/);
            }
        } finally {
            const resolved = realpathSync(directory);
            assert.ok(
                resolved
                    .toLowerCase()
                    .startsWith(
                        realpathSync(tmpdir()).toLowerCase() +
                            path.sep +
                            'retail-launcher-settings-',
                    ),
            );
            rmSync(resolved, { recursive: true, force: true });
        }
    },
);

test(
    'stop selects only this projects supervisors and service roots',
    { skip: !windows },
    () => {
        const project = 'C:\\Retail App';
        const fixture = [
            {
                ProcessId: 10,
                Name: 'powershell.exe',
                CommandLine:
                    '"powershell.exe" -File "C:\\Retail App\\workers\\jne-report\\start-local.ps1" -Service apex',
            },
            {
                ProcessId: 11,
                Name: 'php.exe',
                CommandLine:
                    '"php.exe" "C:\\Retail App\\artisan" "queue:work" "--queue=default,reconciliation,documents,deliveries"',
            },
            {
                ProcessId: 12,
                Name: 'node.exe',
                CommandLine:
                    '"node.exe" "C:\\Retail App\\workers\\jne-report\\src\\hybrid-cli.mjs" --serve',
            },
            {
                ProcessId: 13,
                Name: 'php.exe',
                CommandLine:
                    '"php.exe" "C:\\Retail App\\artisan" "schedule:work"',
            },
            {
                ProcessId: 14,
                Name: 'php.exe',
                CommandLine:
                    '"php.exe" -S 127.0.0.1:8010 C:\\Retail App\\vendor\\laravel\\framework\\src\\Illuminate\\Foundation\\Console/../resources/server.php',
            },
            {
                ProcessId: 90,
                Name: 'node.exe',
                CommandLine:
                    '"node.exe" "C:\\Other App\\workers\\jne-report\\src\\hybrid-cli.mjs" --serve',
            },
            {
                ProcessId: 91,
                Name: 'php.exe',
                CommandLine:
                    '"php.exe" "C:\\Retail App Extra\\artisan" "queue:work" "--queue=default,reconciliation,documents,deliveries"',
            },
            {
                ProcessId: 92,
                Name: 'powershell.exe',
                CommandLine:
                    '"powershell.exe" -Command "Get-Content C:\\Retail App\\workers\\jne-report\\start-local.ps1 -Service apex"',
            },
            {
                ProcessId: 93,
                Name: 'php.exe',
                CommandLine: '"php.exe" "C:\\Retail App\\artisan" "migrate"',
            },
            {
                ProcessId: 94,
                Name: 'powershell.exe',
                CommandLine:
                    'powershell.exe -Command "Write-Output -File C:\\Retail App\\workers\\jne-report\\start-local.ps1 -Service apex"',
            },
        ];
        const selected = runJson(
            '$processes = ConvertFrom-Json ' +
                quote(JSON.stringify(fixture)) +
                '; ' +
                "$selected = @(foreach ($service in @('web','import','apex','hybrid','scheduler')) { Get-PenarikanServiceProcesses -Processes $processes -ProjectDirectory " +
                quote(project) +
                ' -Service $service }); ' +
                'ConvertTo-Json -InputObject @($selected.ProcessId | Sort-Object -Unique) -Compress',
        );
        assert.deepEqual(selected, [10, 11, 12, 13, 14]);
    },
);

test(
    'stop orders supervisors before children and includes browser descendants without unrelated processes',
    { skip: !windows },
    () => {
        const fixture = [
            { ProcessId: 20, ParentProcessId: 10, Name: 'node.exe' },
            { ProcessId: 10, ParentProcessId: 1, Name: 'powershell.exe' },
            { ProcessId: 30, ParentProcessId: 20, Name: 'chrome.exe' },
            { ProcessId: 40, ParentProcessId: 30, Name: 'chrome.exe' },
            { ProcessId: 90, ParentProcessId: 1, Name: 'node.exe' },
        ];
        const selected = runJson(
            '$processes = ConvertFrom-Json ' +
                quote(JSON.stringify(fixture)) +
                '; ' +
                '$tree = @(Get-PenarikanProcessTree -Processes $processes -Roots @($processes[0],$processes[1])); ' +
                'ConvertTo-Json -InputObject @($tree.ProcessId) -Compress',
        );
        assert.deepEqual(selected, [10, 20, 30, 40]);
    },
);

test(
    'recycled parent process IDs do not capture older unrelated children',
    { skip: !windows },
    () => {
        const selected = runJson(
            "$root = [pscustomobject]@{ProcessId=10;ParentProcessId=1;CreationDate=[datetime]'2026-11-02T10:00:00'}; " +
                "$old = [pscustomobject]@{ProcessId=20;ParentProcessId=10;CreationDate=[datetime]'2026-11-02T09:00:00'}; " +
                "$new = [pscustomobject]@{ProcessId=30;ParentProcessId=10;CreationDate=[datetime]'2026-11-02T10:01:00'}; " +
                '$tree = @(Get-PenarikanProcessTree -Processes @($root,$old,$new) -Roots @($root)); ' +
                'ConvertTo-Json -InputObject @($tree.ProcessId) -Compress',
        );
        assert.deepEqual(selected, [10, 30]);
    },
);

test(
    'start and stop dry runs dispatch to different actions without executing services',
    { skip: !windows },
    () => {
        const options = {
            cwd: projectDirectory,
            encoding: 'utf8',
            windowsHide: true,
            timeout: 20000,
        };
        const start = spawnSync(
            'cmd.exe',
            ['/d', '/c', 'penarikan.bat start --check'],
            options,
        );
        assert.equal(start.status, 0, start.stderr);
        assert.match(start.stdout, /Local web \/ Cloudflare origin:/);
        assert.doesNotMatch(start.stdout, /Would stop|Stopped/);
        const stop = spawnSync(
            'cmd.exe',
            ['/d', '/c', 'penarikan.bat stop --check'],
            options,
        );
        assert.equal(stop.status, 0, stop.stderr);
        assert.match(stop.stdout, /cloudflare: would stop/);
        assert.doesNotMatch(stop.stdout, /would start|started \(/);
    },
);

test(
    'stop terminates an isolated worker and its child while another Node process stays alive',
    { skip: !windows },
    async () => {
        const directory = mkdtempSync(
            path.join(tmpdir(), 'retail-launcher-stop-'),
        );
        const src = path.join(directory, 'workers/jne-report/src');
        mkdirSync(src, { recursive: true });
        const workerFile = path.join(src, 'apex-pool.mjs');
        writeFileSync(
            workerFile,
            "import { spawn } from 'node:child_process';\n" +
                "const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { windowsHide: true, stdio: 'ignore' });\n" +
                'console.log(child.pid);\nsetInterval(() => {}, 1000);\n',
        );
        const sentinel = spawn(
            process.execPath,
            ['-e', 'setInterval(() => {}, 1000)'],
            { windowsHide: true, stdio: 'ignore' },
        );
        const worker = spawn(process.execPath, [workerFile], {
            windowsHide: true,
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        let childPid;
        try {
            const [chunk] = await once(worker.stdout, 'data');
            childPid = Number(chunk.toString().trim());
            assert.ok(childPid > 0);
            const stopped = powershell(
                'Stop-PenarikanProcesses -ProjectDirectory ' + quote(directory),
            );
            assert.equal(stopped.status, 0, stopped.stderr);
            assert.match(stopped.stdout, /Stopped node.exe/);
            assert.throws(() => process.kill(worker.pid, 0), /ESRCH/);
            assert.throws(() => process.kill(childPid, 0), /ESRCH/);
            assert.equal(process.kill(sentinel.pid, 0), true);
            const stoppedAgain = powershell(
                'Stop-PenarikanProcesses -ProjectDirectory ' + quote(directory),
            );
            assert.equal(stoppedAgain.status, 0, stoppedAgain.stderr);
            assert.match(
                stoppedAgain.stdout,
                /No project background processes/,
            );
        } finally {
            worker.kill();
            sentinel.kill();
            if (childPid) {
                try {
                    process.kill(childPid);
                } catch {}
            }
            const resolved = realpathSync(directory);
            assert.ok(
                resolved
                    .toLowerCase()
                    .startsWith(
                        realpathSync(tmpdir()).toLowerCase() +
                            path.sep +
                            'retail-launcher-stop-',
                    ),
            );
            rmSync(resolved, { recursive: true, force: true });
        }
    },
);

test(
    'Cloudflare service permission failures report an actionable error instead of claiming success',
    { skip: !windows },
    () => {
        const failed = powershell(
            "function Get-Service { [pscustomobject]@{Status='Running'} }; " +
                "function Stop-Service { throw 'Access is denied' }; " +
                'Set-PenarikanTunnelState -Action Stop',
        );
        assert.notEqual(failed.status, 0);
        assert.match(failed.stderr, /penarikan-stop.bat as Administrator/);
    },
);
