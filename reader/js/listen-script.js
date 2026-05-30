/**
 * Listen director — shapes device TTS into audiobook-style pacing.
 * POV casting, character dialogue, scene breaks, pauses, spoken text cleanup.
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

  /** Named speakers in dialogue — rate/pitch differentiate when device has few voices */
  const CHARACTER_CAST = {
    mara: { cast: "female", rate: 1, pitch: 1, label: "Mara" },
    lena: { cast: "female", rate: 0.96, pitch: 0.97, label: "Lena" },
    iona: { cast: "female", rate: 1.03, pitch: 1.05, label: "Iona" },
    cass: { cast: "female", rate: 1.01, pitch: 1.02, label: "Cass" },
    mira: { cast: "female", rate: 1.04, pitch: 1.06, label: "Mira" },
    noah: { cast: "male", rate: 0.98, pitch: 0.96, label: "Noah" },
    eli: { cast: "male", rate: 0.94, pitch: 0.92, label: "Eli" },
    mercer: { cast: "male", rate: 0.93, pitch: 0.9, label: "Mercer" },
    vale: { cast: "male", rate: 0.96, pitch: 0.93, label: "Vale" },
    adrian: { cast: "male", rate: 0.97, pitch: 0.94, label: "Adrian" },
    chen: { cast: "neutral", rate: 0.98, pitch: 0.95, label: "Chen" },
    artist: { cast: "neutral", rate: 0.99, pitch: 1.01, label: "Artist" },
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
    narration: { rateMul: 1, pitchMul: 1, pauseAfter: 220 },
    dialogue: { rateMul: 1.04, pitchMul: 1.02, pauseAfter: 280 },
    blockquote: { rateMul: 0.92, pitchMul: 0.94, pauseAfter: 480 },
    heading: { rateMul: 0.96, pitchMul: 1.03, pauseAfter: 380 },
    opener: { rateMul: 0.94, pitchMul: 1.02, pauseAfter: 520 },
    banner: { rateMul: 0.93, pitchMul: 1, pauseAfter: 560 },
    list: { rateMul: 0.98, pitchMul: 1, pauseAfter: 180 },
    aside: { rateMul: 0.9, pitchMul: 0.92, pauseAfter: 400 },
    sceneBreak: { rateMul: 1, pitchMul: 1, pauseAfter: 900 },
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
  let pacingMul = 1;

  function setPacingMultiplier(mul) {
    pacingMul = Math.min(1.5, Math.max(0.55, mul || 1));
  }

  function povProfile(pov) {
    if (!pov) return { cast: "neutral", rate: 1, pitch: 1 };
    const key = pov.split("/")[0].trim();
    return POV_CAST[key] || POV_CAST[pov.trim()] || { cast: "neutral", rate: 1, pitch: 1 };
  }

  function classifyElement(el) {
    if (el.matches("hr")) return "sceneBreak";
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
      const before = parts[i - 1]?.text || "";
      const after = parts[i + 1]?.text || "";
      parts[i].speaker = detectSpeaker(before, after);
    }

    return parts;
  }

  function profileForDialogue(speaker, povBase) {
    if (speaker && CHARACTER_CAST[speaker]) {
      const c = CHARACTER_CAST[speaker];
      return {
        cast: c.cast,
        rate: c.rate,
        pitch: c.pitch,
        label: c.label,
        speakerKey: speaker,
      };
    }
    return {
      cast: "dialogue",
      rate: povBase.rate * 1.02,
      pitch: povBase.pitch * 1.02,
      label: null,
      speakerKey: null,
    };
  }

  function buildCue(rawText, role, blockKind, povBase, speaker = null) {
    if (blockKind === "sceneBreak") {
      return {
        text: "",
        role: "sceneBreak",
        rate: 0.5,
        pitch: 1,
        pauseAfter: Math.round(BLOCK_STYLE.sceneBreak.pauseAfter * pacingMul),
        voiceURI: null,
        cast: "neutral",
        speakerLabel: null,
        speakerKey: null,
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
    let rate = povBase.rate;
    let pitch = povBase.pitch;
    let castKey = povBase.cast;
    let speakerLabel = null;
    let speakerKey = null;

    if (role === "dialogue") {
      const dp = profileForDialogue(speaker, povBase);
      rate = dp.rate;
      pitch = dp.pitch;
      castKey = dp.cast;
      speakerLabel = dp.label;
      speakerKey = speaker || null;
    }

    const voiceURI = speakerKey
      ? resolveSpeakerVoice(speakerKey, castKey)
      : resolveCastVoice(castKey);

    return {
      text: normalizeText(rawText),
      role: blockKey === "dialogue" ? "dialogue" : blockKey,
      rate: rate * style.rateMul,
      pitch: pitch * style.pitchMul,
      pauseAfter: Math.round(style.pauseAfter * pacingMul),
      voiceURI,
      cast: castKey,
      speakerLabel,
      speakerKey,
    };
  }

  function buildCuesForBlock(text, blockKind, pov) {
    const base = povProfile(pov);

    if (blockKind === "sceneBreak") {
      return [buildCue("", "narration", "sceneBreak", base)];
    }

    const normalized = normalizeText(text);
    if (!normalized) return [];

    if (
      blockKind === "blockquote" ||
      blockKind === "heading" ||
      blockKind === "opener" ||
      blockKind === "banner" ||
      blockKind === "aside" ||
      blockKind === "list"
    ) {
      return [buildCue(normalized, "narration", blockKind, base)];
    }

    const parts = splitDialogue(normalized);
    return parts.map((p) => buildCue(p.text, p.role, blockKind, base, p.speaker || null));
  }

  function scoreVoice(v, prefer, avoidUri) {
    const n = v.name.toLowerCase();
    let s = 0;
    if (v.voiceURI === avoidUri) s -= 20;
    if (v.localService) s += 2;
    if (n.includes("natural") || n.includes("premium") || n.includes("enhanced")) s += 4;
    if (prefer === "female" && (n.includes("female") || n.includes("samantha") || n.includes("karen") || n.includes("victoria") || n.includes("zira") || n.includes("aria") || n.includes("susan"))) s += 8;
    if (prefer === "male" && (n.includes("male") || n.includes("daniel") || n.includes("alex") || n.includes("fred") || n.includes("david") || n.includes("guy") || n.includes("tom"))) s += 8;
    if (prefer === "archive" && (n.includes("aged") || n.includes("deep") || n.includes("tom"))) s += 5;
    if (prefer === "neutral") s += 1;
    return s;
  }

  function refreshVoiceCache() {
    if (!("speechSynthesis" in window)) return;
    const en = speechSynthesis.getVoices().filter((v) => v.lang.startsWith("en"));
    const pick = (prefer, avoidUri = null) => {
      if (!en.length) return null;
      const sorted = [...en].sort((a, b) => scoreVoice(b, prefer, avoidUri) - scoreVoice(a, prefer, avoidUri));
      return sorted[0]?.voiceURI || null;
    };

    const female1 = pick("female");
    const female2 = pick("female", female1);
    const male1 = pick("male");
    const male2 = pick("male", male1);

    voiceCache = {
      female: female1,
      femaleAlt: female2 || female1,
      male: male1,
      maleAlt: male2 || male1,
      neutral: pick("neutral") || female1 || male1,
      archive: pick("archive") || male2 || male1,
      dialogue: pick("neutral") || female1,
      mara: female1,
      lena: female2 || female1,
      iona: female2 || female1,
      cass: female2 || female1,
      noah: male1,
      eli: male2 || male1,
      mercer: male2 || male1,
      vale: male1,
      adrian: male2 || male1,
    };
  }

  function resolveCastVoice(cast) {
    if (!("speechSynthesis" in window)) return null;
    if (!voiceCache) refreshVoiceCache();
    return voiceCache[cast] || voiceCache.neutral || null;
  }

  function resolveSpeakerVoice(speaker, cast) {
    if (!("speechSynthesis" in window)) return null;
    if (!voiceCache) refreshVoiceCache();
    if (speaker && voiceCache[speaker]) return voiceCache[speaker];
    return resolveCastVoice(cast);
  }

  function escapeHtml(text) {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function tokenizeWords(text) {
    if (!text?.trim()) return [];
    return text.trim().match(/\S+/g) || [];
  }

  function wordsHtml(text) {
    const words = tokenizeWords(text);
    if (!words.length) return escapeHtml(text);
    return words
      .map(
        (w, i) =>
          `<span class="tts-word" data-tts-word="${i}">${escapeHtml(w)}</span>`
      )
      .join(" ");
  }

  function sentencesHtml(text) {
    const parts = text.split(/(?<=[.!?…])\s+/).filter((p) => p.trim().length > 1);
    if (parts.length < 2) return wordsHtml(text);
    return parts
      .map(
        (s, i) =>
          `<span class="tts-sentence" data-tts-sent="${i}">${wordsHtml(s.trim())}</span>`
      )
      .join(" ");
  }

  /** Wrap each speakable cue in a span for read-along highlighting. */
  function annotateCuesInElement(el, cues) {
    if (!el || el.dataset.ttsAnnotated === "1") return;

    const speakable = cues.filter((c) => c.role !== "sceneBreak" && c.text?.trim());
    if (!speakable.length) return;

    if (el.dataset.ttsOriginalHtml == null) {
      el.dataset.ttsOriginalHtml = el.innerHTML;
    }

    const html = cues
      .map((c, cueIdx) => {
        if (c.role === "sceneBreak" || !c.text?.trim()) return "";
        const role = c.role || "narration";
        const speakerAttr = c.speakerLabel
          ? ` data-tts-speaker="${escapeHtml(c.speakerLabel)}"`
          : "";
        return `<span class="tts-cue" data-tts-cue="${cueIdx}" data-tts-role="${role}"${speakerAttr}>${sentencesHtml(c.text)}</span>`;
      })
      .filter(Boolean)
      .join(" ");

    el.innerHTML = html;
    el.dataset.ttsAnnotated = "1";

    cues.forEach((c, cueIdx) => {
      if (c.role === "sceneBreak" || !c.text?.trim()) return;
      c.spanEl = el.querySelector(`[data-tts-cue="${cueIdx}"]`);
      const sentences = c.spanEl?.querySelectorAll(".tts-sentence");
      c.sentenceCount = sentences?.length || 1;
      c.wordCount = c.spanEl?.querySelectorAll(".tts-word").length || tokenizeWords(c.text).length;
    });
  }

  function clearWordHighlights(root) {
    (root || document).querySelectorAll(".tts-word-active").forEach((n) => {
      n.classList.remove("tts-word-active");
    });
  }

  function highlightSentence(cueSpan, sentenceIdx) {
    if (!cueSpan) return;
    cueSpan.querySelectorAll(".tts-sentence-active").forEach((n) => {
      n.classList.remove("tts-sentence-active");
    });
    clearWordHighlights(cueSpan);
    const sent = cueSpan.querySelector(`[data-tts-sent="${sentenceIdx}"]`);
    if (sent) {
      sent.classList.add("tts-sentence-active");
      sent.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }

  function highlightWord(cueSpan, wordIdx, sentenceIdx = null) {
    if (!cueSpan) return;
    clearWordHighlights(cueSpan);
    cueSpan.querySelectorAll(".tts-sentence-active").forEach((n) => {
      n.classList.remove("tts-sentence-active");
    });
    let word = null;
    if (sentenceIdx != null) {
      word = cueSpan.querySelector(
        `[data-tts-sent="${sentenceIdx}"] [data-tts-word="${wordIdx}"]`
      );
    }
    if (!word) {
      word = cueSpan.querySelector(`[data-tts-word="${wordIdx}"]`);
    }
    if (word) {
      word.classList.add("tts-word-active");
      word.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }

  function locateWordIndex(words, time) {
    if (!words?.length) return 0;
    for (let i = words.length - 1; i >= 0; i--) {
      if (time >= (words[i].start ?? 0)) return i;
    }
    return 0;
  }

  function restoreElementMarkup(el) {
    if (!el?.dataset?.ttsAnnotated) return;
    if (el.dataset.ttsOriginalHtml != null) {
      el.innerHTML = el.dataset.ttsOriginalHtml;
      delete el.dataset.ttsOriginalHtml;
    }
    delete el.dataset.ttsAnnotated;
    delete el.dataset.ttsIndex;
    el.classList.remove("tts-segment", "tts-scene-break", "tts-active", "tts-cue-active");
    el.querySelectorAll?.(".tts-cue")?.forEach((span) => {
      span.classList.remove("tts-cue-active");
    });
    clearWordHighlights(el);
  }

  function restoreChapterMarkup(root) {
    const scope =
      root ||
      document.getElementById("chapter-view") ||
      document.getElementById("chapter-scroll-inner");
    if (!scope) return;
    scope.querySelectorAll("[data-tts-annotated]").forEach(restoreElementMarkup);
    scope.querySelectorAll(".tts-cue-active, .tts-active").forEach((el) => {
      el.classList.remove("tts-cue-active", "tts-active");
    });
  }

  function collectBlocks(bodyEl) {
    if (window.BookPages?.allBlocks?.().length) {
      return window.BookPages.allBlocks().filter((el) => !el.matches("table"));
    }
    return Array.from(
      bodyEl.querySelectorAll(
        "p, li, blockquote, h2, h3, h4, pre, hr, .chapter-opener, .part-banner-inline"
      )
    ).filter((el) => !el.matches("table"));
  }

  function buildSegments(bodyEl, chapter, options = {}) {
    const enabled = options.listenDirector !== false;
    const pov = chapter?.pov || "Mara Voss";
    setPacingMultiplier(options.listenPacing ?? 1);

    const blocks = collectBlocks(bodyEl);
    const segments = [];

    blocks.forEach((el) => {
      const blockKind = classifyElement(el);
      if (blockKind !== "sceneBreak") {
        const raw = el.textContent.replace(/\s+/g, " ").trim();
        if (raw.length < 2) return;
      }

      let cues;

      if (enabled && typeof speechSynthesis !== "undefined") {
        refreshVoiceCache();
        const raw =
          blockKind === "sceneBreak" ? "" : el.textContent.replace(/\s+/g, " ").trim();
        cues = buildCuesForBlock(raw, blockKind, pov);
      } else if (blockKind === "sceneBreak") {
        cues = [
          {
            text: "",
            role: "sceneBreak",
            rate: 1,
            pitch: 1,
            pauseAfter: 400,
            voiceURI: null,
            cast: "neutral",
          },
        ];
      } else {
        const text = normalizeText(el.textContent);
        if (text.length < 2) return;
        cues = [
          {
            text,
            role: "narration",
            rate: 1,
            pitch: 1,
            pauseAfter: 200,
            voiceURI: null,
            cast: "neutral",
          },
        ];
      }

      cues = cues.filter((c) => c.role === "sceneBreak" || (c.text && c.text.length > 1));
      if (!cues.length) return;

      el.dataset.ttsIndex = segments.length;
      el.classList.add("tts-segment");
      if (blockKind === "sceneBreak") el.classList.add("tts-scene-break");
      else annotateCuesInElement(el, cues);

      const flatText = cues.map((c) => c.text).filter(Boolean).join(" ");
      segments.push({
        el,
        text: flatText || " ",
        cues,
        pov,
        blockKind,
      });
    });

    return segments;
  }

  function flattenSegmentText(segment) {
    if (!segment?.cues?.length) return segment?.text || "";
    return segment.cues
      .map((c) => c.text)
      .filter(Boolean)
      .join(" ");
  }

  if (typeof speechSynthesis !== "undefined") {
    speechSynthesis.addEventListener("voiceschanged", () => {
      voiceCache = null;
    });
  }

  return {
    buildSegments,
    annotateCuesInElement,
    highlightSentence,
    highlightWord,
    locateWordIndex,
    tokenizeWords,
    restoreChapterMarkup,
    normalizeText,
    flattenSegmentText,
    refreshVoiceCache,
    povProfile,
    setPacingMultiplier,
    CHARACTER_CAST,
  };
})();

window.ListenScript = ListenScript;
