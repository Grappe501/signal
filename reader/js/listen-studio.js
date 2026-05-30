/**
 * Listen Studio — immersive audiobook mode (waveform, focus, chapter rail).
 */
const ListenStudio = (() => {
  let open = false;
  let playlist = [];
  let onSeekRatio = null;
  let getPlayback = null;

  const $ = (id) => document.getElementById(id);

  function roleColor(role) {
    if (role === "dialogue") return "var(--listen-dialogue, #c9a227)";
    if (role === "blockquote") return "var(--listen-quote, #8b9eb5)";
    if (role === "sceneBreak") return "var(--listen-break, #4a5568)";
    return "var(--signal-bright, #3ecf8e)";
  }

  function drawWaveform(canvas, items, positionRatio, activeIndex) {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const total = items.reduce(
      (s, it) => s + (it.type === "pause" ? it.pauseAfter || 0.3 : it.duration || 0.5),
      0
    );
    if (!total) return;

    let x = 0;
    const posX = positionRatio * w;

    items.forEach((item, i) => {
      const span =
        item.type === "pause" ? (item.pauseAfter || 0.3) : item.duration || 0.5;
      const bw = Math.max(2, (span / total) * w);
      ctx.fillStyle =
        i === activeIndex ? roleColor(item.role) : "rgba(255,255,255,0.14)";
      if (item.type === "pause") {
        ctx.fillRect(x, h * 0.55, bw, h * 0.12);
      } else {
        const barH = h * (0.35 + Math.min(0.5, (item.duration || 1) / 8));
        ctx.fillRect(x, (h - barH) / 2, bw - 1, barH);
      }
      x += bw;
    });

    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(posX, 0);
    ctx.lineTo(posX, h);
    ctx.stroke();
  }

  function updateOverlay(state) {
    const {
      chapterTitle,
      chapterLabel,
      status,
      speaker,
      role,
      activeText,
      playlist: pl,
      playlistIndex,
      positionRatio,
    } = state;

    playlist = pl || playlist;
    const title = $("listen-studio-title");
    const meta = $("listen-studio-meta");
    const quote = $("listen-studio-quote");
    const canvas = $("listen-studio-wave");

    if (title) title.textContent = chapterTitle || "Listen";
    if (meta) {
      meta.textContent = [chapterLabel, status, speaker].filter(Boolean).join(" · ");
    }
    if (quote) {
      quote.textContent = activeText ? activeText.slice(0, 280) : "";
      quote.dataset.role = role || "narration";
      quote.style.borderLeftColor = roleColor(role);
    }

    drawWaveform(canvas, playlist, positionRatio ?? 0, playlistIndex ?? 0);
  }

  function setOpen(next, state) {
    open = !!next;
    document.body.classList.toggle("listen-studio-mode", open);
    const layer = $("listen-studio");
    if (layer) layer.classList.toggle("hidden", !open);
    if (open && state) updateOverlay(state);
  }

  function isOpen() {
    return open;
  }

  function bind(opts = {}) {
    onSeekRatio = opts.onSeekRatio;
    getPlayback = opts.getPlayback;

    $("listen-studio-close")?.addEventListener("click", () => {
      setOpen(false);
      opts.onClose?.();
    });

    $("listen-studio-prev-ch")?.addEventListener("click", () => opts.onPrevChapter?.());
    $("listen-studio-next-ch")?.addEventListener("click", () => opts.onNextChapter?.());

    const canvas = $("listen-studio-wave");
    if (canvas) {
      canvas.addEventListener("click", (e) => {
        const rect = canvas.getBoundingClientRect();
        const ratio = (e.clientX - rect.left) / rect.width;
        onSeekRatio?.(Math.max(0, Math.min(1, ratio)));
      });
    }
  }

  function tick() {
    if (!open || !getPlayback) return;
    updateOverlay(getPlayback());
  }

  return {
    bind,
    setOpen,
    isOpen,
    updateOverlay,
    tick,
  };
})();

window.ListenStudio = ListenStudio;
