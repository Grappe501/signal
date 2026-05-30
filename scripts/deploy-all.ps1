# Full deploy: H: env → clear C: temp → copy source → git push
$ErrorActionPreference = "Stop"
Set-Location "H:\THE_SIGNAL_CYCLE"
. .\env.ps1

Write-Host "=== Clear C: user temp ==="
& "$PSScriptRoot\clear-c-temp.ps1"

Write-Host "=== Deploy reader to GitHub ==="
Set-Location "H:\THE_SIGNAL_CYCLE\reader"
python deploy.py

if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host "=== Done ==="
