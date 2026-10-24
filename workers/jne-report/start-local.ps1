param(
    [ValidateSet('web', 'scheduler', 'import', 'apex', 'hybrid')]
    [string] $Service
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
            $serviceArguments = @('--env-file=.env', (Join-Path $PSScriptRoot 'src/worker.mjs'))
        } else {
            $serviceArguments = @('--env-file-if-exists=.env', '--env-file-if-exists=.env.hybrid', (Join-Path $PSScriptRoot 'src/hybrid-cli.mjs'), '--serve')
        }
    } else {
        Set-Location -LiteralPath $projectDirectory
        $runtime = (Get-Command php -CommandType Application).Source
        switch ($Service) {
            'web' { $serviceArguments = @($artisan, 'serve', '--host=127.0.0.1', '--port=8000', '--tries=1', '--no-reload', '--no-interaction') }
            'scheduler' { $serviceArguments = @($artisan, 'schedule:work', '--no-interaction') }
            'import' { $serviceArguments = @($artisan, 'queue:work', '--queue=default', '--sleep=3', '--tries=1', '--timeout=60', '--no-interaction') }
        }
    }
    $child = Start-Process -FilePath $runtime -ArgumentList $serviceArguments -WorkingDirectory (Get-Location).Path -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru -Wait
    exit $child.ExitCode
}

$launcher = Join-Path $PSScriptRoot 'start-local.ps1'
$powershell = Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/powershell.exe'
$startup = New-CimInstance -ClassName Win32_ProcessStartup -ClientOnly -Property @{ ShowWindow = [uint16]0 }
foreach ($name in @('web', 'import', 'apex', 'hybrid', 'scheduler')) {
    $existing = Get-CimInstance Win32_Process | Where-Object {
        $_.CommandLine -match [regex]::Escape($launcher) -and $_.CommandLine -match "-Service\s+$name(?:\s|$)"
    }
    if ($existing) {
        Write-Output "$name already running (PID $($existing.ProcessId -join ', '))."
        continue
    }
    $command = '"{0}" -NoProfile -NonInteractive -WindowStyle Hidden -File "{1}" -Service {2}' -f $powershell, $launcher, $name
    $created = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = $command; CurrentDirectory = $projectDirectory; ProcessStartupInformation = $startup }
    if ($created.ReturnValue -ne 0) {
        throw "Could not launch $name (Windows error $($created.ReturnValue))."
    }
    Write-Output "$name started (PID $($created.ProcessId))."
}
