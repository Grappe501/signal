# Force all tooling to use H: drive — never C:
$Base = "H:\THE_SIGNAL_CYCLE"
$Tmp  = "$Base\tmp"

@($Tmp, "$Tmp\git", "$Base\.npm-cache", "$Base\.pip-cache", "$Base\.local") | ForEach-Object {
    New-Item -ItemType Directory -Force -Path $_ | Out-Null
}

$env:TEMP            = $Tmp
$env:TMP             = $Tmp
$env:TMPDIR           = $Tmp
$env:GIT_TMP_DIR      = "$Tmp\git"
$env:NPM_CONFIG_CACHE = "$Base\.npm-cache"
$env:PIP_CACHE_DIR    = "$Base\.pip-cache"
$env:PYTHONPYCACHEPREFIX = "$Base\tmp\pycache"

# Git object pack temp
$env:GNUPGHOME = "$Base\.gnupg"
New-Item -ItemType Directory -Force -Path $env:GNUPGHOME | Out-Null

Write-Host "Env → H: drive ($Tmp)"
