/**
 * Self-hosted Piper / pre-rendered chapter audio.
 */
const HostedAudio = (() => {
  let manifest = null;
  let manifestPromise = null;

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
  }

  async function isAvailable() {
    const m = await loadManifest();
    return !!(m?.chapters && Object.keys(m.chapters).length);
  }

  async function chapterEntry(chapterId) {
    const m = await loadManifest();
    return m?.chapters?.[chapterId] || null;
  }

  function audioUrl(relativeFile) {
    return `/audio/${relativeFile}`.replace(/\/+/g, "/");
  }

  /** Weighted timeline for single-file chapter MP3 + read-along sync. */
  function buildTimeline(segments) {
    const segWeights = [];
    let total = 0;

    for (const seg of segments) {
      let w = 0;
      const cues = seg.cues || [{ text: seg.text, role: "narration" }];
      for (const c of cues) {
        if (c.role === "sceneBreak") w += 12;
        else w += Math.max(1, (c.text || "").length);
      }
      segWeights.push(w);
      total += w;
    }

    if (!total) return { segmentAt: () => 0, cueAt: () => 0 };

    const segStarts = [];
    let acc = 0;
    for (const w of segWeights) {
      segStarts.push(acc / total);
      acc += w;
    }

    function locateSegment(ratio) {
      const r = Math.max(0, Math.min(0.9999, ratio));
      for (let i = segStarts.length - 1; i >= 0; i--) {
        if (r >= segStarts[i]) return i;
      }
      return 0;
    }

    function cueAt(segIndex, ratio) {
      const seg = segments[segIndex];
      if (!seg?.cues?.length) return 0;
      const segStart = segStarts[segIndex];
      const segEnd = segIndex < segStarts.length - 1 ? segStarts[segIndex + 1] : 1;
      const span = segEnd - segStart || 1;
      const local = (ratio - segStart) / span;

      const cueWeights = seg.cues.map((c) =>
        c.role === "sceneBreak" ? 12 : Math.max(1, (c.text || "").length)
      );
      const cueTotal = cueWeights.reduce((a, b) => a + b, 0) || 1;
      let cAcc = 0;
      for (let i = 0; i < cueWeights.length; i++) {
        cAcc += cueWeights[i] / cueTotal;
        if (local <= cAcc) return i;
      }
      return Math.max(0, seg.cues.length - 1);
    }

    return {
      segmentAt(ratio) {
        return locateSegment(ratio);
      },
      cueAt(segIndex, ratio) {
        return cueAt(segIndex, ratio);
      },
    };
  }

  return {
    loadManifest,
    resetManifest,
    isAvailable,
    chapterEntry,
    audioUrl,
    buildTimeline,
  };
})();

window.HostedAudio = HostedAudio;
