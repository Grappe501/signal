# The Second Self — Online Reader v3

Book-style reading and listening for **Book 1: The Second Self** (*The Signal Cycle*).

## v3.5 — Find, mark, offline (P4)

- **Bookmarks** — ★ toolbar or **M** saves scroll/spread position; list in sidebar; tap to jump back
- **Full-book search** — sidebar “Search in book…” (idle-built index; 2+ characters)
- **Share chapter** — ⎘ uses Web Share API or copies `/read/ch-…` link; OG meta updates per chapter
- **Offline / install** — service worker caches app shell + chapters you open; `manifest.json` for Add to Home Screen

Settings key: `signal-reader-v3.3` (includes `bookmarks` array).

## v3.4 — Listen & performance (P3)

- **Browser voice default** — Listen works immediately; ElevenLabs is optional (Pro) in audio settings
- **ElevenLabs fallback** — if Pro is selected but unavailable, falls back to device voice
- **Bundled `marked`** — `vendor/marked.min.js` (no CDN); run `npm run vendor` after `npm install`
- **Idle chapter prefetch** — next 2 + previous chapter markdown prefetched when the browser is idle

## v3.3 — Shareable URLs & typography (P2)

- **Chapter URLs** — `/read/ch-14`, `/read/prologue` (shareable; legacy `#ch-14` redirects)
- **Smarter resume** — scroll position + % through chapter + paragraph anchor (`data-read-id`)
- **Reading preferences** (sidebar) — serif/sans, line height, column width, paragraph spacing
- Local dev: `npx serve . -c serve.json` (SPA rewrites for `/read/*`)

## v3.2 — Reader UX (P1)

- **Reader mode** (default) — hides draft badges, TOC phase dots, prose-only; enable **Draft tools** in sidebar
- **Simpler bottom bar** — previous · progress · next (chapters in scroll, pages in spread)
- **TTS slide-over** — listen controls move to a bottom player panel (not the reading bar)
- **Touch** — tap left/right 20% edges; swipe back/forward; scroll mode changes chapter at top/bottom

## v3.1 — Scroll reading (default)

- **Scroll layout** — continuous column (`max-width: 40rem`), natural scrolling, resume by scroll position
- **Book spread layout** — optional two-page spread (toolbar **▤** / sidebar toggle / **B**)
- Scroll mode: **Prev ch / Next ch** in bottom bar; spread mode: page controls unchanged

## v3 — Design + Listen

### Visual redesign (v4)
- **Fraunces** display · **Newsreader** body · **Outfit** UI
- Signal-noir palette, film grain, floating reading chrome
- Paper column with elevated card in scroll mode

### Earlier (v3)
- **Source Serif 4** + **Instrument Sans** typography
- Editorial cover frame with signal-teal accents
- Ambient gradient background, glass toolbar, refined sidebar
- Part banners with depth, improved chapter nav cards
- Toggle switches, stat labels, mobile-optimized layout

### Text-to-speech — device voice + optional ElevenLabs

**Browser (device voice)** (default) — free, works offline via Web Speech API.

**ElevenLabs (Pro)** — high-quality neural narration when an API key or Netlify proxy is configured.

- **Listen · Prologue** on cover, or **L** / microphone toolbar button
- Play / pause (**Space**), stop, prev/next paragraph
- **Voice picker** — all voices from your ElevenLabs account
- **Speed control** (0.7× – 1.4× playback)
- **Auto-advance chapters** — continuous whole-book listen (toggle in audio panel; on by default)
- Prefetches the next paragraph while the current one plays

**Browser voice** (default) — free device TTS. On **iPad/iPhone**, long paragraphs are split into short chunks (~200 chars) so playback does not stop after ~1 minute (Safari limitation).

**ElevenLabs (Pro)** — requires `ELEVENLABS_API_KEY` on Netlify (Site → Environment variables). Without it, the reader falls back to Browser voice. Audio settings shows proxy status when you open the panel.

**Listen-through tips:** enable **Auto-advance chapters**; use **L** to start; if audio stops on iPad, confirm Engine is **Browser** or that Netlify has the API key for ElevenLabs.

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
Chapter scroll resume · prose-only mode · print styling · themes · focus mode · keyboard shortcuts

## Quick start

```powershell
cd H:\THE_SIGNAL_CYCLE\reader
npm install
npm run vendor
npx serve . -c serve.json
```

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| B | Scroll ↔ book spread layout |
| Tap / swipe | Back / forward (edges; chapter at scroll ends) |
| L | Listen to chapter |
| Space | Play / pause audio |
| ← / → | Prev / next page (spread only) |
| J / K | Next / previous chapter |
| M | Toggle bookmark |
| P | Prose-only mode |
| T | Contents · F focus · ? help |

## Content

**78 chapters — full novel (prologue + Ch 1–77)** — all publisher prose, read and listen end-to-end.

Rebuild from manuscript:

```powershell
npm run build
```

## Deploy

```powershell
node scripts/setup-source.mjs
git add -A && git commit -m "Reader v3" && git push
```
