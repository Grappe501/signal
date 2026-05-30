# Full deploy: copy source + push to GitHub
$ErrorActionPreference = "Stop"
Set-Location "H:\THE_SIGNAL_CYCLE"
. .\env.ps1
& "H:\THE_SIGNAL_CYCLE\scripts\clear-c-temp.ps1"

Set-Location (Split-Path $PSScriptRoot -Parent)

Write-Host "=== Copy manuscript ==="
& "$PSScriptRoot\copy-source.ps1"

Write-Host "=== Git commit ==="
if (-not (Test-Path .git)) { git init }

git add -A
$pending = git status --porcelain
if ($pending) {
  git commit -m "Deploy The Second Self online reader v3"
} else {
  Write-Host "No changes to commit"
}

Write-Host "=== Push to GitHub ==="
git remote remove origin 2>$null
git remote add origin https://github.com/Grappe501/signal.git
git branch -M main
git push -u origin main

Write-Host "Done: https://github.com/Grappe501/signal"
