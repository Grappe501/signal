/**
 * Self-hosted Piper / pre-rendered chapter audio.
 */
const HostedAudio = (() => {
  let manifest = null;
  let manifestPromise = null;
  const timingCache = new Map();
  const prefetching = new Set();

  async function loadManifest() {
    if (manifest) return manifest;
    if (manifestPromise) return manifestPromise;
    manifestPromise = fetch("/audio/manifest.json", { cache: "no-cache" })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
      .then((data) => {
        manifest = data;
        return manifest;
      });
    return manifestPromise;
  }

  function resetManifest() {
    manifest = null;
    manifestPromise = null;
    timingCache.clear();
    prefetching.clear();
  }

  async function isAvailable() {
    const m = await loadManifest();
    return !!(m?.chapters && Object.keys(m.chapters).length);
  }

  function hasCueMode(m) {
    return m?.version >= 3 || Object.values(m?.chapters || {}).some((c) => c.mode === "cue");
  }

  async function chapterEntry(chapterId) {
    const m = await loadManifest();
    return m?.chapters?.[chapterId] || null;
  }

  async function loadChapterTiming(chapterId) {
    if (timingCache.has(chapterId)) return timingCache.get(chapterId);
    const url = `/audio/${chapterId}.timing.json`;
    try {
      const r = await fetch(url, { cache: "no-cache" });
      if (r.ok) {
        const data = await r.json();
        timingCache.set(chapterId, data);
        return data;
      }
    } catch {
      /* no sidecar */
    }
    timingCache.set(chapterId, null);
    return null;
  }

  function audioUrl(relativeFile) {
    return `/audio/${relativeFile}`.replace(/\/+/g, "/");
  }

  function normMatch(text) {
    const n =
      typeof ListenScript !== "undefined" && ListenScript.normalizeText
        ? ListenScript.normalizeText(text)
        : (text || "").replace(/\s+/g, " ").trim();
    return n.toLowerCase();
  }

  function findMatchingCue(segments, targetText) {
    const target = normMatch(targetText);
    if (!target) return null;

    for (let si = 0; si < segments.length; si++) {
      const cues = segments[si].cues || [];
      for (let ci = 0; ci < cues.length; ci++) {
        if (normMatch(cues[ci].text) === target) return { segment: si, cue: ci };
      }
    }

    const head = target.slice(0, 48);
    for (let si = 0; si < segments.length; si++) {
      const cues = segments[si].cues || [];
      for (let ci = 0; ci < cues.length; ci++) {
        const nt = normMatch(cues[ci].text);
        if (nt.startsWith(head) || head.startsWith(nt.slice(0, 48))) {
          return { segment: si, cue: ci };
        }
      }
    }

    return null;
  }

  /** Align manifest cue files to live DOM segments by spoken text. */
  function buildCuePlaylist(entry, segments, chapterId) {
    if (entry?.mode !== "cue" || !entry.cues?.length) return null;

    if (typeof AudioSync !== "undefined" && chapterId) {
      const synced = AudioSync.buildPlaylistFromManifest(entry, segments, chapterId);
      if (synced?.length) return synced;
    }

    const playlist = [];
    for (const mc of entry.cues) {
      if (mc.kind === "break" || mc.role === "sceneBreak") {
        playlist.push({
          type: "pause",
          segment: mc.segment,
          cue: mc.cue,
          pauseAfter: mc.pauseAfter ?? 0.85,
        });
        continue;
      }
      if (!mc.file || !mc.text) continue;
      const match = findMatchingCue(segments, mc.text);
      playlist.push({
        type: "speech",
        file: mc.file,
        duration: mc.duration || 0,
        words: mc.words || [],
        pauseAfter: mc.pauseAfter ?? 0.2,
        segment: match?.segment ?? mc.segment,
        cue: match?.cue ?? mc.cue,
        text: mc.text,
        role: mc.role,
        speakerLabel: mc.speakerLabel,
      });
    }
    return playlist;
  }

  function playlistDuration(playlist) {
    if (!playlist?.length) return 0;
    return playlist.reduce(
      (sum, item) =>
        sum + (item.type === "pause" ? item.pauseAfter || 0 : item.duration || 0),
      0
    );
  }

  function playlistPosition(playlist, index, audioTime = 0) {
    let pos = 0;
    for (let i = 0; i < index && i < playlist.length; i++) {
      const item = playlist[i];
      pos += item.type === "pause" ? item.pauseAfter || 0 : item.duration || 0;
    }
    const cur = playlist[index];
    if (cur?.type === "speech") pos += audioTime;
    return pos;
  }

  function prefetchChapter(chapterId) {
    if (!chapterId || prefetching.has(chapterId)) return;
    loadManifest().then((m) => {
      const entry = m?.chapters?.[chapterId];
      if (!entry) return;
      prefetching.add(chapterId);

      const urls = [];
      if (entry.mode === "cue" && entry.cues?.length) {
        for (const c of entry.cues) {
          if (c.file) urls.push(audioUrl(c.file));
        }
        if (typeof AudioCache !== "undefined") {
          AudioCache.prefetch(
            entry.cues.filter((c) => c.file).map((c) => audioUrl(c.file)),
            true
          );
        }
      } else if (entry.file) {
        urls.push(audioUrl(entry.file));
      } else if (entry.segments?.length) {
        const first = entry.segments.find((s) => s.file);
        if (first?.file) urls.push(audioUrl(first.file));
      }

      for (const href of urls.slice(0, 8)) {
        const link = document.createElement("link");
        link.rel = "prefetch";
        link.as = "audio";
        link.href = href;
        document.head.appendChild(link);
      }
      loadChapterTiming(chapterId);
    });
  }

  /** Resolve best timeline for chapter playback + read-along. */
  async function resolveTimeline(chapterId, entry, segments) {
    if (typeof AudioTimeline === "undefined") {
      return { timeline: null, duration: entry?.duration || 0 };
    }

    if (entry?.mode === "cue") {
      return {
        timeline: null,
        duration: entry.duration || 0,
        mode: "cue",
      };
    }

    if (entry?.mode === "segment" && entry.segments?.length) {
      const files = entry.segments.filter((s) => s.kind === "speech" && s.file);
      if (files.some((f) => f.duration > 0)) {
        return {
          timeline: AudioTimeline.fromSegmentDurations(files, segments),
          duration: files.reduce((s, f) => s + (f.duration || 0), 0),
        };
      }
    }

    const timing = await loadChapterTiming(chapterId);
    const fromSidecar = AudioTimeline.fromTimingSidecar(timing, segments);
    if (fromSidecar) {
      return { timeline: fromSidecar, duration: fromSidecar.duration };
    }

    if (entry?.duration > 0) {
      const tl = AudioTimeline.fromTimingSidecar(
        { duration: entry.duration, cues: timing?.cues },
        segments
      );
      if (tl) return { timeline: tl, duration: entry.duration };
    }

    return {
      timeline: AudioTimeline.fromWeights(segments),
      duration: entry?.duration || 0,
    };
  }

  function buildTimeline(segments) {
    if (typeof AudioTimeline !== "undefined") {
      return AudioTimeline.fromWeights(segments);
    }
    return null;
  }

  function pickAutoEngine(hostedOk, hasSpeech, elevenLabsOk, manifest) {
    if (hostedOk && manifest && hasCueMode(manifest)) return "hosted";
    if (hostedOk) return "hosted";
    if (hasSpeech) return "browser";
    if (elevenLabsOk) return "elevenlabs";
    return "browser";
  }

  return {
    loadManifest,
    resetManifest,
    isAvailable,
    hasCueMode,
    chapterEntry,
    loadChapterTiming,
    audioUrl,
    buildCuePlaylist,
    playlistDuration,
    playlistPosition,
    prefetchChapter,
    resolveTimeline,
    buildTimeline,
    pickAutoEngine,
  };
})();

window.HostedAudio = HostedAudio;
