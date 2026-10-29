@echo off
setlocal EnableExtensions DisableDelayedExpansion
cd /d "%~dp0"
php artisan cashless:entries --no-interaction %*
exit /b %errorlevel%
