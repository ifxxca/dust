@echo off
setlocal EnableExtensions DisableDelayedExpansion
pushd "%~dp0" || exit /b 1
if "%~1"=="" goto menu
if /i "%~1"=="--help" goto help
set "PENARIKAN_CHECK="
if /i "%~2"=="--check" set "PENARIKAN_CHECK=1"
if not "%~2"=="" if not defined PENARIKAN_CHECK goto invalid
if not "%~3"=="" goto invalid
if /i "%~1"=="start" goto start
if /i "%~1"=="stop" goto stop
if /i "%~1"=="status" goto status
set "PENARIKAN_SERVICE="
if /i "%~1"=="apex" set "PENARIKAN_SERVICE=apex"
if /i "%~1"=="hybrid" set "PENARIKAN_SERVICE=hybrid"
if /i "%~1"=="queue" set "PENARIKAN_SERVICE=import"
if /i "%~1"=="notifications" set "PENARIKAN_SERVICE=notifications"
if /i "%~1"=="scheduler" set "PENARIKAN_SERVICE=scheduler"
if defined PENARIKAN_SERVICE goto service
goto invalid

:menu
echo.
echo === PENARIKAN JNE ===
echo 1. Jalankan semua service dan Cloudflare di background
echo 2. Worker APEX
echo 3. Worker Hybrid PM dan Puman
echo 4. Queue import, rekonsiliasi, dokumen, pengiriman
echo 5. Scheduler otomatis
echo 6. Status service dan Cloudflare
echo 7. Worker notifikasi mobile dan cashless
echo 8. Hentikan semua background dan Cloudflare
echo 0. Keluar
choice /c 123456780 /n /m "Pilih: "
if errorlevel 9 goto success
if errorlevel 8 (call "%~f0" stop & goto menu)
if errorlevel 7 (call "%~f0" notifications & goto menu)
if errorlevel 6 (call "%~f0" status & goto menu)
if errorlevel 5 (call "%~f0" scheduler & goto menu)
if errorlevel 4 (call "%~f0" queue & goto menu)
if errorlevel 3 (call "%~f0" hybrid & goto menu)
if errorlevel 2 (call "%~f0" apex & goto menu)
call "%~f0" start
goto menu

:start
call :require powershell.exe || goto failure
call :require php.exe || goto failure
call :require node.exe || goto failure
call :laravel || goto failure
call :worker || goto failure
if not exist "workers\jne-report\.env.hybrid" goto missing_hybrid
if defined PENARIKAN_CHECK (
    powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%~dp0workers\jne-report\start-local.ps1" -CheckOnly
) else (
    powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%~dp0workers\jne-report\start-local.ps1"
)
goto result

:stop
call :require powershell.exe || goto failure
if defined PENARIKAN_CHECK (
    powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%~dp0workers\jne-report\start-local.ps1" -Stop -CheckOnly
) else (
    powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%~dp0workers\jne-report\start-local.ps1" -Stop
)
goto result

:status
call :require powershell.exe || goto failure
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%~dp0workers\jne-report\start-local.ps1" -Status
goto result

:service
call :require powershell.exe || goto failure
if /i "%PENARIKAN_SERVICE%"=="apex" goto node_service
if /i "%PENARIKAN_SERVICE%"=="hybrid" goto node_service
call :require php.exe || goto failure
call :laravel || goto failure
goto run_service

:node_service
call :require node.exe || goto failure
call :worker || goto failure
if /i "%PENARIKAN_SERVICE%"=="hybrid" if not exist "workers\jne-report\.env.hybrid" goto missing_hybrid

:run_service
if defined PENARIKAN_CHECK (
    powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%~dp0workers\jne-report\start-local.ps1" -Service %PENARIKAN_SERVICE% -CheckOnly
) else (
    echo Service %PENARIKAN_SERVICE% berjalan. Tekan Ctrl+C untuk berhenti.
    powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%~dp0workers\jne-report\start-local.ps1" -Service %PENARIKAN_SERVICE%
)
goto result

:require
where "%~1" >nul 2>nul
if errorlevel 1 (
    echo [ERROR] %~1 tidak ditemukan di PATH. Buka terminal Laragon atau perbaiki PATH.
    exit /b 1
)
exit /b 0

:laravel
if not exist "vendor\autoload.php" (
    echo [ERROR] Dependensi Laravel belum tersedia. Jalankan composer install.
    exit /b 1
)
if not exist ".env" (
    echo [ERROR] File .env Laravel belum tersedia.
    exit /b 1
)
exit /b 0

:worker
if not exist "workers\jne-report\.env" (
    echo [ERROR] File workers\jne-report\.env belum tersedia.
    exit /b 1
)
if not exist "workers\jne-report\node_modules\playwright\package.json" (
    echo [ERROR] Dependensi worker belum tersedia. Jalankan npm ci di workers\jne-report.
    exit /b 1
)
node -e "if (!(Number(process.versions.node.split('.')[0]) >= 24)) { console.error('[ERROR] Worker memerlukan Node.js 24 atau lebih baru.'); process.exit(1); }"
exit /b %errorlevel%

:missing_hybrid
echo [ERROR] File workers\jne-report\.env.hybrid belum tersedia.
goto failure

:invalid
echo [ERROR] Perintah atau opsi tidak dikenal.
echo Gunakan penarikan.bat --help untuk melihat perintah yang tersedia.
goto failure

:help
echo Penggunaan: penarikan.bat [start^|stop^|apex^|hybrid^|queue^|notifications^|scheduler^|status] [--check]
echo Tanpa argumen: buka menu. --check: tampilkan pemeriksaan tanpa mengubah service.
echo start: jalankan semua service dan Cloudflare di background.
echo stop: hentikan proses proyek beserta turunannya dan service Windows Cloudflared.
echo Jalankan sebagai Administrator jika Windows menolak start/stop Cloudflared.
echo Port web mengikuti SERVER_PORT di .env, default 8010; gunakan port yang sama di Cloudflare.
echo apex, hybrid, queue, notifications, scheduler: jalankan di terminal ini sampai Ctrl+C.
echo Log: storage\app\private\jne-worker.
goto success

:result
set "PENARIKAN_EXIT=%errorlevel%"
goto finish

:failure
set "PENARIKAN_EXIT=1"
goto finish

:success
set "PENARIKAN_EXIT=0"

:finish
popd
exit /b %PENARIKAN_EXIT%
