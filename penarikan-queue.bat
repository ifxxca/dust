@echo off
setlocal EnableExtensions DisableDelayedExpansion
call "%~dp0penarikan.bat" queue %*
set "PENARIKAN_EXIT=%errorlevel%"
if /i not "%~1"=="--check" pause
exit /b %PENARIKAN_EXIT%
