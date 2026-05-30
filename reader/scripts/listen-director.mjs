/**
 * Node mirror of listen-script cue splitting — keeps Piper batch aligned with reader.
 */
import { normalizeSpeechText } from "./speech-text.mjs";

const POV_CAST = {
  "Mara Voss": { cast: "female", rate: 1, pitch: 1 },
  "Noah Vale": { cast: "male", rate: 0.98, pitch: 0.96 },
  "Eli Mercer": { cast: "male", rate: 0.96, pitch: 0.94 },
  "Adrian Vale": { cast: "male", rate: 0.97, pitch: 0.95 },
  "Iona Vale": { cast: "female", rate: 1.02, pitch: 1.04 },
  "Dubai Artist": { cast: "neutral", rate: 0.99, pitch: 1.02 },
  Archive: { cast: "archive", rate: 0.9, pitch: 0.88 },
  "Greenland Researcher": { cast: "neutral", rate: 0.94, pitch: 0.92 },
  "Lena Orra": { cast: "female", rate: 0.97, pitch: 0.98 },
  Mira: { cast: "female", rate: 1.03, pitch: 1.05 },
  "Unknown Technician": { cast: "neutral", rate: 0.95, pitch: 0.9 },
  "Unknown User": { cast: "neutral", rate: 1, pitch: 1 },
};

const CHARACTER_CAST = {
  mara: { label: "Mara" },
  lena: { label: "Lena" },
  iona: { label: "Iona" },
  cass: { label: "Cass" },
  mira: { label: "Mira" },
  noah: { label: "Noah" },
  eli: { label: "Eli" },
  mercer: { label: "Mercer" },
  vale: { label: "Vale" },
  adrian: { label: "Adrian" },
  chen: { label: "Chen" },
  artist: { label: "Artist" },
};

const SPEAKER_PATTERNS = [
  ["mara", /\bmara\b/i],
  ["lena", /\blena\b/i],
  ["iona", /\biona\b/i],
  ["cass", /\bcass\b/i],
  ["mira", /\bmira\b/i],
  ["noah", /\bnoah\b/i],
  ["eli", /\beli\b/i],
  ["mercer", /\bmercer\b/i],
  ["adrian", /\badrian\b/i],
  ["vale", /\bvale\b/i],
  ["chen", /\bchen\b/i],
  ["artist", /\bartist\b/i],
];

const SPEECH_VERBS =
  "(said|asked|whispered|murmured|replied|answered|shouted|called|added|continued|insisted|mumbled|breathed|spoke)";

const BLOCK_STYLE = {
  narration: { pauseAfter: 220 },
  dialogue: { pauseAfter: 280 },
  blockquote: { pauseAfter: 480 },
  heading: { pauseAfter: 380 },
  opener: { pauseAfter: 520 },
  banner: { pauseAfter: 560 },
  list: { pauseAfter: 180 },
  aside: { pauseAfter: 400 },
  sceneBreak: { pauseAfter: 900 },
};

function povProfile(pov) {
  if (!pov) return { cast: "neutral" };
  const key = pov.split("/")[0].trim();
  return POV_CAST[key] || POV_CAST[pov.trim()] || { cast: "neutral" };
}

function detectSpeaker(before, after) {
  const combined = `${before} ${after}`;
  for (const [key, re] of SPEAKER_PATTERNS) {
    if (!re.test(combined)) continue;
    const beforeLow = before.toLowerCase();
    const afterLow = after.toLowerCase();
    if (new RegExp(`\\b${key}\\s+${SPEECH_VERBS}`, "i").test(beforeLow)) return key;
    if (new RegExp(`${SPEECH_VERBS}\\s+${key}\\b`, "i").test(afterLow)) return key;
    if (new RegExp(`\\b${key}\\s*,\\s*${SPEECH_VERBS}`, "i").test(beforeLow)) return key;
  }
  return null;
}

function splitDialogue(text) {
  const parts = [];
  const re = /“([^”]*)”|"([^"]*)"|'([^']*)'/g;
  let last = 0;
  let m;

  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      const before = text.slice(last, m.index).trim();
      if (before.length > 1) parts.push({ role: "narration", text: before });
    }
    const quote = (m[1] ?? m[2] ?? m[3] ?? "").trim();
    if (quote.length > 1) parts.push({ role: "dialogue", text: quote });
    last = m.index + m[0].length;
  }

  if (last < text.length) {
    const tail = text.slice(last).trim();
    if (tail.length > 1) parts.push({ role: "narration", text: tail });
  }

  if (!parts.length && text.length > 1) {
    parts.push({ role: "narration", text });
  }

  for (let i = 0; i < parts.length; i++) {
    if (parts[i].role !== "dialogue") continue;
    parts[i].speaker = detectSpeaker(parts[i - 1]?.text || "", parts[i + 1]?.text || "");
  }

  return parts;
}

function buildCue(rawText, role, blockKind, speaker = null, pacingMul = 1) {
  if (blockKind === "sceneBreak") {
    return {
      text: "",
      role: "sceneBreak",
      pauseAfter: Math.round(BLOCK_STYLE.sceneBreak.pauseAfter * pacingMul),
      speakerLabel: null,
    };
  }

  const blockKey =
    role === "dialogue"
      ? "dialogue"
      : blockKind === "blockquote"
        ? "blockquote"
        : blockKind === "heading"
          ? "heading"
          : blockKind === "opener"
            ? "opener"
            : blockKind === "banner"
              ? "banner"
              : blockKind === "list"
                ? "list"
                : blockKind === "aside"
                  ? "aside"
                  : "narration";

  const style = BLOCK_STYLE[blockKey] || BLOCK_STYLE.narration;
  let speakerLabel = null;
  if (role === "dialogue" && speaker && CHARACTER_CAST[speaker]) {
    speakerLabel = CHARACTER_CAST[speaker].label;
  }

  return {
    text: normalizeSpeechText(rawText),
    role: blockKey === "dialogue" ? "dialogue" : blockKey,
    pauseAfter: Math.round(style.pauseAfter * pacingMul),
    speakerLabel,
  };
}

export function buildCuesForBlock(text, blockKind, pov, pacingMul = 1) {
  if (blockKind === "sceneBreak" || text === "---") {
    return [buildCue("", "narration", "sceneBreak", null, pacingMul)];
  }

  const normalized = normalizeSpeechText(text);
  if (!normalized) return [];

  if (
    blockKind === "blockquote" ||
    blockKind === "heading" ||
    blockKind === "opener" ||
    blockKind === "banner" ||
    blockKind === "aside" ||
    blockKind === "list"
  ) {
    return [buildCue(normalized, "narration", blockKind, null, pacingMul)];
  }

  const parts = splitDialogue(normalized);
  return parts.map((p) => buildCue(p.text, p.role, blockKind, p.speaker || null, pacingMul));
}

/** Full chapter cue plan aligned with reader segment indices (one block = one segment). */
export function buildChapterCuePlan(pov, blocks) {
  const plan = [];
  let segment = 0;

  for (const block of blocks) {
    const blockKind = block.kind === "break" ? "sceneBreak" : "narration";
    const raw = block.kind === "break" ? "" : block.text || "";
    const cues = buildCuesForBlock(raw, blockKind, pov);
    const filtered = cues.filter(
      (c) => c.role === "sceneBreak" || (c.text && c.text.length > 1)
    );
    if (!filtered.length) continue;
    plan.push({ segment, blockKind, cues: filtered });
    segment++;
  }

  return plan;
}
