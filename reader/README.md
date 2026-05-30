# The Second Self — Online Reader v3

Book-style reading and listening for **Book 1: The Second Self** (*The Signal Cycle*).

## v3 — Design + Listen

### Visual redesign
- **Source Serif 4** + **Instrument Sans** typography
- Editorial cover frame with signal-teal accents
- Ambient gradient background, glass toolbar, refined sidebar
- Part banners with depth, improved chapter nav cards
- Toggle switches, stat labels, mobile-optimized layout

### Text-to-speech — ElevenLabs + browser fallback

**ElevenLabs** (default) — high-quality neural narration, paragraph-by-paragraph with highlight sync.

- **Listen · Prologue** on cover, or **L** / microphone toolbar button
- Play / pause (**Space**), stop, prev/next paragraph
- **Voice picker** — all voices from your ElevenLabs account
- **Speed control** (0.7× – 1.4× playback)
- **Auto-advance chapters** — continuous whole-book listen (toggle in audio panel; on by default)
- Prefetches the next paragraph while the current one plays

**Browser voice** (fallback) — switch Engine to “Browser” in the audio panel for free offline TTS via Web Speech API.

#### Setup (production — Netlify)

1. [ElevenLabs](https://elevenlabs.io) → Profile → **API key**
2. **Terminal ingestion** (recommended):

```powershell
cd H:\THE_SIGNAL_CYCLE\reader
npm run ingest-key
# or double-click INGEST_API_KEY.bat
```

Paste your key when prompted. The script validates it, saves to `.env`, and can push to Netlify if you have `netlify-cli` installed.

3. Or manually: Netlify → Site → **Environment variables** → add `ELEVENLABS_API_KEY`
4. Redeploy

#### Setup (local / static server)

If you run `npx serve .` without Netlify functions, open the audio panel and paste your API key under **Engine → ElevenLabs**. The key stays in your browser’s localStorage only.

### Carried from v2.1
Scroll-position resume · prose-only mode · print styling · themes · focus mode · keyboard shortcuts

## Quick start

```powershell
cd H:\THE_SIGNAL_CYCLE\reader
npx serve .
```

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| L | Listen to chapter |
| Space | Play / pause audio |
| ← / → · J / K | Prev / next chapter |
| P | Prose-only mode |
| T | Contents · F focus · ? help |

## Content

| Phase | Chapters |
|-------|----------|
| **v8 prose** | Prologue, Ch 1–13, Ch 72–77 |
| **v6 prose** | Ch 62, 66 |
| **v5 prose** | Ch 58–61, 63–65, 67–71 |
| **Outline** | Ch 14–57 |

## Deploy

```powershell
node scripts/setup-source.mjs
git add -A && git commit -m "Reader v3" && git push
```
