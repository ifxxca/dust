function Get-PenarikanSettings {
    param([string] $ProjectDirectory)

    $webPort = 8010
    $environmentFile = Join-Path $ProjectDirectory '.env'
    if (Test-Path -LiteralPath $environmentFile) {
        foreach ($line in Get-Content -LiteralPath $environmentFile) {
            if ($line -match '^\s*SERVER_PORT\s*=\s*(.*?)\s*$') {
                $configuredPort = $Matches[1].Trim('"', "'")
                if (![int]::TryParse($configuredPort, [ref] $webPort)) {
                    throw 'SERVER_PORT must be between 1 and 65535.'
                }
            }
        }
    }
    if ($webPort -lt 1 -or $webPort -gt 65535) {
        throw 'SERVER_PORT must be between 1 and 65535.'
    }
    [pscustomobject]@{ WebPort = $webPort; WorkerUrl = "http://127.0.0.1:$webPort" }
}

function Get-PenarikanServiceProcesses {
    param([object[]] $Processes, [string] $ProjectDirectory, [string] $Service)

    $projectPath = [regex]::Escape($ProjectDirectory.TrimEnd('\', '/'))
    $launcherPath = $projectPath + '[\\/]workers[\\/]jne-report[\\/]start-local\.ps1'
    $artisanPattern = '(?:^|[\s"])' + $projectPath + '[\\/]artisan"?\s+"?(?<artisanCommand>serve|queue:work|schedule:work)"?(?:\s|$)'
    $workerPattern = '(?:^|[\s"])' + $projectPath + '[\\/]workers[\\/]jne-report[\\/]src[\\/]'
    foreach ($process in $Processes) {
        $commandLine = [string] $process.CommandLine
        $processName = [string] $process.Name
        $launcherPattern = '(?:^|[\s"])-File\s+"?' + $launcherPath + '"?(?:\s|$)'
        $servicePattern = '-Service\s+"?' + [regex]::Escape($Service) + '"?(?:\s|$)'
        if ($processName -match '^(powershell|pwsh)\.exe$' -and
            $commandLine -notmatch '(?:^|\s)-(?:Command|EncodedCommand|c|e)(?:\s|:)' -and
            $commandLine -match $launcherPattern -and $commandLine -match $servicePattern) {
            $process
            continue
        }
        if ($processName -eq 'php.exe' -and $commandLine -match $artisanPattern) {
            $artisanCommand = $Matches.artisanCommand
            $matchesService = switch ($Service) {
                'web' { $artisanCommand -eq 'serve' }
                'scheduler' { $artisanCommand -eq 'schedule:work' }
                'import' { $artisanCommand -eq 'queue:work' -and $commandLine -match '--queue=default,reconciliation,documents,deliveries(?:["\s]|$)' }
                'reconciliation' { $artisanCommand -eq 'queue:work' -and $commandLine -match '--queue=reconciliation(?:["\s]|$)' }
                'documents' { $artisanCommand -eq 'queue:work' -and $commandLine -match '--queue=documents,deliveries(?:["\s]|$)' }
                'notifications' { $artisanCommand -eq 'queue:work' -and $commandLine -match '--queue=(?:[a-z0-9_-]+,)*mobile-push(?:,[a-z0-9_-]+)*(?:["\s]|$)' }
                default { $false }
            }
            if ($matchesService) { $process }
            continue
        }
        $serverPattern = $projectPath + '[\\/]vendor[\\/]laravel[\\/]framework[\\/]src[\\/]Illuminate[\\/]Foundation[\\/]Console[\\/]\.\.[\\/]resources[\\/]server\.php(?:"|\s|$)'
        if ($Service -eq 'web' -and $processName -eq 'php.exe' -and $commandLine -match '(?:^|\s)-S\s+127\.0\.0\.1:\d+(?:\s|$)' -and $commandLine -match $serverPattern) {
            $process
        }
        if ($processName -eq 'node.exe') {
            if ($Service -eq 'apex' -and $commandLine -match ($workerPattern + '(?:apex-pool|worker)\.mjs(?:"|\s|$)')) { $process }
            if ($Service -eq 'hybrid' -and $commandLine -match ($workerPattern + 'hybrid-cli\.mjs(?:"|\s|$)') -and $commandLine -match '--serve(?:["\s]|$)') { $process }
        }
    }
}

function Test-PenarikanTcpPort {
    param([int] $Port)

    $client = [Net.Sockets.TcpClient]::new()
    try {
        $connection = $client.BeginConnect('127.0.0.1', $Port, $null, $null)
        try {
            if (!$connection.AsyncWaitHandle.WaitOne(250)) { return $false }
            $client.EndConnect($connection)
            return $client.Connected
        } finally {
            $connection.AsyncWaitHandle.Close()
        }
    } catch {
        return $false
    } finally {
        $client.Dispose()
    }
}

function Get-PenarikanWebListener {
    param([object[]] $Processes, [string] $ProjectDirectory, [int] $Port)

    if (!(Test-PenarikanTcpPort -Port $Port)) { return }
    $webProcesses = @(Get-PenarikanServiceProcesses -Processes $Processes -ProjectDirectory $ProjectDirectory -Service web)
    $listener = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($listener) {
        if ($listener.OwningProcess -notin @($webProcesses.ProcessId)) {
            throw "Port $Port is owned by another application (PID $($listener.OwningProcess))."
        }
        return [pscustomobject]@{ ProcessId = $listener.OwningProcess }
    }

    # Windows may omit a reachable listener from its TCP inventory. Require the project's PHP server on this exact port.
    $server = $webProcesses | Where-Object {
        $_.Name -eq 'php.exe' -and $_.CommandLine -match "(?:^|\s)-S\s+127\.0\.0\.1:$Port(?:\s|$)"
    } | Select-Object -First 1
    if (!$server) {
        throw "Port $Port is reachable, but its owner could not be verified as this project's web server. No additional web server was started."
    }
    [pscustomobject]@{ ProcessId = $server.ProcessId }
}

function Wait-PenarikanWebServer {
    param([string] $ProjectDirectory, [int] $Port, [Diagnostics.Process] $Supervisor, [int] $TimeoutSeconds = 15)

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    do {
        $processes = @(Get-CimInstance Win32_Process)
        $listener = Get-PenarikanWebListener -Processes $processes -ProjectDirectory $ProjectDirectory -Port $Port
        if ($listener) { return $listener }
        if ($Supervisor -and $Supervisor.HasExited) { break }
        Start-Sleep -Milliseconds 250
    } while ((Get-Date) -lt $deadline)
    throw "Web server did not start on port $Port. Check $(Join-Path $ProjectDirectory 'storage/app/private/jne-worker') (local-web-* and supervisor-web-* logs)."
}

function Get-PenarikanProcessTree {
    param([object[]] $Processes, [object[]] $Roots)

    $byId = @{}
    $rootIds = @{}
    foreach ($process in $Processes) { $byId[[string] $process.ProcessId] = $process }
    foreach ($root in $Roots) { $rootIds[[string] $root.ProcessId] = $true }
    $selected = @{}
    $pending = [Collections.Generic.Queue[object]]::new()
    foreach ($root in $Roots) {
        $parentKey = [string] $root.ParentProcessId
        $visited = @{}
        $hasRootAncestor = $false
        while ($byId.ContainsKey($parentKey) -and !$visited.ContainsKey($parentKey)) {
            $visited[$parentKey] = $true
            if ($rootIds.ContainsKey($parentKey)) { $hasRootAncestor = $true; break }
            $parentKey = [string] $byId[$parentKey].ParentProcessId
        }
        if (!$hasRootAncestor) { $pending.Enqueue($root) }
    }
    while ($pending.Count -gt 0) {
        $process = $pending.Dequeue()
        $processKey = [string] $process.ProcessId
        if ($selected.ContainsKey($processKey)) { continue }
        $selected[$processKey] = $true
        $process
        foreach ($child in $Processes) {
            if ($child.ParentProcessId -eq $process.ProcessId -and
                (!$process.CreationDate -or !$child.CreationDate -or $child.CreationDate -ge $process.CreationDate)) {
                $pending.Enqueue($child)
            }
        }
    }
}

function Stop-PenarikanProcesses {
    param([string] $ProjectDirectory, [switch] $CheckOnly)

    $processes = @(Get-CimInstance Win32_Process)
    $roots = @(
        foreach ($serviceName in @('web', 'scheduler', 'import', 'reconciliation', 'documents', 'notifications', 'apex', 'hybrid')) {
            Get-PenarikanServiceProcesses -Processes $processes -ProjectDirectory $ProjectDirectory -Service $serviceName
        }
    )
    $tree = @(Get-PenarikanProcessTree -Processes $processes -Roots $roots)
    if (!$tree) { Write-Host 'No project background processes are running.'; return }
    if ($CheckOnly) {
        foreach ($process in $tree) {
            Write-Host "Would stop $($process.Name) (PID $($process.ProcessId))."
        }
        return
    }
    for ($attempt = 0; $attempt -lt 3; $attempt++) {
        foreach ($process in $tree) {
            $current = Get-CimInstance Win32_Process -Filter "ProcessId=$($process.ProcessId)" -ErrorAction Stop
            if (!$current -or $current.CreationDate -ne $process.CreationDate) { continue }
            try {
                Stop-Process -Id $process.ProcessId -ErrorAction Stop
            } catch {
                if (Get-Process -Id $process.ProcessId -ErrorAction SilentlyContinue) { throw }
                continue
            }
            Write-Host "Stopped $($process.Name) (PID $($process.ProcessId))."
        }
        $processes = @(Get-CimInstance Win32_Process)
        $tree = @(Get-PenarikanProcessTree -Processes $processes -Roots $tree)
        $survivors = @($tree | Where-Object {
            $known = $_
            $processes | Where-Object { $_.ProcessId -eq $known.ProcessId -and $_.CreationDate -eq $known.CreationDate }
        })
        if (!$survivors) { return }
    }
    throw 'Some project processes are still running. Check permissions and run stop again.'
}

function Set-PenarikanTunnelState {
    param([ValidateSet('Start', 'Stop', 'Status')] [string] $Action, [switch] $CheckOnly)

    $tunnel = Get-Service -Name Cloudflared -ErrorAction SilentlyContinue
    if (!$tunnel) {
        Write-Warning 'Cloudflared Windows service is not installed. Configure the named tunnel first.'
        return
    }
    if ($Action -eq 'Status') { Write-Host "cloudflare: $($tunnel.Status) (Windows service Cloudflared)."; return }
    if ($CheckOnly) { Write-Host "cloudflare: would $($Action.ToLower()) Windows service Cloudflared."; return }
    try {
        if ($Action -eq 'Start' -and $tunnel.Status -ne 'Running') { Start-Service -Name Cloudflared -ErrorAction Stop }
        if ($Action -eq 'Stop' -and $tunnel.Status -ne 'Stopped') { Stop-Service -Name Cloudflared -ErrorAction Stop }
        $tunnel.Refresh()
        Write-Host "cloudflare: $($tunnel.Status)."
    } catch {
        throw "Could not $($Action.ToLower()) Cloudflared. Run penarikan-$($Action.ToLower()).bat as Administrator. $($_.Exception.Message)"
    }
}
