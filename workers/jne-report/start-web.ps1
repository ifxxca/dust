param(
    [string] $ProjectDirectory = (Join-Path $PSScriptRoot '../..'),
    [ValidateRange(1024, 65535)][int] $Port = 8010,
    [ValidateRange(1, 8)][int] $PhpWorkers = 4,
    [int] $FastCgiPort = 0,
    [string] $NginxPath,
    [switch] $CheckOnly
)

$ErrorActionPreference = 'Stop'
$ProjectDirectory = [IO.Path]::GetFullPath($ProjectDirectory)
. (Join-Path $PSScriptRoot 'local-services.ps1')
$php = (Get-Command php -CommandType Application).Source
$cgi = Join-Path (Split-Path -Parent $php) 'php-cgi.exe'
if (!(Test-Path -LiteralPath $cgi)) { throw "PHP FastCGI is missing beside $php." }
if (!$NginxPath) {
    $installed = Get-Command nginx -CommandType Application -ErrorAction SilentlyContinue
    if ($installed) { $NginxPath = $installed.Source }
    else { $NginxPath = Get-ChildItem 'C:/laragon/bin/nginx' -Filter nginx.exe -Recurse -ErrorAction SilentlyContinue | Sort-Object FullName -Descending | Select-Object -First 1 -ExpandProperty FullName }
}
if (!$NginxPath -or !(Test-Path -LiteralPath $NginxPath)) { throw 'Nginx is not installed. Set LOCAL_WEB_NGINX_PATH to an existing nginx.exe.' }
$NginxPath = [IO.Path]::GetFullPath($NginxPath)
if ($FastCgiPort -eq 0) { $FastCgiPort = $Port + 100 }
if ($FastCgiPort -lt 1024 -or ($FastCgiPort + $PhpWorkers - 1) -gt 65535) { throw 'FastCGI port range must be between 1024 and 65535.' }
$ports = @($FastCgiPort..($FastCgiPort + $PhpWorkers - 1))
if ($Port -in $ports) { throw 'Web and FastCGI ports must be different.' }
$prefix = (Join-Path $ProjectDirectory "storage/app/private/jne-worker/nginx-$Port").Replace('\', '/')
$public = (Join-Path $ProjectDirectory 'public').Replace('\', '/')
$mime = (Join-Path (Split-Path -Parent $NginxPath) 'conf/mime.types').Replace('\', '/')
if (!(Test-Path -LiteralPath $mime)) { throw 'Nginx mime.types is missing.' }
if ($CheckOnly) {
    Write-Output "Nginx: $NginxPath ; PHP: $cgi ; listen: 127.0.0.1:$Port ; FastCGI: $($ports -join ', ') ; root: $public"
    exit 0
}
foreach ($candidate in @($Port) + $ports) {
    if (Test-PenarikanTcpPort -Port $candidate) { throw "Port $candidate is already in use; no process was stopped." }
}
New-Item -ItemType Directory -Path $prefix -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $prefix 'logs') -Force | Out-Null
$upstream = ($ports | ForEach-Object { "        server 127.0.0.1:$_;" }) -join "`n"
$configuration = @'
worker_processes 1;
daemon off;
pid "__PREFIX__/nginx.pid";
error_log "__PREFIX__/error.log" warn;
events { worker_connections 1024; }
http {
    include "__MIME__";
    default_type application/octet-stream;
    access_log "__PREFIX__/access.log";
    sendfile on;
    keepalive_timeout 30;
    client_max_body_size 25m;
    client_body_temp_path "__PREFIX__/client_temp";
    fastcgi_temp_path "__PREFIX__/fastcgi_temp";
    proxy_temp_path "__PREFIX__/proxy_temp";
    uwsgi_temp_path "__PREFIX__/uwsgi_temp";
    scgi_temp_path "__PREFIX__/scgi_temp";
    map $http_x_forwarded_proto $forwarded_https { default ""; https on; }
    upstream retail_php {
        least_conn;
__UPSTREAM__
    }
    server {
        listen 127.0.0.1:__PORT__;
        server_name _;
        root "__PUBLIC__";
        index index.php;
        charset utf-8;
        location / { try_files $uri $uri/ /index.php?$query_string; }
        location ~ /\.(?!well-known).* { deny all; }
        location = /index.php {
            fastcgi_pass retail_php;
            fastcgi_read_timeout 90;
            fastcgi_buffer_size 32k;
            fastcgi_buffers 8 32k;
            fastcgi_param SCRIPT_FILENAME "__PUBLIC__/index.php";
            fastcgi_param QUERY_STRING $query_string;
            fastcgi_param REQUEST_METHOD $request_method;
            fastcgi_param CONTENT_TYPE $content_type;
            fastcgi_param CONTENT_LENGTH $content_length;
            fastcgi_param SCRIPT_NAME /index.php;
            fastcgi_param REQUEST_URI $request_uri;
            fastcgi_param DOCUMENT_URI $document_uri;
            fastcgi_param DOCUMENT_ROOT $document_root;
            fastcgi_param SERVER_PROTOCOL $server_protocol;
            fastcgi_param REQUEST_SCHEME $scheme;
            fastcgi_param HTTPS $forwarded_https if_not_empty;
            fastcgi_param GATEWAY_INTERFACE CGI/1.1;
            fastcgi_param SERVER_SOFTWARE nginx;
            fastcgi_param REMOTE_ADDR $remote_addr;
            fastcgi_param REMOTE_PORT $remote_port;
            fastcgi_param SERVER_ADDR $server_addr;
            fastcgi_param SERVER_PORT $server_port;
            fastcgi_param SERVER_NAME $server_name;
            fastcgi_param REDIRECT_STATUS 200;
            fastcgi_param HTTP_PROXY "";
        }
        location ~ \.php$ { return 404; }
    }
}
'@
$configuration = $configuration.Replace('__PREFIX__', $prefix).Replace('__MIME__', $mime).Replace('__UPSTREAM__', $upstream).Replace('__PORT__', [string] $Port).Replace('__PUBLIC__', $public)
$configPath = Join-Path $prefix 'nginx.conf'
[IO.File]::WriteAllText($configPath, $configuration, [Text.UTF8Encoding]::new($false))
& $NginxPath -p "$prefix/" -c $configPath -t
if ($LASTEXITCODE -ne 0) { throw 'Nginx configuration validation failed.' }
$children = @{}
$nginx = $null
function Start-RetailFastCgi {
    param([int] $ListenPort)
    $arguments = @('-d', ('"doc_root=' + $public + '"'), '-d', 'opcache.enable=1', '-d', 'opcache.validate_timestamps=1', '-d', 'opcache.revalidate_freq=0', '-b', "127.0.0.1:$ListenPort")
    $process = Start-Process -FilePath $cgi -ArgumentList $arguments -WorkingDirectory $ProjectDirectory -WindowStyle Hidden -RedirectStandardOutput "$prefix/php-$ListenPort.stdout.log" -RedirectStandardError "$prefix/php-$ListenPort.stderr.log" -PassThru
    $null = $process.Handle
    return $process
}
try {
    foreach ($listenPort in $ports) { $children[$listenPort] = Start-RetailFastCgi -ListenPort $listenPort }
    $readyDeadline = (Get-Date).AddSeconds(10)
    foreach ($listenPort in $ports) {
        while (!(Test-PenarikanTcpPort -Port $listenPort)) {
            if ($children[$listenPort].HasExited -or (Get-Date) -gt $readyDeadline) { throw "PHP FastCGI did not become ready on port $listenPort." }
            Start-Sleep -Milliseconds 100
        }
    }
    $nginx = Start-Process -FilePath $NginxPath -ArgumentList @('-p', ('"' + $prefix + '/"'), '-c', ('"' + $configPath + '"')) -WorkingDirectory $ProjectDirectory -WindowStyle Hidden -RedirectStandardOutput "$prefix/nginx.stdout.log" -RedirectStandardError "$prefix/nginx.stderr.log" -PassThru
    $null = $nginx.Handle
    $readyDeadline = (Get-Date).AddSeconds(10)
    while (!(Test-PenarikanTcpPort -Port $Port)) {
        if ($nginx.HasExited -or (Get-Date) -gt $readyDeadline) { throw "Nginx did not become ready on port $Port." }
        Start-Sleep -Milliseconds 100
    }
    Write-Output "Nginx ready on 127.0.0.1:$Port with $PhpWorkers PHP FastCGI processes. Logs: $prefix"
    while (!$nginx.WaitForExit(250)) {
        foreach ($listenPort in $ports) {
            if ($children[$listenPort].HasExited) {
                if (((Get-Date) - $children[$listenPort].StartTime).TotalSeconds -lt 3) { throw "PHP FastCGI on port $listenPort failed repeatedly." }
                $children[$listenPort] = Start-RetailFastCgi -ListenPort $listenPort
            }
        }
    }
    if ($nginx.ExitCode -ne 0) { throw "Nginx exited with code $($nginx.ExitCode)." }
} finally {
    $ownedIds = @($children.Values | ForEach-Object { $_.Id })
    if ($nginx) { $ownedIds += $nginx.Id }
    $processes = @(Get-CimInstance Win32_Process)
    $roots = @($processes | Where-Object { $_.ProcessId -in $ownedIds })
    foreach ($child in @(Get-PenarikanProcessTree -Processes $processes -Roots $roots)) {
        Stop-Process -Id $child.ProcessId -ErrorAction SilentlyContinue
    }
}
