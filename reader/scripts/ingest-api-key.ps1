# ElevenLabs API key ingestion (H: drive)
$ErrorActionPreference = "Stop"
Set-Location "H:\THE_SIGNAL_CYCLE"
. .\env.ps1
Set-Location "H:\THE_SIGNAL_CYCLE\reader"
node scripts/ingest-api-key.mjs
exit $LASTEXITCODE
