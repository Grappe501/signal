# Self-hosted listen audio (Piper)

Optional **pre-rendered** chapter audio for the reader **Hosted (Piper MP3)** engine. No API fees — only storage and bandwidth (~**2–4 GB** for the full book as MP3).

## Quick start

1. Install [Piper](https://github.com/rhasspy/piper) and add it to your `PATH`.
2. Download an English voice (`.onnx` + `.onnx.json`) into `reader/voices/`  
   Example: [lessac medium](https://huggingface.co/rhasspy/piper-voices/tree/main/en/en_US/lessac/medium)
3. From `reader/`:

```bash
npm run piper:check
npm run build          # ensures content/*.md exists
npm run piper:batch    # one file per chapter → audio/ch-01.mp3, …
```

4. Deploy the `reader/` folder including `audio/manifest.json` and the audio files (Netlify, S3, etc.).

## Modes

| Mode | Command | Output | Reader sync |
|------|---------|--------|-------------|
| **chapter** (default) | `npm run piper:batch` | `audio/ch-01.mp3` | Read-along via weighted timeline |
| **segment** | `npm run piper:batch -- --mode segment` | `audio/ch-01/0000.mp3` per paragraph | Plays files in order; approximate ¶ sync |

## Useful flags

```bash
npm run piper:batch:dry              # preview without generating
npm run piper:batch -- --chapter ch-01
npm run piper:batch -- --limit 3
npm run piper:batch -- --force
PIPER_MODEL=H:/voices/en_US-lessac-medium.onnx npm run piper:batch
```

If **ffmpeg** is on `PATH`, output is `.mp3`; otherwise `.wav` (also supported in the browser).

## Git

Large files are gitignored. Commit only `manifest.example.json` as a template; ship real `manifest.json` + audio with your deploy artifact or CDN.

## Environment

| Variable | Purpose |
|----------|---------|
| `PIPER_BIN` | Piper executable (default `piper`) |
| `PIPER_MODEL` | Path to `.onnx` model |
| `FFMPEG_BIN` | ffmpeg for MP3 export (default `ffmpeg`) |
