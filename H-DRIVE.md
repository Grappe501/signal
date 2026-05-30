# H: Drive Only — Project Rules

This workspace lives on **H:\THE_SIGNAL_CYCLE**. Never write temp, cache, or build artifacts to C:.

## Quick deploy (run outside Cursor if C: is full)

Double-click: **`H:\THE_SIGNAL_CYCLE\DEPLOY_FROM_H.bat`**

Or in PowerShell:

```powershell
. H:\THE_SIGNAL_CYCLE\env.ps1
H:\THE_SIGNAL_CYCLE\scripts\deploy-all.ps1
```

## Environment (all on H:)

| Variable | Path |
|----------|------|
| TEMP / TMP | `H:\THE_SIGNAL_CYCLE\tmp` |
| GIT_TMP_DIR | `H:\THE_SIGNAL_CYCLE\tmp\git` |
| NPM cache | `H:\THE_SIGNAL_CYCLE\.npm-cache` |
| PIP cache | `H:\THE_SIGNAL_CYCLE\.pip-cache` |
| Deploy log | `H:\THE_SIGNAL_CYCLE\tmp\deploy.log` |

Source `.env.ps1` in any script: `Set-Location H:\THE_SIGNAL_CYCLE; . .\env.ps1`

Cursor terminal env is set in `.vscode/settings.json`.

## Clear C: user temp

```powershell
H:\THE_SIGNAL_CYCLE\scripts\clear-c-temp.ps1
```

Only clears `%LOCALAPPDATA%\Temp` on C: — safe user temp, not system files.
