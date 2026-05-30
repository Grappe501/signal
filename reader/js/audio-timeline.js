/**
 * Playback timelines — timing sidecar (precise) or weight-based (fallback).
 */
const AudioTimeline = (() => {
  function formatTime(sec) {
    if (!Number.isFinite(sec) || sec < 0) return "0:00";
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    if (h > 0) {
      return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    }
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function fromWeights(segments) {
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

    if (!total) {
      return {
        duration: 0,
        kind: "weights",
        locate() {
          return { segment: 0, cue: 0, sentence: 0 };
        },
        segmentAt: () => 0,
        cueAt: () => 0,
        sentenceAt: () => 0,
      };
    }

    const segStarts = [];
    let acc = 0;
    for (const w of segWeights) {
      segStarts.push(acc / total);
      acc += w;
    }

    function locateRatio(ratio) {
      const r = Math.max(0, Math.min(0.9999, ratio));
      let segment = 0;
      for (let i = segStarts.length - 1; i >= 0; i--) {
        if (r >= segStarts[i]) {
          segment = i;
          break;
        }
      }
      const seg = segments[segment];
      const segStart = segStarts[segment];
      const segEnd = segment < segStarts.length - 1 ? segStarts[segment + 1] : 1;
      const span = segEnd - segStart || 1;
      const local = (r - segStart) / span;
      const cues = seg?.cues || [];
      if (!cues.length) return { segment, cue: 0, sentence: 0 };

      const cueWeights = cues.map((c) =>
        c.role === "sceneBreak" ? 12 : Math.max(1, (c.text || "").length)
      );
      const cueTotal = cueWeights.reduce((a, b) => a + b, 0) || 1;
      let cAcc = 0;
      let cue = 0;
      for (let i = 0; i < cueWeights.length; i++) {
        cAcc += cueWeights[i] / cueTotal;
        if (local <= cAcc) {
          cue = i;
          break;
        }
        cue = i;
      }

      const cueEl = cues[cue];
      const sentCount = cueEl?.sentenceCount || 1;
      const sentLocal = (local * cueTotal - (cAcc - cueWeights[cue] / cueTotal)) / (cueWeights[cue] / cueTotal || 1);
      const sentence = Math.min(sentCount - 1, Math.max(0, Math.floor(sentLocal * sentCount)));

      return { segment, cue, sentence };
    }

    return {
      duration: 0,
      kind: "weights",
      locate(time, duration) {
        if (!duration) return locateRatio(0);
        return locateRatio(time / duration);
      },
      segmentAt(ratio) {
        return locateRatio(ratio).segment;
      },
      cueAt(segIndex, ratio) {
        const r = Math.max(0, Math.min(0.9999, ratio));
        const segStart = segStarts[segIndex] ?? 0;
        const segEnd = segIndex < segStarts.length - 1 ? segStarts[segIndex + 1] : 1;
        const local = (r - segStart) / (segEnd - segStart || 1);
        const seg = segments[segIndex];
        const cues = seg?.cues || [];
        if (!cues.length) return 0;
        const cueWeights = cues.map((c) =>
          c.role === "sceneBreak" ? 12 : Math.max(1, (c.text || "").length)
        );
        const cueTotal = cueWeights.reduce((a, b) => a + b, 0) || 1;
        let cAcc = 0;
        for (let i = 0; i < cueWeights.length; i++) {
          cAcc += cueWeights[i] / cueTotal;
          if (local <= cAcc) return i;
        }
        return Math.max(0, cues.length - 1);
      },
      sentenceAt(segIndex, cueIndex, ratio) {
        return locateRatio(ratio).sentence;
      },
    };
  }

  function fromTimingSidecar(timing, segments) {
    if (!timing?.cues?.length) return null;
    const duration = timing.duration || timing.cues[timing.cues.length - 1]?.end || 0;

    return {
      duration,
      kind: "sidecar",
      locate(time) {
        const t = Math.max(0, Math.min(time, duration));
        for (let i = timing.cues.length - 1; i >= 0; i--) {
          const c = timing.cues[i];
          if (t >= (c.start ?? 0)) {
            return {
              segment: Math.min(c.segment ?? 0, Math.max(0, segments.length - 1)),
              cue: c.cue ?? 0,
              sentence: c.sentence ?? 0,
            };
          }
        }
        return { segment: 0, cue: 0, sentence: 0 };
      },
      segmentAt(ratio) {
        return this.locate(ratio * duration).segment;
      },
      cueAt(segIndex, ratio) {
        return this.locate(ratio * duration).cue;
      },
      sentenceAt(segIndex, cueIndex, ratio) {
        return this.locate(ratio * duration).sentence;
      },
    };
  }

  /** Segment-mode manifest: each file has duration → cumulative timeline. */
  function fromSegmentDurations(segmentFiles, segments) {
    const marks = [];
    let t = 0;
    let total = 0;
    for (let i = 0; i < segmentFiles.length; i++) {
      const dur = segmentFiles[i].duration || 3;
      marks.push({ start: t, end: t + dur, segment: Math.min(i, segments.length - 1), cue: 0, sentence: 0 });
      t += dur;
      total += dur;
    }
    const duration = total;

    return {
      duration,
      kind: "segments",
      locate(time) {
        const x = Math.max(0, Math.min(time, duration));
        for (let i = marks.length - 1; i >= 0; i--) {
          if (x >= marks[i].start) {
            return {
              segment: marks[i].segment,
              cue: marks[i].cue,
              sentence: marks[i].sentence,
            };
          }
        }
        return { segment: 0, cue: 0, sentence: 0 };
      },
      segmentAt(ratio) {
        return this.locate(ratio * duration).segment;
      },
      cueAt(segIndex, ratio) {
        return this.locate(ratio * duration).cue;
      },
      sentenceAt(segIndex, cueIndex, ratio) {
        return 0;
      },
    };
  }

  /** Build timing sidecar from block list + measured duration (Piper batch). */
  function buildSidecarFromBlocks(blocks, duration) {
    const speech = blocks.filter((b) => b.kind === "speech" && b.text);
    const totalChars = speech.reduce((s, b) => s + b.text.length, 0) || 1;
    const cues = [];
    let t = 0;
    let segment = 0;

    for (const block of blocks) {
      if (block.kind === "break") {
        const pause = 0.9;
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

  return {
    formatTime,
    fromWeights,
    fromTimingSidecar,
    fromSegmentDurations,
    buildSidecarFromBlocks,
  };
})();

window.AudioTimeline = AudioTimeline;
