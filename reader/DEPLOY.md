# Netlify + GitHub deploy checklist

## Problem

[github.com/Grappe501/signal](https://github.com/Grappe501/signal) is **empty** (0 bytes). Netlify has nothing to build until you push the `reader/` folder.

## One-time push (run in PowerShell)

Free some space on **C:** first (Cursor/temp needs it), then:

```powershell
$env:TEMP = "H:\THE_SIGNAL_CYCLE\tmp"
$env:TMP  = "H:\THE_SIGNAL_CYCLE\tmp"
New-Item -ItemType Directory -Force -Path $env:TEMP | Out-Null

cd H:\THE_SIGNAL_CYCLE\reader
node scripts/setup-source.mjs
.\scripts\push-to-github.ps1
```

Or manually:

```powershell
cd H:\THE_SIGNAL_CYCLE\reader
node scripts/setup-source.mjs
git init
git add -A
git commit -m "Deploy The Second Self reader v3"
git branch -M main
git remote add origin https://github.com/Grappe501/signal.git
git push -u origin main
```

## Netlify settings

At [app.netlify.com/start/repos/Grappe501/signal](https://app.netlify.com/start/repos/Grappe501%2Fsignal):

| Setting | Value |
|---------|--------|
| **Branch** | `main` |
| **Base directory** | *(leave empty — repo root IS the reader)* |
| **Build command** | `npm run setup` |
| **Publish directory** | `.` |

`netlify.toml` in the repo sets these automatically once pushed.

## After push

Netlify redeploys on every `git push`. Site needs `source/` folder (created by `npm run setup`) for chapter text to load.

## Verify

- GitHub shows `index.html`, `book.json`, `source/Draft/`, `source/Outline/`
- Netlify deploy log: build succeeds, publish `.`
- Live site: cover loads, Prologue text appears (not "Could not load")
