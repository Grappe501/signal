@echo off
setlocal
set TEMP=H:\THE_SIGNAL_CYCLE\tmp
set TMP=H:\THE_SIGNAL_CYCLE\tmp
set TMPDIR=H:\THE_SIGNAL_CYCLE\tmp
if not exist "%TEMP%" mkdir "%TEMP%"
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\ingest-api-key.ps1"
exit /b %ERRORLEVEL%
