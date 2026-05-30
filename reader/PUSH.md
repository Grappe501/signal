# ⚠ Push required before Netlify

GitHub repo is empty: https://github.com/Grappe501/signal

**Run ONE of these** (in PowerShell or Terminal):

```powershell
cd H:\THE_SIGNAL_CYCLE\reader
python deploy.py
```

Or double-click: `scripts\PUSH_NOW.bat`

Or:

```powershell
cd H:\THE_SIGNAL_CYCLE\reader
.\scripts\push-to-github.ps1
```

This copies all 78 chapters into `source/` and pushes to `main`.

Then connect Netlify — it will auto-detect `netlify.toml`.

**If push fails:** run `gh auth login` first, then retry.
