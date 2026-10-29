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
if /i "%~1"=="apex" goto apex
if /i "%~1"=="hybrid" goto hybrid
if /i "%~1"=="queue" goto queue
if /i "%~1"=="notifications" goto notifications
if /i "%~1"=="scheduler" goto scheduler
if /i "%~1"=="status" goto status
goto invalid

:menu
echo.
echo === PENARIKAN JNE ===
echo 1. Jalankan semua service di background
echo 2. Worker APEX
echo 3. Worker Hybrid PM dan Puman
echo 4. Queue import, rekonsiliasi, dokumen, pengiriman
echo 5. Scheduler otomatis
echo 6. Status service
echo 7. Worker notifikasi mobile dan cashless
echo 0. Keluar
choice /c 12345670 /n /m "Pilih: "
if errorlevel 8 goto success
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

:apex
call :require node.exe || goto failure
call :worker || goto failure
if defined PENARIKAN_CHECK goto checked
echo Pool worker APEX berjalan sesuai JNE_APEX_CONCURRENCY. Tekan Ctrl+C untuk berhenti.
pushd "workers\jne-report" || goto failure
node --env-file=.env src/apex-pool.mjs
set "PENARIKAN_EXIT=%errorlevel%"
popd
goto finish

:hybrid
call :require node.exe || goto failure
call :worker || goto failure
if not exist "workers\jne-report\.env.hybrid" goto missing_hybrid
if defined PENARIKAN_CHECK goto checked
echo Worker Hybrid PM dan Puman berjalan. Tekan Ctrl+C untuk berhenti.
pushd "workers\jne-report" || goto failure
node --env-file-if-exists=.env --env-file-if-exists=.env.hybrid src/hybrid-cli.mjs --serve
set "PENARIKAN_EXIT=%errorlevel%"
popd
goto finish

:queue
call :require php.exe || goto failure
call :laravel || goto failure
if defined PENARIKAN_CHECK goto checked
echo Queue import dan rekonsiliasi berjalan. Tekan Ctrl+C untuk berhenti.
:queue_run
php artisan queue:work --queue=default,reconciliation,documents,deliveries --sleep=3 --tries=1 --timeout=75 --no-interaction
set "PENARIKAN_EXIT=%errorlevel%"
if "%PENARIKAN_EXIT%"=="0" goto queue_restart
if "%PENARIKAN_EXIT%"=="12" goto queue_restart
goto finish

:queue_restart
echo Worker melakukan pergantian proses. Menjalankan kembali dalam 5 detik...
timeout /t 5 /nobreak >nul
goto queue_run

:scheduler
call :require php.exe || goto failure
call :laravel || goto failure
if defined PENARIKAN_CHECK goto checked
echo Scheduler berjalan setiap menit. Tekan Ctrl+C untuk berhenti.
php artisan schedule:work --no-interaction
goto result

:notifications
call :require php.exe || goto failure
call :laravel || goto failure
if defined PENARIKAN_CHECK goto checked
echo Worker notifikasi mobile dan cashless berjalan. Tekan Ctrl+C untuk berhenti.
:notifications_run
php artisan queue:work database --queue=mobile-push --sleep=2 --tries=1 --timeout=60 --no-interaction
set "PENARIKAN_EXIT=%errorlevel%"
if "%PENARIKAN_EXIT%"=="0" goto notifications_restart
if "%PENARIKAN_EXIT%"=="12" goto notifications_restart
goto finish

:notifications_restart
echo Worker notifikasi melakukan pergantian proses. Menjalankan kembali dalam 5 detik...
timeout /t 5 /nobreak >nul
goto notifications_run

:status
call :require powershell.exe || goto failure
call :require node.exe || goto failure
call :worker || goto failure
if not exist "workers\jne-report\.env.hybrid" goto missing_hybrid
if defined PENARIKAN_CHECK goto checked
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%~dp0workers\jne-report\start-local.ps1" -Status
if errorlevel 1 goto failure
echo.
echo Status sesi Hybrid:
pushd "workers\jne-report" || goto failure
node --env-file-if-exists=.env --env-file-if-exists=.env.hybrid src/hybrid-cli.mjs --status
set "PENARIKAN_EXIT=%errorlevel%"
popd
goto finish

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

:checked
echo [OK] Prasyarat %~1 tersedia. Tidak ada service atau penarikan yang dijalankan.
goto success

:invalid
echo [ERROR] Perintah atau opsi tidak dikenal.
echo Gunakan penarikan.bat --help untuk melihat perintah yang tersedia.
goto failure

:help
echo Penggunaan: penarikan.bat [start^|apex^|hybrid^|queue^|notifications^|scheduler^|status] [--check]
echo Tanpa argumen: buka menu. --check: periksa prasyarat tanpa menjalankan service.
echo start: jalankan semua service di background; log di storage\app\private\jne-worker.
echo apex, hybrid, queue, notifications, scheduler: jalankan di terminal ini sampai Ctrl+C.
echo notifications: queue database mobile-push untuk assignment dan hasil cashless.
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
