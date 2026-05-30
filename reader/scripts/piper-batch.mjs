#!/usr/bin/env node
/**
 * Batch-generate self-hosted chapter audio with Piper (free, local).
 *
 *   npm run piper:check
 *   npm run piper:batch
 *   npm run piper:batch -- --chapter ch-01
 *   npm run piper:batch -- --mode cue
 *   npm run piper:batch -- --mode segment --limit 3
 *
 * Requires: piper on PATH, voice .onnx + .onnx.json in reader/voices/ or PIPER_MODEL
 * Optional: ffmpeg on PATH to emit .mp3 (otherwise .wav)
 */
import { spawnSync, execSync } from "child_process";
import {
  mkdirSync,
  writeFileSync,
  existsSync,
  statSync,
  rmSync,
  readdirSync,
} from "fs";
import { join, dirname, basename } from "path";
import { fileURLToPath } from "url";
import { CHAPTERS } from "./chapters.mjs";
import { chapterSpeechPayload } from "./speech-text.mjs";
import { buildChapterCuePlan } from "./listen-director.mjs";
import { probeDuration, buildChapterTimingSidecar, buildWordTimings } from "./audio-timing.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const AUDIO_DIR = join(ROOT, "audio");
const VOICES_DIR = join(ROOT, "voices");

function parseArgs(argv) {
  const out = {
    mode: "chapter",
    chapter: null,
    limit: 0,
    dryRun: false,
    force: false,
    piper: process.env.PIPER_BIN || "piper",
    model: process.env.PIPER_MODEL || "",
    ffmpeg: process.env.FFMPEG_BIN || "ffmpeg",
    ffprobe: process.env.FFPROBE_BIN || "ffprobe",
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") out.dryRun = true;
    else if (a === "--force") out.force = true;
    else if (a === "--mode" && argv[i + 1]) out.mode = argv[++i];
    else if (a === "--chapter" && argv[i + 1]) out.chapter = argv[++i];
    else if (a === "--limit" && argv[i + 1]) out.limit = parseInt(argv[++i], 10) || 0;
    else if (a === "--piper" && argv[i + 1]) out.piper = argv[++i];
    else if (a === "--model" && argv[i + 1]) out.model = argv[++i];
  }
  return out;
}

function findDefaultModel() {
  if (process.env.PIPER_MODEL && existsSync(process.env.PIPER_MODEL)) {
    return process.env.PIPER_MODEL;
  }
  if (!existsSync(VOICES_DIR)) return null;
  const onnx = readDirOnnx(VOICES_DIR);
  return onnx;
}

function readDirOnnx(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (name.endsWith(".onnx")) return p;
  }
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    try {
      if (statSync(p).isDirectory()) {
        const inner = readDirOnnx(p);
        if (inner) return inner;
      }
    } catch {
      /* ignore */
    }
  }
  return null;
}

function hasCmd(cmd) {
  try {
    execSync(process.platform === "win32" ? `where ${cmd}` : `which ${cmd}`, {
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

function hasFfmpeg(bin) {
  try {
    execSync(`"${bin}" -version`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function runPiper(piper, model, text, outPath) {
  const args = ["--model", model, "--output_file", outPath];
  const r = spawnSync(piper, args, {
    input: text,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
  if (r.status !== 0) {
    throw new Error(r.stderr || r.stdout || `piper failed (${r.status})`);
  }
}

function wavToMp3(ffmpeg, wav, mp3) {
  spawnSync(ffmpeg, ["-y", "-i", wav, "-codec:a", "libmp3lame", "-qscale:a", "4", mp3], {
    stdio: "ignore",
  });
}

function fileSize(path) {
  try {
    return statSync(path).size;
  } catch {
    return 0;
  }
}

function main() {
  const args = parseArgs(process.argv);
  const model = args.model || findDefaultModel();

  if (process.argv.includes("--check")) {
    const piperOk = hasCmd(args.piper);
    const ffmpegOk = hasFfmpeg(args.ffmpeg);
    console.log(`piper: ${piperOk ? "ok" : "missing"} (${args.piper})`);
    console.log(`ffmpeg: ${ffmpegOk ? "ok (mp3)" : "missing (will use .wav)"}`);
    console.log(`model: ${model || "not found — set PIPER_MODEL or add reader/voices/*.onnx"}`);
    process.exit(piperOk && model ? 0 : 1);
  }

  if (!args.dryRun) {
    if (!hasCmd(args.piper)) {
      console.error(`Piper not found (${args.piper}). Install: https://github.com/rhasspy/piper`);
      process.exit(1);
    }
    if (!model) {
      console.error("No Piper model. Download a voice into reader/voices/ or set PIPER_MODEL.");
      process.exit(1);
    }
  } else if (!model) {
    console.warn("No Piper model (ok for --dry-run).");
  }

  const useMp3 = hasFfmpeg(args.ffmpeg);
  const ext = useMp3 ? "mp3" : "wav";
  mkdirSync(AUDIO_DIR, { recursive: true });

  let chapters = CHAPTERS.filter((c) => c.prose);
  if (args.chapter) chapters = chapters.filter((c) => c.id === args.chapter);
  if (args.limit > 0) chapters = chapters.slice(0, args.limit);

  const manifest = {
    version: 2,
    generatedAt: new Date().toISOString(),
    voice: model ? basename(model).replace(/\.onnx$/, "") : "unset",
    format: ext,
    mode: args.mode,
    chapters: {},
  };

  let built = 0;
  for (const ch of chapters) {
    const payload = chapterSpeechPayload(ch.id, ch.pov);
    if (!payload?.fullText) {
      console.warn(`skip ${ch.id}: no content`);
      continue;
    }

    if (args.mode === "cue") {
      const plan = buildChapterCuePlan(ch.pov, payload.blocks);
      const cueDir = join(AUDIO_DIR, ch.id, "cues");
      if (!args.dryRun) mkdirSync(cueDir, { recursive: true });
      const manifestCues = [];
      let totalDur = 0;

      for (const block of plan) {
        for (let ci = 0; ci < block.cues.length; ci++) {
          const cue = block.cues[ci];
          if (cue.role === "sceneBreak") {
            const pause = cue.pauseAfter / 1000;
            manifestCues.push({
              segment: block.segment,
              cue: ci,
              kind: "break",
              pauseAfter: pause,
              text: "",
            });
            totalDur += pause;
            continue;
          }

          const fname = `s${String(block.segment).padStart(4, "0")}-c${String(ci).padStart(2, "0")}.${ext}`;
          const rel = `${ch.id}/cues/${fname}`;
          const outPath = join(AUDIO_DIR, rel);
          let dur = 0;
          let words = [];

          if (!args.dryRun) {
            const wavPath = outPath.replace(/\.mp3$/, ".wav");
            runPiper(args.piper, model, cue.text, wavPath.endsWith(".wav") ? wavPath : outPath);
            if (useMp3) {
              wavToMp3(args.ffmpeg, wavPath, outPath);
              rmSync(wavPath, { force: true });
            }
            dur = probeDuration(args.ffprobe, outPath);
            words = buildWordTimings(cue.text, dur);
          }

          totalDur += dur + cue.pauseAfter / 1000;
          manifestCues.push({
            segment: block.segment,
            cue: ci,
            kind: "speech",
            role: cue.role,
            file: rel,
            duration: dur,
            bytes: args.dryRun ? 0 : fileSize(outPath),
            text: cue.text,
            speakerLabel: cue.speakerLabel || null,
            words,
            pauseAfter: cue.pauseAfter / 1000,
          });
          built++;
          console.log(
            `  ${ch.id} s${block.segment} c${ci} [${cue.role}] ${cue.text.slice(0, 44)}…`
          );
        }
      }

      manifest.version = 3;
      manifest.chapters[ch.id] = {
        mode: "cue",
        cues: manifestCues,
        duration: totalDur,
        cueCount: manifestCues.filter((c) => c.file).length,
      };
      continue;
    }

    if (args.mode === "segment") {
      const segDir = join(AUDIO_DIR, ch.id);
      if (!args.dryRun) mkdirSync(segDir, { recursive: true });
      const segments = [];
      let si = 0;
      for (const block of payload.blocks) {
        if (block.kind === "break") {
          segments.push({ index: si++, kind: "break", file: null, bytes: 0 });
          continue;
        }
        const name = `${String(si).padStart(4, "0")}.${ext}`;
        const outPath = join(segDir, name);
        let dur = 0;
        if (!args.dryRun) {
          const wavPath = outPath.replace(/\.mp3$/, ".wav");
          runPiper(args.piper, model, block.text, wavPath.endsWith(".wav") ? wavPath : outPath);
          if (useMp3) {
            wavToMp3(args.ffmpeg, wavPath, outPath);
            rmSync(wavPath, { force: true });
          }
          dur = probeDuration(args.ffprobe, outPath);
        }
        segments.push({
          index: si++,
          kind: "speech",
          file: `${ch.id}/${name}`,
          bytes: args.dryRun ? 0 : fileSize(outPath),
          duration: dur,
        });
        built++;
        console.log(`  ${ch.id} ¶${si} ${block.text.slice(0, 48)}…`);
      }
      manifest.chapters[ch.id] = { mode: "segment", segments };
    } else {
      const name = `${ch.id}.${ext}`;
      const outPath = join(AUDIO_DIR, name);
      let duration = 0;
      if (args.dryRun) {
        console.log(`[dry] ${ch.id} ${payload.fullText.length} chars → ${name}`);
      } else {
        const wavPath = outPath.replace(/\.mp3$/, ".wav");
        console.log(`${ch.id} → ${name} (${payload.fullText.length} chars)`);
        runPiper(args.piper, model, payload.fullText, wavPath.endsWith(".wav") ? wavPath : outPath);
        if (useMp3) {
          wavToMp3(args.ffmpeg, wavPath, outPath);
          rmSync(wavPath, { force: true });
        }
        duration = probeDuration(args.ffprobe, outPath);
        const timing = buildChapterTimingSidecar(payload.blocks, duration);
        writeFileSync(join(AUDIO_DIR, `${ch.id}.timing.json`), JSON.stringify(timing, null, 2));
      }
      manifest.chapters[ch.id] = {
        mode: "chapter",
        file: name,
        bytes: args.dryRun ? 0 : fileSize(outPath),
        charCount: payload.fullText.length,
        duration,
        timing: `${ch.id}.timing.json`,
      };
      built++;
    }
  }

  if (!args.dryRun) {
    writeFileSync(join(AUDIO_DIR, "manifest.json"), JSON.stringify(manifest, null, 2));
    console.log(`\nWrote audio/manifest.json (${Object.keys(manifest.chapters).length} chapters)`);
  }
  console.log(`Done. ${built} audio unit(s)${args.dryRun ? " (dry run)" : ""}.`);
}

main();
