/**
 * Media Session + lock-screen controls (play, seek, chapter skip).
 */
const AudioSession = (() => {
  let handlers = {
    play: () => {},
    pause: () => {},
    prevParagraph: () => {},
    nextParagraph: () => {},
    prevChapter: () => {},
    nextChapter: () => {},
    seek: () => {},
  };

  function bind(h) {
    handlers = { ...handlers, ...h };
  }

  function safeAction(action, fn) {
    if (!("mediaSession" in navigator)) return;
    try {
      navigator.mediaSession.setActionHandler(action, fn);
    } catch {
      /* unsupported */
    }
  }

  function wireHandlers() {
    safeAction("play", () => handlers.play());
    safeAction("pause", () => handlers.pause());
    safeAction("previoustrack", () => handlers.prevChapter());
    safeAction("nexttrack", () => handlers.nextChapter());
    safeAction("seekbackward", (d) => {
      const sec = d?.seekOffset || 15;
      handlers.seek(-sec);
    });
    safeAction("seekforward", (d) => {
      const sec = d?.seekOffset || 15;
      handlers.seek(sec);
    });
    safeAction("seekto", (d) => {
      if (d?.seekTime != null) handlers.seekTo?.(d.seekTime);
    });
  }

  function setMetadata(ch) {
    if (!ch || !("mediaSession" in navigator)) return;
    const label = ch.num != null ? `Chapter ${ch.num}` : "Prologue";
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: ch.title,
        artist: `${label} · ${ch.pov}`,
        album: "The Second Self · Book 1",
      });
    } catch {
      /* ignore */
    }
  }

  function setPlaybackState(playing) {
    if (!("mediaSession" in navigator)) return;
    try {
      navigator.mediaSession.playbackState = playing ? "playing" : "paused";
    } catch {
      /* ignore */
    }
  }

  function setPositionState(duration, position, rate = 1) {
    if (!("mediaSession" in navigator) || !duration) return;
    try {
      if (typeof navigator.mediaSession.setPositionState === "function") {
        navigator.mediaSession.setPositionState({
          duration: Math.max(0, duration),
          playbackRate: rate,
          position: Math.max(0, Math.min(position, duration)),
        });
      }
    } catch {
      /* ignore */
    }
  }

  function clear() {
    if (!("mediaSession" in navigator)) return;
    try {
      navigator.mediaSession.metadata = null;
      navigator.mediaSession.playbackState = "none";
      if (typeof navigator.mediaSession.setPositionState === "function") {
        navigator.mediaSession.setPositionState({ duration: 0, playbackRate: 1, position: 0 });
      }
    } catch {
      /* ignore */
    }
  }

  wireHandlers();

  return {
    bind,
    setMetadata,
    setPlaybackState,
    setPositionState,
    clear,
    wireHandlers,
  };
})();

window.AudioSession = AudioSession;
