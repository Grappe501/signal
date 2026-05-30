# Clear user temp on C: (safe — only %LOCALAPPDATA%\Temp and %TEMP% if on C:)
$ErrorActionPreference = "SilentlyContinue"
$freed = 0

$targets = @(
    "$env:LOCALAPPDATA\Temp",
    "$env:USERPROFILE\AppData\Local\Temp",
    "C:\Users\User\AppData\Local\Temp"
)

foreach ($dir in $targets) {
    if (-not (Test-Path $dir)) { continue }
    if ($dir -notlike "C:*") { continue }
    Write-Host "Clearing $dir ..."
    Get-ChildItem $dir -Force -ErrorAction SilentlyContinue | ForEach-Object {
        try {
            $size = ($_.Length) -as [long]
            Remove-Item $_.FullName -Recurse -Force -ErrorAction Stop
            $freed += $size
        } catch {}
    }
}

Write-Host "C: user temp cleared (approx $([math]::Round($freed/1MB,1)) MB)"
