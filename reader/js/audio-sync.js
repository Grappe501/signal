/**
 * Stable sync IDs — batch manifest ↔ live DOM (no text matching).
 */
const AudioSync = (() => {
  function cueId(chapterId, segment, cue) {
    return `${chapterId}-s${segment}-c${cue}`;
  }

  function segmentId(chapterId, segment) {
    return `${chapterId}-s${segment}`;
  }

  function assignCueIds(chapterId, segments) {
    if (!chapterId || !segments?.length) return;
    segments.forEach((seg, si) => {
      if (seg.el) {
        seg.el.dataset.ttsSyncSegment = String(si);
        seg.syncId = segmentId(chapterId, si);
      }
      (seg.cues || []).forEach((c, ci) => {
        c.syncId = cueId(chapterId, si, ci);
        if (c.spanEl) c.spanEl.dataset.ttsSyncId = c.syncId;
      });
    });
  }

  function findCueBySyncId(segments, syncId) {
    if (!syncId || !segments?.length) return null;
    for (let si = 0; si < segments.length; si++) {
      const cues = segments[si].cues || [];
      for (let ci = 0; ci < cues.length; ci++) {
        if (cues[ci].syncId === syncId) return { segment: si, cue: ci, cueData: cues[ci] };
      }
    }
    return null;
  }

  function buildPlaylistFromManifest(entry, segments, chapterId) {
    if (!entry?.cues?.length) return null;
    const playlist = [];

    for (const mc of entry.cues) {
      const sid = mc.syncId || cueId(chapterId, mc.segment ?? 0, mc.cue ?? 0);
      if (mc.kind === "break" || mc.role === "sceneBreak") {
        playlist.push({
          type: "pause",
          syncId: sid,
          segment: mc.segment ?? 0,
          cue: mc.cue ?? 0,
          pauseAfter: mc.pauseAfter ?? 0.85,
        });
        continue;
      }
      if (!mc.file) continue;

      const match = findCueBySyncId(segments, sid);
      playlist.push({
        type: "speech",
        syncId: sid,
        file: mc.file,
        duration: mc.duration || 0,
        words: mc.words || [],
        pauseAfter: mc.pauseAfter ?? 0.2,
        segment: match?.segment ?? mc.segment ?? 0,
        cue: match?.cue ?? mc.cue ?? 0,
        text: mc.text,
        role: mc.role,
        speakerLabel: mc.speakerLabel,
        voice: mc.voice || null,
      });
    }
    return playlist;
  }

  return {
    cueId,
    segmentId,
    assignCueIds,
    findCueBySyncId,
    buildPlaylistFromManifest,
  };
})();

window.AudioSync = AudioSync;
