import { execSync } from "child_process";

export function probeDuration(ffprobe, filePath) {
  try {
    const out = execSync(
      `"${ffprobe}" -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`,
      { encoding: "utf8" }
    );
    const n = parseFloat(out.trim());
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

export function buildChapterTimingSidecar(blocks, duration) {
  const speech = blocks.filter((b) => b.kind === "speech" && b.text);
  const totalChars = speech.reduce((s, b) => s + b.text.length, 0) || 1;
  const cues = [];
  let t = 0;
  let segment = 0;

  for (const block of blocks) {
    if (block.kind === "break") {
      const pause = 0.85;
      cues.push({ segment, cue: 0, start: t, end: t + pause, kind: "break" });
      t += pause;
      segment++;
      continue;
    }
    const share = (block.text.length / totalChars) * duration * 0.97;
    cues.push({ segment, cue: 0, start: t, end: t + share, kind: "speech" });
    t += share;
    segment++;
  }

  return {
    version: 1,
    duration: duration || t,
    cues,
  };
}
