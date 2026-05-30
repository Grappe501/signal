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
  }

  async function isAvailable() {
    const m = await loadManifest();
    return !!(m?.chapters && Object.keys(m.chapters).length);
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

  function prefetchChapter(chapterId) {
    if (!chapterId || prefetching.has(chapterId)) return;
    loadManifest().then((m) => {
      const entry = m?.chapters?.[chapterId];
      if (!entry) return;
      prefetching.add(chapterId);
      if (entry.file) {
        const link = document.createElement("link");
        link.rel = "prefetch";
        link.as = "audio";
        link.href = audioUrl(entry.file);
        document.head.appendChild(link);
      } else if (entry.segments?.length) {
        const first = entry.segments.find((s) => s.file);
        if (first?.file) {
          const link = document.createElement("link");
          link.rel = "prefetch";
          link.as = "audio";
          link.href = audioUrl(first.file);
          document.head.appendChild(link);
        }
      }
      loadChapterTiming(chapterId);
    });
  }

  /** Resolve best timeline for chapter playback + read-along. */
  async function resolveTimeline(chapterId, entry, segments) {
    if (typeof AudioTimeline === "undefined") {
      return { timeline: null, duration: entry?.duration || 0 };
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

  function pickAutoEngine(hostedOk, hasSpeech, elevenLabsOk) {
    if (hostedOk) return "hosted";
    if (hasSpeech) return "browser";
    if (elevenLabsOk) return "elevenlabs";
    return "browser";
  }

  return {
    loadManifest,
    resetManifest,
    isAvailable,
    chapterEntry,
    loadChapterTiming,
    audioUrl,
    prefetchChapter,
    resolveTimeline,
    buildTimeline,
    pickAutoEngine,
  };
})();

window.HostedAudio = HostedAudio;
