@echo off
setlocal
set TEMP=H:\THE_SIGNAL_CYCLE\tmp
set TMP=H:\THE_SIGNAL_CYCLE\tmp
set TMPDIR=H:\THE_SIGNAL_CYCLE\tmp
set GIT_TMP_DIR=H:\THE_SIGNAL_CYCLE\tmp\git
set NPM_CONFIG_CACHE=H:\THE_SIGNAL_CYCLE\.npm-cache
if not exist "%TEMP%" mkdir "%TEMP%"
if not exist "%GIT_TMP_DIR%" mkdir "%GIT_TMP_DIR%"

powershell -NoProfile -ExecutionPolicy Bypass -File "H:\THE_SIGNAL_CYCLE\scripts\clear-c-temp.ps1"

cd /d "%~dp0.."
echo Working in %CD%

echo [1/4] Copy manuscript to source/
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0copy-source.ps1"
if errorlevel 1 goto fail

echo [2/4] Git init
if not exist .git git init

echo [3/4] Commit
git add -A
git diff --cached --quiet
if errorlevel 1 (
  git commit -m "Deploy The Second Self online reader v3"
) else (
  echo Nothing new to commit
)

echo [4/4] Push to GitHub
git remote remove origin 2>nul
git remote add origin https://github.com/Grappe501/signal.git
git branch -M main
git push -u origin main
if errorlevel 1 goto fail

echo.
echo SUCCESS: https://github.com/Grappe501/signal
goto end

:fail
echo.
echo FAILED - check git auth: gh auth login
pause
exit /b 1

:end
pause
