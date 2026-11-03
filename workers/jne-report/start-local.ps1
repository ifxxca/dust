param(
    [ValidateSet('web', 'scheduler', 'import', 'reconciliation', 'documents', 'notifications', 'apex', 'hybrid')]
    [string] $Service,
    [switch] $CheckOnly,
    [switch] $Status,
    [switch] $Stop,
    [switch] $KeepTunnel
)

$ErrorActionPreference = 'Stop'
$projectDirectory = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$logDirectory = Join-Path $projectDirectory 'storage/app/private/jne-worker'
. (Join-Path $PSScriptRoot 'local-services.ps1')

if (($Service -and ($Status -or $Stop)) -or ($Status -and $Stop)) {
    throw 'Choose a service, -Status, or -Stop.'
}
if ($Stop) {
    Stop-PenarikanProcesses -ProjectDirectory $projectDirectory -CheckOnly:$CheckOnly
    if (!$KeepTunnel) { Set-PenarikanTunnelState -Action Stop -CheckOnly:$CheckOnly }
    exit 0
}
$settings = Get-PenarikanSettings -ProjectDirectory $projectDirectory

if ($Service) {
    $artisan = Join-Path $projectDirectory 'artisan'
    if ($Service -in @('apex', 'hybrid')) {
        Set-Location -LiteralPath $PSScriptRoot
        $runtime = (& node -p 'process.execPath').Trim()
        $env:RETAIL_OPERATIONS_URL = $settings.WorkerUrl
        if ($Service -eq 'apex') {
            $serviceArguments = @('--env-file=.env', (Join-Path $PSScriptRoot 'src/apex-pool.mjs'))
        } else {
            $serviceArguments = @('--env-file-if-exists=.env', '--env-file-if-exists=.env.hybrid', (Join-Path $PSScriptRoot 'src/hybrid-cli.mjs'), '--serve')
        }
    } else {
        Set-Location -LiteralPath $projectDirectory
        $runtime = (Get-Command php -CommandType Application).Source
        switch ($Service) {
            'web' { $serviceArguments = @($artisan, 'serve', '--host=127.0.0.1', "--port=$($settings.WebPort)", '--tries=1', '--no-reload', '--no-interaction') }
            'scheduler' { $serviceArguments = @($artisan, 'schedule:work', '--no-interaction') }
            'import' { $serviceArguments = @($artisan, 'queue:work', '--queue=default,reconciliation,documents,deliveries', '--sleep=3', '--tries=1', '--timeout=75', '--no-interaction') }
            'reconciliation' { $serviceArguments = @($artisan, 'queue:work', '--queue=reconciliation', '--sleep=3', '--tries=4', '--timeout=75', '--no-interaction') }
            'documents' { $serviceArguments = @($artisan, 'queue:work', '--queue=documents,deliveries', '--sleep=3', '--tries=4', '--timeout=75', '--no-interaction') }
            'notifications' { $serviceArguments = @($artisan, 'queue:work', 'database', '--queue=mobile-push', '--sleep=2', '--tries=1', '--timeout=60', '--no-interaction') }
        }
    }
    if ($CheckOnly) {
        Write-Output "$Service command: $runtime $($serviceArguments -join ' ')"
        if ($Service -in @('apex', 'hybrid')) { Write-Output "Worker URL: $($settings.WorkerUrl)" }
        exit 0
    }
    New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
    $quotedArguments = @($serviceArguments | ForEach-Object { '"' + $_ + '"' })
    do {
        $logStamp = Get-Date -Format 'yyyyMMdd-HHmmss'
        $stdout = Join-Path $logDirectory "local-$Service-$logStamp.stdout.log"
        $stderr = Join-Path $logDirectory "local-$Service-$logStamp.stderr.log"
        $child = Start-Process -FilePath $runtime -ArgumentList $quotedArguments -WorkingDirectory (Get-Location).Path -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru
        try {
            while (!$child.WaitForExit(250)) {}
            $child.Refresh()
        } finally {
            if (!$child.HasExited) {
                $cleanupProcesses = @(Get-CimInstance Win32_Process)
                $cleanupRoots = @($cleanupProcesses | Where-Object { $_.ProcessId -eq $child.Id })
                foreach ($cleanupProcess in @(Get-PenarikanProcessTree -Processes $cleanupProcesses -Roots $cleanupRoots)) {
                    Stop-Process -Id $cleanupProcess.ProcessId -ErrorAction SilentlyContinue
                }
            }
        }
        $restartWorker = $Service -in @('import', 'reconciliation', 'documents', 'notifications') -and $child.ExitCode -in @(0, 12)
        if ($restartWorker) { Start-Sleep -Seconds 5 }
    } while ($restartWorker)
    exit $child.ExitCode
}

$launcher = Join-Path $PSScriptRoot 'start-local.ps1'
$powershell = Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/powershell.exe'
$runningProcesses = @(Get-CimInstance Win32_Process)
if (!$Status -and !$CheckOnly) {
    if (Test-Path -LiteralPath (Join-Path $projectDirectory 'public/hot')) {
        throw 'Vite development server assets are active. Stop npm run dev and run npm run build before public tunnel access.'
    }
    if (!(Test-Path -LiteralPath (Join-Path $projectDirectory 'public/build/manifest.json'))) {
        throw 'Frontend assets are missing. Run npm run build first.'
    }
}
Write-Output "Local web / Cloudflare origin: $($settings.WorkerUrl)"
foreach ($name in @('web', 'import', 'reconciliation', 'documents', 'notifications', 'apex', 'hybrid', 'scheduler')) {
    $existing = @(Get-PenarikanServiceProcesses -Processes $runningProcesses -ProjectDirectory $projectDirectory -Service $name)
    if ($name -eq 'web') {
        $listener = Get-PenarikanWebListener -Processes $runningProcesses -ProjectDirectory $projectDirectory -Port $settings.WebPort
        if ($listener) {
            Write-Output "web already running on port $($settings.WebPort) (PID $($listener.ProcessId))."
            continue
        }
        if ($existing) {
            if (!$Status -and !$CheckOnly) {
                $null = Wait-PenarikanWebServer -ProjectDirectory $projectDirectory -Port $settings.WebPort
                Write-Output "web ready on port $($settings.WebPort)."
            } else {
                Write-Output "web process exists but port $($settings.WebPort) is not ready; no duplicate would start."
            }
            continue
        }
    }
    if ($existing) {
        Write-Output "$name already running (PID $($existing.ProcessId -join ', '))."
        continue
    }
    if ($Status) { Write-Output "$name not running."; continue }
    if ($CheckOnly) { Write-Output "$name would start in the background."; continue }
    New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
    $supervisorArguments = @('-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-File', ('"' + $launcher + '"'), '-Service', $name)
    $supervisorStamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
    $supervisorStdout = Join-Path $logDirectory "supervisor-$name-$supervisorStamp.stdout.log"
    $supervisorStderr = Join-Path $logDirectory "supervisor-$name-$supervisorStamp.stderr.log"
    $supervisor = Start-Process -FilePath $powershell -ArgumentList $supervisorArguments -WorkingDirectory $projectDirectory -WindowStyle Hidden -RedirectStandardOutput $supervisorStdout -RedirectStandardError $supervisorStderr -PassThru
    Write-Output "$name started (supervisor PID $($supervisor.Id))."
    if ($name -eq 'web') {
        $null = Wait-PenarikanWebServer -ProjectDirectory $projectDirectory -Port $settings.WebPort -Supervisor $supervisor
        Write-Output "web ready on port $($settings.WebPort)."
    }
}
if (!$KeepTunnel) {
    $tunnelAction = if ($Status) { 'Status' } else { 'Start' }
    Set-PenarikanTunnelState -Action $tunnelAction -CheckOnly:$CheckOnly
}
Write-Output "Logs: $logDirectory"
