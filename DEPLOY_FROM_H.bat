@echo off
title Deploy Signal Reader (H: drive only)
setlocal EnableDelayedExpansion

set BASE=H:\THE_SIGNAL_CYCLE
set TEMP=%BASE%\tmp
set TMP=%BASE%\tmp
set TMPDIR=%BASE%\tmp
set GIT_TMP_DIR=%BASE%\tmp\git
set NPM_CONFIG_CACHE=%BASE%\.npm-cache
set PIP_CACHE_DIR=%BASE%\.pip-cache
set PYTHONPYCACHEPREFIX=%BASE%\tmp\pycache

for %%D in ("%BASE%\tmp" "%BASE%\tmp\git" "%BASE%\.npm-cache" "%BASE%\.pip-cache") do (
  if not exist "%%~D" mkdir "%%~D"
)

echo ========================================
echo  Signal Reader Deploy — H: drive ONLY
echo ========================================
echo.

echo [1/5] Clearing C: user temp...
powershell -NoProfile -ExecutionPolicy Bypass -File "%BASE%\scripts\clear-c-temp.ps1"
echo.

echo [2/5] Copying manuscript to reader\source\...
cd /d "%BASE%\reader"
powershell -NoProfile -ExecutionPolicy Bypass -File "%BASE%\reader\scripts\copy-source.ps1"
if errorlevel 1 goto fail
echo.

echo [3/5] Git init...
if not exist .git git init
echo.

echo [4/5] Commit...
git add -A
git diff --cached --quiet
if errorlevel 1 (
  git commit -m "Deploy The Second Self online reader v3"
) else (
  echo Nothing new to commit
)
echo.

echo [5/5] Push to GitHub...
git remote remove origin 2>nul
git remote add origin https://github.com/Grappe501/signal.git
git branch -M main
git push -u origin main
if errorlevel 1 goto fail

echo.
echo SUCCESS: https://github.com/Grappe501/signal
echo Netlify will auto-deploy from main.
pause
exit /b 0

:fail
echo.
echo FAILED — if auth error, run: gh auth login
pause
exit /b 1
