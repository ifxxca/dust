param(
    [ValidateSet('web', 'scheduler', 'import', 'reconciliation', 'documents', 'notifications', 'apex', 'hybrid')]
    [string] $Service,
    [switch] $CheckOnly,
    [switch] $Status
)

$ErrorActionPreference = 'Stop'
$projectDirectory = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$logDirectory = Join-Path $projectDirectory 'storage/app/private/jne-worker'
New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null

if ($Service) {
    $logStamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $stdout = Join-Path $logDirectory "local-$Service-$logStamp.stdout.log"
    $stderr = Join-Path $logDirectory "local-$Service-$logStamp.stderr.log"
    $artisan = Join-Path $projectDirectory 'artisan'
    if ($Service -in @('apex', 'hybrid')) {
        Set-Location -LiteralPath $PSScriptRoot
        $runtime = (& node -p 'process.execPath').Trim()
        if ($Service -eq 'apex') {
            $serviceArguments = @('--env-file=.env', (Join-Path $PSScriptRoot 'src/apex-pool.mjs'))
        } else {
            $serviceArguments = @('--env-file-if-exists=.env', '--env-file-if-exists=.env.hybrid', (Join-Path $PSScriptRoot 'src/hybrid-cli.mjs'), '--serve')
        }
    } else {
        Set-Location -LiteralPath $projectDirectory
        $runtime = (Get-Command php -CommandType Application).Source
        switch ($Service) {
            'web' { $serviceArguments = @($artisan, 'serve', '--host=127.0.0.1', '--port=8000', '--tries=1', '--no-reload', '--no-interaction') }
            'scheduler' { $serviceArguments = @($artisan, 'schedule:work', '--no-interaction') }
            'import' { $serviceArguments = @($artisan, 'queue:work', '--queue=default,reconciliation,documents,deliveries', '--sleep=3', '--tries=1', '--timeout=75', '--no-interaction') }
            'reconciliation' { $serviceArguments = @($artisan, 'queue:work', '--queue=reconciliation', '--sleep=3', '--tries=4', '--timeout=75', '--no-interaction') }
            'documents' { $serviceArguments = @($artisan, 'queue:work', '--queue=documents,deliveries', '--sleep=3', '--tries=4', '--timeout=75', '--no-interaction') }
            'notifications' { $serviceArguments = @($artisan, 'queue:work', 'database', '--queue=mobile-push', '--sleep=2', '--tries=1', '--timeout=60', '--no-interaction') }
        }
    }
    if ($Status) {
        throw 'Use -Status without -Service.'
    }
    if ($CheckOnly) {
        Write-Output "$Service command: $runtime $($serviceArguments -join ' ')"
        exit 0
    }
    $quotedArguments = @($serviceArguments | ForEach-Object { '"' + $_ + '"' })
    do {
        $child = Start-Process -FilePath $runtime -ArgumentList $quotedArguments -WorkingDirectory (Get-Location).Path -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru -Wait
        $restartImport = $Service -in @('import', 'reconciliation', 'documents', 'notifications') -and $child.ExitCode -in @(0, 12)
        if ($restartImport) {
            Start-Sleep -Seconds 5
            $logStamp = Get-Date -Format 'yyyyMMdd-HHmmss'
            $stdout = Join-Path $logDirectory "local-$Service-$logStamp.stdout.log"
            $stderr = Join-Path $logDirectory "local-$Service-$logStamp.stderr.log"
        }
    } while ($restartImport)
    exit $child.ExitCode
}

$launcher = Join-Path $PSScriptRoot 'start-local.ps1'
$powershell = Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/powershell.exe'
$startup = New-CimInstance -ClassName Win32_ProcessStartup -ClientOnly -Property @{ ShowWindow = [uint16]0 }
$runningProcesses = @(Get-CimInstance Win32_Process)
foreach ($name in @('web', 'import', 'reconciliation', 'documents', 'notifications', 'apex', 'hybrid', 'scheduler')) {
    $existing = @($runningProcesses | Where-Object {
        $name -ne 'apex' -and
        $_.CommandLine -match [regex]::Escape($launcher) -and $_.CommandLine -match "-Service\s+$name(?:\s|$)"
    })
    if (-not $existing) {
        $existing = @($runningProcesses | Where-Object {
            $commandLine = $_.CommandLine
            $processName = $_.Name
            switch ($name) {
                'scheduler' { $processName -eq 'php.exe' -and $commandLine -match '(?:^|[\\/\s"])artisan"?\s+schedule:work(?:\s|$)' }
                'import' { $processName -eq 'php.exe' -and $commandLine -match 'queue:work' -and $commandLine -match '--queue=default,reconciliation,documents,deliveries(?:\s|$)' }
                'reconciliation' { $processName -eq 'php.exe' -and $commandLine -match [regex]::Escape($projectDirectory) -and $commandLine -match 'queue:work' -and $commandLine -match '--queue=reconciliation(?:\s|$)' }
                'documents' { $processName -eq 'php.exe' -and $commandLine -match [regex]::Escape($projectDirectory) -and $commandLine -match 'queue:work' -and $commandLine -match '--queue=documents,deliveries(?:\s|$)' }
                'notifications' { $processName -eq 'php.exe' -and $commandLine -match 'queue:work' -and $commandLine -match '(?:^|[\s"])database(?:["\s]|$)' -and $commandLine -match '--queue=(?:[a-z0-9_-]+,)*mobile-push(?:,[a-z0-9_-]+)*(?:["\s]|$)' }
                'apex' { $processName -eq 'node.exe' -and $commandLine -match '(?:^|[\\/\s"])apex-pool\.mjs(?:"|\s|$)' }
                'hybrid' { $processName -eq 'node.exe' -and $commandLine -match '(?:^|[\\/\s"])hybrid-cli\.mjs(?:"|\s|$)' -and $commandLine -match '--serve(?:\s|$)' }
                default { $false }
            }
        })
    }
    if ($name -eq 'web' -and -not $existing) {
        $listener = Get-NetTCPConnection -State Listen -LocalPort 8000 -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($listener) {
            Write-Output "web: port 8000 already in use (PID $($listener.OwningProcess)); using the existing server."
            continue
        }
    }
    if ($existing) {
        Write-Output "$name already running (PID $($existing.ProcessId -join ', '))."
        continue
    }
    if ($Status) {
        Write-Output "$name not running."
        continue
    }
    if ($CheckOnly) {
        Write-Output "$name would start in the background."
        continue
    }
    $command = '"{0}" -NoProfile -NonInteractive -WindowStyle Hidden -File "{1}" -Service {2}' -f $powershell, $launcher, $name
    $created = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = $command; CurrentDirectory = $projectDirectory; ProcessStartupInformation = $startup }
    if ($created.ReturnValue -ne 0) {
        throw "Could not launch $name (Windows error $($created.ReturnValue))."
    }
    Write-Output "$name started (PID $($created.ProcessId))."
}
Write-Output "Logs: $logDirectory"
