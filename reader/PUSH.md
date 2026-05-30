# Deploy to Netlify

GitHub: https://github.com/Grappe501/signal (branch `main`)

Netlify builds from `reader/` via root `netlify.toml` (`npm run build` → Book 1 prose + Book 2 micro outlines).

## What's published

| Book | Content | Chapters |
|------|---------|----------|
| **Book One** · *The Second Self* | Full prose | 78 units (prologue + 77) |
| **Book Two** · *The Great Disconnection* | Micro outlines + architecture notes | 82 chapters + 29 dev docs |

Book Two continues immediately after Book One's finale (*Connection Established*).

## Push from repo root

```powershell
cd H:\THE_SIGNAL_CYCLE\reader
npm run build
cd ..
git add -A
git commit -m "Your message"
git push origin main
```

Or use `.\reader\scripts\push-to-github.ps1` from the reader folder.

Netlify redeploys automatically on every push to `main`.

## Netlify settings

- **Base directory:** `reader`
- **Build command:** `npm install && npm run build`
- **Publish directory:** `.` (reader root)

`netlify.toml` in the repo root sets these automatically.

## Verify deploy

- GitHub shows `book.json`, `content/b2-ch-*.md`, `source/Book2/`
- Netlify deploy log: build succeeds
- Live site: TOC includes **Book Two — Continuation** after Chapter 77
