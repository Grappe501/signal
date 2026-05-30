/**
 * Listen director — shapes device TTS into audiobook-style pacing.
 * POV voice casting, dialogue vs narration, pauses, spoken text cleanup.
 * Free: uses Web Speech only (no API cost).
 */
const ListenScript = (() => {
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

  const BLOCK_STYLE = {
    narration: { rateMul: 1, pitchMul: 1, pauseAfter: 220 },
    dialogue: { rateMul: 1.04, pitchMul: 1.02, pauseAfter: 280 },
    blockquote: { rateMul: 0.92, pitchMul: 0.94, pauseAfter: 480 },
    heading: { rateMul: 0.96, pitchMul: 1.03, pauseAfter: 380 },
    opener: { rateMul: 0.94, pitchMul: 1.02, pauseAfter: 520 },
    banner: { rateMul: 0.93, pitchMul: 1, pauseAfter: 560 },
    list: { rateMul: 0.98, pitchMul: 1, pauseAfter: 180 },
    aside: { rateMul: 0.9, pitchMul: 0.92, pauseAfter: 400 },
  };

  const ABBREVIATIONS = [
    [/\bCIB\b/gi, "C I B"],
    [/\bSTA\b/gi, "S T A"],
    [/\bHVI\b/gi, "H V I"],
    [/\bPOV\b/gi, "point of view"],
    [/\bIDLE\b/g, "idle"],
    [/\bUSB\b/gi, "U S B"],
    [/\bAI\b/g, "A I"],
    [/\bCEO\b/gi, "C E O"],
    [/\bGPS\b/gi, "G P S"],
    [/\bVR\b/gi, "V R"],
    [/\bAR\b/gi, "A R"],
    [/\bETA\b/gi, "E T A"],
    [/\bvs\.\b/gi, "versus"],
    [/\be\.g\.\b/gi, "for example"],
    [/\bi\.e\.\b/gi, "that is"],
  ];

  let voiceCache = null;

  function povProfile(pov) {
    if (!pov) return { cast: "neutral", rate: 1, pitch: 1 };
    const key = pov.split("/")[0].trim();
    return POV_CAST[key] || POV_CAST[pov.trim()] || { cast: "neutral", rate: 1, pitch: 1 };
  }

  function classifyElement(el) {
    if (el.matches("blockquote")) return "blockquote";
    if (el.matches(".part-banner-inline")) return "banner";
    if (el.matches(".chapter-opener")) return "opener";
    if (el.matches("h2, h3, h4")) return "heading";
    if (el.matches("li")) return "list";
    if (el.matches("pre")) return "aside";
    return "narration";
  }

  function normalizeText(raw) {
    let t = raw.replace(/\s+/g, " ").trim();
    if (!t) return "";
    t = t.replace(/\s*—\s*/g, ", ");
    t = t.replace(/\s*–\s*/g, ", ");
    t = t.replace(/\s*-\s*-\s*-\s*/g, ". ");
    for (const [re, rep] of ABBREVIATIONS) {
      t = t.replace(re, rep);
    }
    t = t.replace(/\*\*([^*]+)\*\*/g, "$1");
    t = t.replace(/\*([^*]+)\*/g, "$1");
    return t.trim();
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
    return parts;
  }

  function buildCue(rawText, role, blockKind, povBase) {
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
    const castKey = role === "dialogue" ? "dialogue" : povBase.cast;
    const voiceURI = resolveCastVoice(castKey);

    return {
      text: normalizeText(rawText),
      role: blockKey === "dialogue" ? "dialogue" : blockKey,
      rate: povBase.rate * style.rateMul,
      pitch: povBase.pitch * style.pitchMul,
      pauseAfter: style.pauseAfter,
      voiceURI,
      cast: castKey,
    };
  }

  function buildCuesForBlock(text, blockKind, pov) {
    const base = povProfile(pov);
    const normalized = normalizeText(text);
    if (!normalized) return [];

    if (blockKind === "blockquote" || blockKind === "heading" || blockKind === "opener" || blockKind === "banner" || blockKind === "aside" || blockKind === "list") {
      return [buildCue(normalized, "narration", blockKind, base)];
    }

    const parts = splitDialogue(normalized);
    return parts.map((p) => buildCue(p.text, p.role, blockKind, base));
  }

  function scoreVoice(v, prefer) {
    const n = v.name.toLowerCase();
    let s = 0;
    if (v.localService) s += 2;
    if (n.includes("natural") || n.includes("premium") || n.includes("enhanced")) s += 4;
    if (prefer === "female" && (n.includes("female") || n.includes("samantha") || n.includes("karen") || n.includes("victoria") || n.includes("zira") || n.includes("aria"))) s += 8;
    if (prefer === "male" && (n.includes("male") || n.includes("daniel") || n.includes("alex") || n.includes("fred") || n.includes("david") || n.includes("guy"))) s += 8;
    if (prefer === "archive" && (n.includes("aged") || n.includes("deep") || n.includes("tom"))) s += 5;
    if (prefer === "dialogue" && (n.includes("natural") || n.includes("premium"))) s += 3;
    if (prefer === "neutral") s += 1;
    return s;
  }

  function resolveCastVoice(cast) {
    if (!("speechSynthesis" in window)) return null;
    if (!voiceCache) refreshVoiceCache();
    return voiceCache[cast] || voiceCache.neutral || null;
  }

  function refreshVoiceCache() {
    const en = speechSynthesis.getVoices().filter((v) => v.lang.startsWith("en"));
    const pick = (prefer) => {
      if (!en.length) return null;
      const sorted = [...en].sort((a, b) => scoreVoice(b, prefer) - scoreVoice(a, prefer));
      return sorted[0]?.voiceURI || null;
    };
    voiceCache = {
      female: pick("female"),
      male: pick("male"),
      neutral: pick("neutral"),
      archive: pick("archive") || pick("male"),
      dialogue: pick("dialogue") || pick("neutral"),
    };
  }

  function collectBlocks(bodyEl) {
    if (window.BookPages?.allBlocks?.().length) {
      return window.BookPages.allBlocks();
    }
    return Array.from(
      bodyEl.querySelectorAll(
        "p, li, blockquote, h2, h3, h4, pre, .chapter-opener, .part-banner-inline"
      )
    );
  }

  function buildSegments(bodyEl, chapter, options = {}) {
    const enabled = options.listenDirector !== false;
    const pov = chapter?.pov || "Mara Voss";
    const blocks = collectBlocks(bodyEl);
    const segments = [];

    blocks.forEach((el) => {
      if (el.matches("table")) return;
      const raw = el.textContent.replace(/\s+/g, " ").trim();
      if (raw.length < 2) return;

      const blockKind = classifyElement(el);
      let cues;

      if (enabled && typeof speechSynthesis !== "undefined") {
        refreshVoiceCache();
        cues = buildCuesForBlock(raw, blockKind, pov);
      } else {
        cues = [
          {
            text: normalizeText(raw),
            role: "narration",
            rate: 1,
            pitch: 1,
            pauseAfter: 200,
            voiceURI: null,
            cast: "neutral",
          },
        ];
      }

      cues = cues.filter((c) => c.text.length > 1);
      if (!cues.length) return;

      el.dataset.ttsIndex = segments.length;
      el.classList.add("tts-segment");

      const flatText = cues.map((c) => c.text).join(" ");
      segments.push({
        el,
        text: flatText,
        cues,
        pov,
        blockKind,
      });
    });

    return segments;
  }

  function flattenSegmentText(segment) {
    if (!segment?.cues?.length) return segment?.text || "";
    return segment.cues.map((c) => c.text).join(" ");
  }

  if (typeof speechSynthesis !== "undefined") {
    speechSynthesis.addEventListener("voiceschanged", () => {
      voiceCache = null;
    });
  }

  return {
    buildSegments,
    normalizeText,
    flattenSegmentText,
    refreshVoiceCache,
    povProfile,
  };
})();

window.ListenScript = ListenScript;
