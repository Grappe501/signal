/**
 * Text-to-speech — Browser/device voice (default) + ElevenLabs (optional upgrade).
 * Production: Netlify functions proxy the API key.
 * Local: paste your ElevenLabs API key in the reader settings.
 */
const TTS = (() => {
  let segments = [];
  let index = 0;
  let speaking = false;
  let paused = false;
  let loading = false;
  let chapterTitle = "";
  let onEndCallback = null;
  let getSettings = () => ({});
  let saveSettings = () => {};
  let onPlayerVisibility = () => {};
  let playerOpen = false;
  let continuousListen = false;
  let chapterAdvancing = false;

  let audio = null;
  let audioUrl = null;
  let abortCtrl = null;
  let prefetchCache = new Map();
  let voices = [];
  let proxyAvailable = null;
  let elevenLabsReady = null;
  let textChunks = [];
  let chunkIndex = 0;
  let cueIndex = 0;
  let currentCue = null;
  let iosKeepAlive = null;
  let segmentEnding = false;
  let chapterMeta = null;
  let wakeLock = null;
  let hostedAvailable = false;
  let hostedTimeline = null;
  let hostedChapterEntry = null;
  let hostedFileIndex = 0;
  let onPrevChapter = null;
  let onNextChapter = null;
  let onPrefetchChapter = null;
  let chapterTimeline = null;
  let scrubbing = false;
  let sentencePulseTimer = null;
  let sleepTimerId = null;
  let lastTimelinePos = { segment: -1, cue: -1, sentence: -1 };

  const $ = (id) => document.getElementById(id);

  function isAppleTouch() {
    return (
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
    );
  }

  function chunkMaxLen() {
    if (isAppleTouch()) return 200;
    return engine() === "elevenlabs" ? 1800 : 900;
  }

  function splitTextChunks(text, maxLen) {
    const trimmed = text.replace(/\s+/g, " ").trim();
    if (!trimmed) return [];
    if (trimmed.length <= maxLen) return [trimmed];

    const parts = trimmed.split(/(?<=[.!?…])\s+/);
    const chunks = [];
    let buf = "";

    for (const part of parts) {
      const next = buf ? `${buf} ${part}` : part;
      if (next.length > maxLen && buf) {
        chunks.push(buf.trim());
        buf = part;
      } else {
        buf = next;
      }
    }
    if (buf.trim()) chunks.push(buf.trim());

    if (!chunks.length) {
      for (let i = 0; i < trimmed.length; i += maxLen) {
        chunks.push(trimmed.slice(i, i + maxLen));
      }
    }
    return chunks;
  }

  function startIosKeepAlive() {
    stopIosKeepAlive();
    if (!isAppleTouch() || !("speechSynthesis" in window)) return;
    iosKeepAlive = setInterval(() => {
      if (!speechSynthesis.speaking || speechSynthesis.paused) return;
      speechSynthesis.pause();
      speechSynthesis.resume();
    }, 7000);
  }

  function stopIosKeepAlive() {
    if (iosKeepAlive) {
      clearInterval(iosKeepAlive);
      iosKeepAlive = null;
    }
  }

  function supported() {
    if ("speechSynthesis" in window) return true;
    if (hostedAvailable) return true;
    return proxyAvailable === true || !!getSettings().elevenLabsApiKey;
  }

  async function refreshHostedAvailability() {
    if (typeof HostedAudio === "undefined") {
      hostedAvailable = false;
    } else {
      hostedAvailable = await HostedAudio.isAvailable();
    }
    const opt = document.querySelector('#tts-engine option[value="hosted"]');
    if (opt) {
      opt.disabled = !hostedAvailable;
      if (!hostedAvailable && engine() === "hosted") {
        const eng = $("tts-engine");
        if (eng) eng.value = "browser";
      }
    }
    updateEngineHint();
  }

  function engine() {
    const raw = getSettings().ttsEngine || "auto";
    if (raw !== "auto") return raw;
    if (hostedAvailable) return "hosted";
    if ("speechSynthesis" in window) return "browser";
    if (proxyAvailable || getSettings().elevenLabsApiKey) return "elevenlabs";
    return "browser";
  }

  function isFilePlayback() {
    const e = engine();
    return (e === "hosted" || e === "elevenlabs") && !!audio;
  }

  function applyAudioVolume() {
    if (!audio) return;
    audio.volume = Math.min(1, Math.max(0, getSettings().audioVolume ?? 1));
  }

  function stopSentencePulse() {
    if (sentencePulseTimer) {
      clearInterval(sentencePulseTimer);
      sentencePulseTimer = null;
    }
    document.querySelectorAll(".tts-sentence-active").forEach((el) => {
      el.classList.remove("tts-sentence-active");
    });
  }

  function estimateUtteranceMs(text, rate = 1) {
    const charsPerSec = 13.5 * rate;
    return Math.max(400, (text.length / charsPerSec) * 1000);
  }

  function startSentencePulse(cue, chunkText) {
    stopSentencePulse();
    if (engine() !== "browser" || !cue?.spanEl || typeof ListenScript === "undefined") return;
    const sents = cue.spanEl.querySelectorAll(".tts-sentence");
    if (sents.length < 2) return;
    const rate = getSettings().speechRate || 1;
    const ms = estimateUtteranceMs(chunkText, rate) / sents.length;
    let si = 0;
    ListenScript.highlightSentence(cue.spanEl, 0);
    sentencePulseTimer = setInterval(() => {
      si++;
      if (si >= sents.length) {
        stopSentencePulse();
        return;
      }
      ListenScript.highlightSentence(cue.spanEl, si);
    }, ms);
  }

  function armSleepTimer() {
    if (sleepTimerId) {
      clearTimeout(sleepTimerId);
      sleepTimerId = null;
    }
    const min = parseInt(getSettings().listenSleepMin || "0", 10);
    if (!min) return;
    sleepTimerId = setTimeout(
      () => {
        hidePanel();
        setStatus(`Sleep timer · stopped after ${min} min`);
      },
      min * 60 * 1000
    );
  }

  function updatePlaybackUi() {
    const scrub = $("tts-scrub");
    const elapsed = $("tts-elapsed");
    const remaining = $("tts-remaining");
    const para = $("tts-paragraph-label");
    const chProg = $("tts-chapter-progress-label");
    const inline = $("tts-status-inline");

    if (para && segments.length) {
      para.textContent = `¶ ${index + 1} / ${segments.length}`;
    }

    if (inline) inline.textContent = statusLabel();

    if (audio && audio.duration > 0 && isFilePlayback()) {
      if (scrub && !scrubbing) {
        scrub.disabled = false;
        scrub.value = String(Math.round((audio.currentTime / audio.duration) * 1000));
      }
      if (elapsed) {
        elapsed.textContent =
          typeof AudioTimeline !== "undefined"
            ? AudioTimeline.formatTime(audio.currentTime)
            : "0:00";
      }
      if (remaining) {
        const left = Math.max(0, audio.duration - audio.currentTime);
        remaining.textContent =
          typeof AudioTimeline !== "undefined"
            ? `−${AudioTimeline.formatTime(left)}`
            : "";
      }
      if (typeof AudioSession !== "undefined") {
        AudioSession.setPositionState(
          audio.duration,
          audio.currentTime,
          audio.playbackRate || 1
        );
      }
    } else {
      if (scrub) {
        scrub.disabled = true;
        if (!scrubbing) scrub.value = "0";
      }
      if (elapsed) elapsed.textContent = "0:00";
      if (remaining) remaining.textContent = "";
      const fill = $("tts-progress-fill");
      if (fill && segments.length) {
        fill.style.width = `${((index + 1) / segments.length) * 100}%`;
      }
    }

    if (chProg && chapterMeta?.num != null) {
      chProg.textContent = `Ch ${chapterMeta.num}`;
    } else if (chProg) {
      chProg.textContent = chapterMeta?.id === "prologue" ? "Prologue" : "";
    }
  }

  function applyTimelinePosition(pos) {
    if (!pos) return;
    if (
      pos.segment === lastTimelinePos.segment &&
      pos.cue === lastTimelinePos.cue &&
      pos.sentence === lastTimelinePos.sentence
    ) {
      return;
    }
    lastTimelinePos = { ...pos };
    index = pos.segment;
    cueIndex = pos.cue;
    highlightCue(pos.segment, pos.cue);
    const cue = segments[pos.segment]?.cues?.[pos.cue];
    if (cue?.spanEl && typeof ListenScript !== "undefined") {
      ListenScript.highlightSentence(cue.spanEl, pos.sentence || 0);
    }
  }

  function onFileTimeUpdate() {
    if (!audio?.duration || !chapterTimeline) return;
    const pos = chapterTimeline.locate(audio.currentTime, audio.duration);
    applyTimelinePosition(pos);
    updatePlaybackUi();
  }

  function skipSeconds(delta) {
    if (audio && audio.duration) {
      audio.currentTime = Math.max(0, Math.min(audio.duration, audio.currentTime + delta));
      onFileTimeUpdate();
      return;
    }
    if (delta < 0) prev();
    else next();
  }

  function seekToRatio(ratio) {
    if (!audio?.duration) return;
    audio.currentTime = Math.max(0, Math.min(1, ratio)) * audio.duration;
    onFileTimeUpdate();
  }

  async function elevenLabsAvailable() {
    if (engine() !== "elevenlabs") return false;
    if (elevenLabsReady !== null) return elevenLabsReady;
    const s = getSettings();
    const hasProxy = await checkProxy();
    elevenLabsReady = hasProxy || !!s.elevenLabsApiKey;
    return elevenLabsReady;
  }

  function resetElevenLabsReady() {
    elevenLabsReady = null;
    proxyAvailable = null;
  }

  function updateEngineHint() {
    const hint = $("tts-upgrade-hint");
    if (!hint) return;
    const s = getSettings();
    if (engine() === "browser") {
      const director = getSettings().listenDirector !== false;
      const preset = getSettings().listenPreset || "standard";
      const presetLabel =
        typeof ListenPresets !== "undefined"
          ? ListenPresets.get(preset).label
          : preset;
      hint.textContent = director
        ? `Smart narration · ${presetLabel} mood (free · device).`
        : "Plain device voice. Enable Smart narration below for audiobook pacing.";
    } else if (engine() === "hosted") {
      hint.textContent = hostedAvailable
        ? "Self-hosted Piper · timing sidecar sync when present · prefetch next chapter."
        : "No audio/manifest.json yet. Run npm run piper:batch locally, deploy reader/audio/.";
    } else if ((getSettings().ttsEngine || "auto") === "auto") {
      hint.textContent = hostedAvailable
        ? "Auto → Hosted Piper (deployed). Falls back to device voice."
        : "Auto → Device voice (smart narration). Add Piper audio for hosted upgrade.";
    } else if (proxyAvailable || s.elevenLabsApiKey) {
      hint.textContent = "ElevenLabs narration — high quality, requires API access.";
    } else {
      hint.textContent =
        "ElevenLabs needs an API key below, or switch to Browser (device voice).";
    }
  }

  function stripMarkdown(html) {
    const tmp = document.createElement("div");
    tmp.innerHTML = html;
    tmp.querySelectorAll("table, hr, script, style").forEach((el) => el.remove());
    return tmp;
  }

  function prepareSegments(bodyEl, chapter) {
    if (typeof ListenScript !== "undefined") {
      ListenScript.restoreChapterMarkup(
        bodyEl?.closest?.("#chapter-view") || document.getElementById("chapter-view")
      );
    }
    chapterMeta = chapter || null;
    const useDirector =
      engine() === "browser" &&
      getSettings().listenDirector !== false &&
      typeof ListenScript !== "undefined";

    if (useDirector) {
      segments = ListenScript.buildSegments(bodyEl, chapter, {
        listenDirector: true,
        listenPacing: getSettings().listenPacing ?? 1,
      });
    } else {
      const blocks = window.BookPages?.allBlocks?.().length
        ? window.BookPages.allBlocks()
        : Array.from(
            bodyEl.querySelectorAll(
              "p, li, blockquote, h2, h3, h4, pre, .chapter-opener, .part-banner-inline"
            )
          );

      segments = [];
      blocks.forEach((el) => {
        if (el.matches("table")) return;
        const text = (ListenScript?.normalizeText?.(el.textContent) || el.textContent)
          .replace(/\s+/g, " ")
          .trim();
        if (text.length < 2) return;
        const cues = [
          { text, role: "narration", rate: 1, pitch: 1, pauseAfter: 200, voiceURI: null },
        ];
        el.dataset.ttsIndex = segments.length;
        el.classList.add("tts-segment");
        if (typeof ListenScript !== "undefined") {
          ListenScript.annotateCuesInElement(el, cues);
        }
        segments.push({ el, text, cues });
      });
    }

    return segments.length;
  }

  function statusLabel() {
    const seg = segments[index];
    if (!seg) return "Device voice";
    const pov = seg.pov || chapterMeta?.pov;
    const role = currentCue?.role || "narration";
    const shortPov = pov ? pov.split("/")[0].trim().split(" ").pop() : "";
    const director = getSettings().listenDirector !== false && engine() === "browser";
    if (!director) return isAppleTouch() ? "Device voice · iPad" : "Device voice";
    const roleTag =
      currentCue?.speakerLabel
        ? ` · ${currentCue.speakerLabel}`
        : role === "sceneBreak"
          ? " · break"
          : role !== "narration"
            ? ` · ${role}`
            : "";
    return `${shortPov || "Listen"}${roleTag}`;
  }

  async function requestWakeLock() {
    try {
      if ("wakeLock" in navigator && !wakeLock) {
        wakeLock = await navigator.wakeLock.request("screen");
      }
    } catch {
      /* unsupported or denied */
    }
  }

  function releaseWakeLock() {
    wakeLock?.release?.();
    wakeLock = null;
  }

  function updateMediaSession(ch) {
    if (typeof AudioSession === "undefined") return;
    if (ch) AudioSession.setMetadata(ch);
    AudioSession.setPlaybackState(speaking && !paused);
    if (audio?.duration) {
      AudioSession.setPositionState(audio.duration, audio.currentTime, audio.playbackRate || 1);
    }
  }

  function clearMediaSession() {
    if (typeof AudioSession !== "undefined") AudioSession.clear();
  }

  function highlightCue(segIndex, cueIdx = 0) {
    document.querySelectorAll(".tts-cue-active").forEach((el) => el.classList.remove("tts-cue-active"));
    document.querySelectorAll(".tts-active").forEach((el) => el.classList.remove("tts-active"));

    const seg = segments[segIndex];
    if (!seg?.el) return;

    const blockEl = seg.el;
    const cue = seg.cues?.[cueIdx];
    let focusEl = blockEl;

    if (cue?.spanEl?.isConnected) {
      cue.spanEl.classList.add("tts-cue-active");
      focusEl = cue.spanEl;
    } else if (cue?.role !== "sceneBreak") {
      const span = blockEl.querySelector(`[data-tts-cue="${cueIdx}"]`);
      if (span) {
        span.classList.add("tts-cue-active");
        focusEl = span;
        cue.spanEl = span;
      }
    }

    blockEl.classList.add("tts-active");

    if (document.body.classList.contains("layout-scroll")) {
      focusEl.scrollIntoView({
        block: "center",
        behavior: isAppleTouch() ? "auto" : "smooth",
      });
    } else if (window.BookPages) {
      BookPages.showSpreadContaining(blockEl);
      if (focusEl !== blockEl) {
        focusEl.scrollIntoView({ block: "nearest", behavior: isAppleTouch() ? "auto" : "smooth" });
      }
    }

    const segLabel = $("tts-segment");
    if (segLabel) segLabel.textContent = segments.length ? `${segIndex + 1} / ${segments.length}` : "0 / 0";
    const fill = $("tts-progress-fill");
    if (fill && segments.length && !isFilePlayback()) {
      fill.style.width = `${((segIndex + 1) / segments.length) * 100}%`;
    }
    updatePlaybackUi();
  }

  function highlight(i) {
    highlightCue(i, cueIndex);
  }

  function setStatus(msg) {
    const el = $("tts-status");
    if (el) el.textContent = msg || "";
    const inline = $("tts-status-inline");
    if (inline && msg) inline.textContent = msg;
    else if (inline && speaking) inline.textContent = statusLabel();
  }

  function updatePlayBtn() {
    const btn = $("tts-play");
    if (!btn) return;
    if (loading) {
      btn.textContent = "…";
      btn.setAttribute("aria-label", "Loading audio");
    } else {
      btn.textContent = speaking && !paused ? "⏸" : "▶";
      btn.setAttribute("aria-label", speaking && !paused ? "Pause" : "Play");
    }
    btn.classList.toggle("tts-loading", loading);
  }

  function setPlayerOpen(open) {
    playerOpen = !!open;
    document.body.classList.toggle("tts-active", playerOpen);
    document.body.classList.toggle("tts-player-open", playerOpen);
    const player = $("tts-player");
    if (player) player.classList.toggle("hidden", !playerOpen);
    onPlayerVisibility(playerOpen);
  }

  function showPanel() {
    setPlayerOpen(true);
  }

  function openPlayer() {
    setPlayerOpen(true);
  }

  function hidePanel() {
    stop(true);
    setPlayerOpen(false);
    document.getElementById("listen-toggle")?.classList.remove("active");
  }

  function isPlayerOpen() {
    return playerOpen;
  }

  function updateContinuousUi() {
    const toggle = $("tts-continuous");
    if (toggle) toggle.checked = continuousListen;
  }

  function setContinuousListen(on) {
    continuousListen = !!on;
    updateContinuousUi();
  }

  function isContinuousListen() {
    return continuousListen;
  }

  function setChapterAdvancing(on) {
    chapterAdvancing = !!on;
  }

  function consumeChapterAdvancing() {
    if (!chapterAdvancing) return false;
    chapterAdvancing = false;
    return true;
  }

  function clearHostedSync() {
    if (audio) audio.ontimeupdate = null;
    hostedTimeline = null;
  }

  function releaseAudio() {
    if (audio) {
      audio.onended = null;
      audio.onerror = null;
      audio.onstalled = null;
      audio.ontimeupdate = null;
      audio.pause();
      audio.src = "";
      audio = null;
    }
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      audioUrl = null;
    }
  }

  function setupAudioElement(blob) {
    audioUrl = URL.createObjectURL(blob);
    audio = new Audio(audioUrl);
    audio.preload = "auto";
    audio.playsInline = true;
    audio.setAttribute("playsinline", "");
    audio.playbackRate = getSettings().speechRate || 1;
    applyAudioVolume();
    return audio;
  }

  function stop(clearContinuous = true) {
    abortCtrl?.abort();
    abortCtrl = null;
    segmentEnding = false;
    textChunks = [];
    chunkIndex = 0;
    cueIndex = 0;
    currentCue = null;
    stopIosKeepAlive();
    stopSentencePulse();
    releaseWakeLock();
    clearMediaSession();
    lastTimelinePos = { segment: -1, cue: -1, sentence: -1 };
    chapterTimeline = null;
    updatePlaybackUi();
    if (engine() === "browser") speechSynthesis.cancel();
    releaseAudio();
    speaking = false;
    paused = false;
    loading = false;
    if (clearContinuous) continuousListen = false;
    setStatus("");
    document.querySelectorAll(".tts-active, .tts-cue-active").forEach((el) => {
      el.classList.remove("tts-active", "tts-cue-active");
    });
    updatePlayBtn();
    updateContinuousUi();
  }

  // ── Browser engine ──

  function pickBrowserVoice(uri) {
    const voices = speechSynthesis.getVoices();
    if (!voices.length) return null;
    if (uri) {
      const v = voices.find((v) => v.voiceURI === uri);
      if (v) return v;
    }
    const en = voices.filter((v) => v.lang.startsWith("en"));
    return (
      en.find((v) => v.name.includes("Natural") || v.name.includes("Premium")) ||
      en.find((v) => v.localService) ||
      en[0] ||
      voices[0]
    );
  }

  function populateBrowserVoices() {
    const select = $("tts-voice");
    const wrap = $("tts-voice-wrap");
    if (!select || !("speechSynthesis" in window)) return;

    const list = speechSynthesis.getVoices().filter((v) => v.lang.startsWith("en"));
    if (list.length < 2) {
      wrap?.classList.add("hidden");
      return;
    }

    wrap?.classList.remove("hidden");
    select.innerHTML = list
      .map((v) => `<option value="${v.voiceURI}">${v.name}</option>`)
      .join("");

    const saved = getSettings().speechVoice;
    if (saved) select.value = saved;
  }

  function beginCue(cue) {
    currentCue = cue;
    const seg = segments[index];
    if (seg?.cues?.length) {
      const idx = seg.cues.indexOf(cue);
      highlightCue(index, idx >= 0 ? idx : cueIndex);
    }
    if (cue?.role === "sceneBreak" || !cue?.text?.trim()) {
      textChunks = [];
      chunkIndex = 0;
      return;
    }
    textChunks = splitTextChunks(cue.text, chunkMaxLen());
    chunkIndex = 0;
  }

  function advanceAfterCue() {
    const seg = segments[index];
    if (!seg?.cues?.length) {
      finishSegment();
      return;
    }
    const pause = currentCue?.pauseAfter ?? 200;
    cueIndex++;
    if (cueIndex < seg.cues.length) {
      beginCue(seg.cues[cueIndex]);
      setTimeout(speakBrowserChunk, pause);
      return;
    }
    cueIndex = 0;
    currentCue = null;
    textChunks = [];
    chunkIndex = 0;
    stopIosKeepAlive();
    finishSegment();
  }

  function speakBrowserChunk() {
    const seg = segments[index];
    if (!seg?.cues?.length) {
      finishSegment();
      return;
    }

    if (!currentCue || cueIndex >= seg.cues.length) {
      cueIndex = 0;
      beginCue(seg.cues[0]);
    }

    if (!textChunks.length || !textChunks[chunkIndex]) {
      advanceAfterCue();
      return;
    }

    speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(textChunks[chunkIndex]);
    const settings = getSettings();
    const userRate = settings.speechRate || 1;
    utt.rate = Math.min(1.45, Math.max(0.72, (currentCue.rate || 1) * userRate));
    utt.pitch = Math.min(1.35, Math.max(0.75, currentCue.pitch || 1));
    const voiceUri =
      currentCue.voiceURI ||
      settings.speechVoice ||
      $("tts-voice")?.value ||
      null;
    const voice = pickBrowserVoice(voiceUri);
    if (voice) utt.voice = voice;

    utt.onstart = () => {
      speaking = true;
      paused = false;
      loading = false;
      updatePlayBtn();
      highlightCue(index, cueIndex);
      startSentencePulse(currentCue, textChunks[chunkIndex]);
      const tag = statusLabel();
      const progress =
        seg.cues.length > 1 || textChunks.length > 1
          ? ` · ¶${index + 1}/${segments.length}${
              textChunks.length > 1 ? ` · ${chunkIndex + 1}/${textChunks.length}` : ""
            }`
          : "";
      setStatus(tag + progress);
      startIosKeepAlive();
      requestWakeLock();
      if (chapterMeta) updateMediaSession(chapterMeta);
    };

    utt.onend = () => {
      chunkIndex++;
      if (chunkIndex < textChunks.length) {
        setTimeout(speakBrowserChunk, isAppleTouch() ? 120 : 30);
        return;
      }
      textChunks = [];
      chunkIndex = 0;
      stopIosKeepAlive();
      advanceAfterCue();
    };

    utt.onerror = (ev) => {
      console.warn("Browser TTS error:", ev?.error || ev);
      stopIosKeepAlive();
      chunkIndex++;
      if (chunkIndex < textChunks.length) {
        setTimeout(speakBrowserChunk, 150);
        return;
      }
      textChunks = [];
      chunkIndex = 0;
      advanceAfterCue();
    };

    speechSynthesis.speak(utt);
  }

  function speakBrowser() {
    if (!segments[index]) return;
    cueIndex = 0;
    currentCue = null;
    const seg = segments[index];
    if (!seg.cues?.length) {
      finishSegment();
      return;
    }
    beginCue(seg.cues[0]);
    if (!textChunks.length) {
      advanceAfterCue();
      return;
    }
    speakBrowserChunk();
  }

  // ── ElevenLabs engine ──

  async function checkProxy() {
    if (proxyAvailable != null) return proxyAvailable;
    try {
      const res = await fetch("/api/voices", { method: "GET" });
      proxyAvailable = res.ok;
      if (!res.ok && res.status === 503) {
        setStatus("ElevenLabs not configured on server — use Browser voice");
      }
    } catch {
      proxyAvailable = false;
    }
    elevenLabsReady = null;
    updateApiKeyVisibility();
    updateEngineHint();
    return proxyAvailable;
  }

  async function ensureElevenLabsVoice() {
    const s = getSettings();
    if (s.elevenLabsVoice) return true;
    if (!voices.length) await fetchVoices();
    if (!voices.length) return false;
    s.elevenLabsVoice = voices[0].id;
    saveSettings();
    const sel = $("tts-voice");
    if (sel) sel.value = s.elevenLabsVoice;
    return true;
  }

  function updateApiKeyVisibility() {
    const wrap = $("tts-api-wrap");
    const s = getSettings();
    if (!wrap) return;
    const show = engine() === "elevenlabs" && !proxyAvailable && !s.elevenLabsApiKey;
    wrap.classList.toggle("hidden", !show);
  }

  async function fetchVoices() {
    const s = getSettings();
    const headers = {};
    let url = "/api/voices";

    const hasProxy = await checkProxy();
    if (!hasProxy) {
      if (!s.elevenLabsApiKey) {
        setStatus("Add ElevenLabs API key below");
        return [];
      }
      url = "https://api.elevenlabs.io/v1/voices";
      headers["xi-api-key"] = s.elevenLabsApiKey;
    }

    try {
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      voices = (data.voices || data)
        .map((v) => ({ id: v.voice_id, name: v.name, labels: v.labels || {} }))
        .sort((a, b) => a.name.localeCompare(b.name));
      populateElevenLabsVoices();
      return voices;
    } catch (e) {
      setStatus("Could not load voices");
      console.warn("ElevenLabs voices:", e);
      return [];
    }
  }

  function populateElevenLabsVoices() {
    const select = $("tts-voice");
    const wrap = $("tts-voice-wrap");
    if (!select || !voices.length) return;

    wrap?.classList.remove("hidden");
    select.innerHTML = voices
      .map((v) => {
        const tag = v.labels?.accent || v.labels?.description || "";
        return `<option value="${v.id}">${v.name}${tag ? ` · ${tag}` : ""}</option>`;
      })
      .join("");

    const saved = getSettings().elevenLabsVoice;
    if (saved && voices.some((v) => v.id === saved)) {
      select.value = saved;
    }
  }

  function cacheKey(text) {
    const s = getSettings();
    return `${s.elevenLabsVoice}|${s.elevenLabsModel}|${text.slice(0, 80)}|${text.length}`;
  }

  async function synthesize(text, signal) {
    const s = getSettings();
    const voiceId = s.elevenLabsVoice || $("tts-voice")?.value;
    if (!voiceId) throw new Error("No voice selected");

    const key = cacheKey(text);
    if (prefetchCache.has(key)) return prefetchCache.get(key);

    const hasProxy = await checkProxy();
    let url = "/api/tts";
    const headers = { "Content-Type": "application/json" };
    let body = {
      text: text.slice(0, 4500),
      voice_id: voiceId,
      model_id: s.elevenLabsModel || "eleven_turbo_v2_5",
    };

    if (!hasProxy) {
      if (!s.elevenLabsApiKey) throw new Error("ElevenLabs API key required");
      url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`;
      headers["xi-api-key"] = s.elevenLabsApiKey;
      headers["Accept"] = "audio/mpeg";
      body = {
        text: body.text,
        model_id: body.model_id,
        voice_settings: { stability: 0.45, similarity_boost: 0.75, style: 0.15, use_speaker_boost: true },
      };
    }

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal,
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(err || `TTS failed (${res.status})`);
    }

    const blob = await res.blob();
    prefetchCache.set(key, blob);
    if (prefetchCache.size > 24) {
      const first = prefetchCache.keys().next().value;
      prefetchCache.delete(first);
    }
    return blob;
  }

  function prefetchNext() {
    const next = segments[index + 1];
    if (!next || engine() !== "elevenlabs") return;
    const key = cacheKey(next.text);
    if (prefetchCache.has(key)) return;
    synthesize(next.text, AbortSignal.timeout(30000)).catch(() => {});
  }

  async function playElevenLabsChunk() {
    if (!segments[index] || !textChunks[chunkIndex]) {
      textChunks = [];
      chunkIndex = 0;
      finishSegment();
      return;
    }

    abortCtrl?.abort();
    abortCtrl = new AbortController();
    releaseAudio();

    loading = true;
    updatePlayBtn();
    setStatus(
      textChunks.length > 1
        ? `Generating… ${chunkIndex + 1}/${textChunks.length}`
        : "Generating…"
    );
    const seg = segments[index];
    const activeCue = seg?.cues?.length ? Math.min(cueIndex, seg.cues.length - 1) : 0;
    highlightCue(index, activeCue);

    try {
      const blob = await synthesize(textChunks[chunkIndex], abortCtrl.signal);
      if (abortCtrl.signal.aborted) return;

      setupAudioElement(blob);

      audio.onended = () => {
        chunkIndex++;
        if (chunkIndex < textChunks.length) {
          playElevenLabsChunk();
          return;
        }
        textChunks = [];
        chunkIndex = 0;
        finishSegment();
      };

      audio.onerror = () => {
        speaking = false;
        loading = false;
        setStatus("Playback error — retrying…");
        updatePlayBtn();
        chunkIndex++;
        if (chunkIndex < textChunks.length) playElevenLabsChunk();
        else finishSegment();
      };

      audio.onstalled = () => {
        if (audio && !audio.paused) audio.play().catch(() => {});
      };

      await audio.play();
      speaking = true;
      paused = false;
      loading = false;
      requestWakeLock();
      if (chapterMeta) updateMediaSession(chapterMeta);
      setStatus("ElevenLabs");
      updatePlayBtn();
      prefetchNext();
    } catch (e) {
      if (e.name === "AbortError") return;
      loading = false;
      speaking = false;
      updatePlayBtn();
      console.error("ElevenLabs TTS:", e);
      if ("speechSynthesis" in window) {
        setStatus("ElevenLabs failed — device voice");
        speakBrowser();
      } else {
        setStatus("TTS error — check API / Netlify key");
      }
    }
  }

  function hostedSpeechFiles(entry) {
    return (entry?.segments || []).filter((s) => s.kind === "speech" && s.file);
  }

  function finishHostedChapter() {
    speaking = false;
    paused = false;
    loading = false;
    clearHostedSync();
    updatePlayBtn();
    if (continuousListen && onEndCallback) {
      setStatus("Next chapter…");
      onEndCallback();
      return;
    }
    setStatus("Hosted · paused");
  }

  async function playHostedChapterFile(entry) {
    chapterTimeline = null;
    hostedTimeline = null;
    releaseAudio();
    clearHostedSync();
    loading = true;
    updatePlayBtn();
    setStatus("Loading hosted audio…");

    const url = HostedAudio.audioUrl(entry.file);
    audio = new Audio(url);
    audio.preload = "auto";
    audio.playsInline = true;
    audio.setAttribute("playsinline", "");
    audio.playbackRate = getSettings().speechRate || 1;
    applyAudioVolume();
    const resolved = await HostedAudio.resolveTimeline(
      chapterMeta?.id,
      entry,
      segments
    );
    chapterTimeline = resolved.timeline;
    hostedTimeline = chapterTimeline;
    if (entry.duration && chapterTimeline) chapterTimeline.duration = entry.duration;

    audio.ontimeupdate = onFileTimeUpdate;

    audio.onended = () => finishHostedChapter();
    audio.onerror = () => {
      loading = false;
      speaking = false;
      setStatus("Hosted playback error");
      updatePlayBtn();
    };

    try {
      await audio.play();
      speaking = true;
      paused = false;
      loading = false;
      requestWakeLock();
      if (chapterMeta) updateMediaSession(chapterMeta);
      setStatus(resolved.timeline?.kind === "sidecar" ? "Hosted · synced" : "Hosted");
      updatePlayBtn();
      updatePlaybackUi();
      armSleepTimer();
    } catch (e) {
      loading = false;
      speaking = false;
      setStatus("Hosted audio blocked — tap play again");
      updatePlayBtn();
    }
  }

  async function playHostedSegmentFile(fileIdx) {
    const entry = hostedChapterEntry;
    const files = hostedSpeechFiles(entry);
    if (!files.length || fileIdx >= files.length) {
      finishHostedChapter();
      return;
    }

    const segIdx = Math.min(fileIdx, Math.max(0, segments.length - 1));
    index = segIdx;
    cueIndex = 0;
    highlightCue(segIdx, 0);

    releaseAudio();
    loading = true;
    updatePlayBtn();

    const url = HostedAudio.audioUrl(files[fileIdx].file);
    audio = new Audio(url);
    audio.preload = "auto";
    audio.playsInline = true;
    audio.setAttribute("playsinline", "");
    audio.playbackRate = getSettings().speechRate || 1;
    applyAudioVolume();
    chapterTimeline = null;

    audio.onended = () => {
      hostedFileIndex = fileIdx + 1;
      if (hostedFileIndex < files.length) {
        const delay = isAppleTouch() ? 100 : 40;
        setTimeout(() => playHostedSegmentFile(hostedFileIndex), delay);
        return;
      }
      finishHostedChapter();
    };

    audio.onerror = () => {
      loading = false;
      speaking = false;
      setStatus("Hosted segment error");
      updatePlayBtn();
    };

    try {
      await audio.play();
      speaking = true;
      paused = false;
      loading = false;
      requestWakeLock();
      if (chapterMeta) updateMediaSession(chapterMeta);
      setStatus(`Hosted · ${fileIdx + 1}/${files.length}`);
      updatePlayBtn();
    } catch (e) {
      loading = false;
      updatePlayBtn();
    }
  }

  async function speakHosted() {
    if (typeof HostedAudio === "undefined") {
      setStatus("Hosted audio unavailable");
      if ("speechSynthesis" in window) speakBrowser();
      return;
    }
    const entry = await HostedAudio.chapterEntry(chapterMeta?.id);
    if (!entry?.file && !hostedSpeechFiles(entry).length) {
      setStatus("No hosted file — run npm run piper:batch");
      if ("speechSynthesis" in window) speakBrowser();
      return;
    }
    hostedChapterEntry = entry;
    if (entry.mode === "segment" && hostedSpeechFiles(entry).length) {
      const files = hostedSpeechFiles(entry);
      if (typeof AudioTimeline !== "undefined") {
        chapterTimeline = AudioTimeline.fromSegmentDurations(files, segments);
        hostedTimeline = chapterTimeline;
      }
      hostedFileIndex = Math.min(index, files.length - 1);
      playHostedSegmentFile(hostedFileIndex);
      return;
    }
    if (entry.file) {
      playHostedChapterFile(entry);
      return;
    }
    setStatus("Invalid hosted manifest entry");
  }

  async function speakElevenLabs() {
    if (!segments[index]) return;
    if (!(await ensureElevenLabsVoice())) {
      setStatus("No ElevenLabs voice — add key or use Browser");
      if ("speechSynthesis" in window) speakBrowser();
      return;
    }

    const flat =
      typeof ListenScript !== "undefined"
        ? ListenScript.flattenSegmentText(segments[index])
        : segments[index].text;
    textChunks = splitTextChunks(
      ListenScript?.normalizeText?.(flat) || flat,
      chunkMaxLen()
    );
    chunkIndex = 0;
    if (!textChunks.length) {
      finishSegment();
      return;
    }
    playElevenLabsChunk();
  }

  function finishSegment() {
    if (segmentEnding) return;
    segmentEnding = true;
    releaseAudio();
    stopIosKeepAlive();

    if (index < segments.length - 1) {
      index++;
      cueIndex = 0;
      currentCue = null;
      textChunks = [];
      chunkIndex = 0;
      segmentEnding = false;
      const delay = isAppleTouch() ? 100 : 0;
      setTimeout(() => speakCurrent(), delay);
      return;
    }

    speaking = false;
    paused = false;
    loading = false;
    segmentEnding = false;
    updatePlayBtn();

    if (continuousListen && onEndCallback) {
      setStatus("Next chapter…");
      onEndCallback();
      return;
    }
    setStatus(engine() === "elevenlabs" ? "ElevenLabs · paused" : "");
  }

  async function speakCurrent() {
    if (engine() === "browser") {
      if (!("speechSynthesis" in window)) {
        setStatus("Device voice not supported in this browser");
        return;
      }
      speakBrowser();
      return;
    }
    if (engine() === "hosted") {
      await speakHosted();
      return;
    }
    if (await elevenLabsAvailable()) {
      speakElevenLabs();
      return;
    }
    if ("speechSynthesis" in window) {
      setStatus("ElevenLabs unavailable — using device voice");
      speakBrowser();
      return;
    }
    setStatus("Add ElevenLabs API key or use a browser with speech");
  }

  function play(fromIndex) {
    if (fromIndex != null) index = fromIndex;
    if (!segments.length) return;
    if (!supported()) {
      alert(
        "Listening is not available here. Try Chrome or Edge, or configure ElevenLabs in audio settings."
      );
      return;
    }
    showPanel();
    paused = false;
    armSleepTimer();
    speakCurrent();
  }

  function toggle() {
    if (!segments.length) return;

    if ((engine() === "elevenlabs" || engine() === "hosted") && audio) {
      if (!speaking && !loading) {
        play(index);
        return;
      }
      if (paused) {
        audio.play();
        paused = false;
      } else {
        audio.pause();
        paused = true;
      }
      updatePlayBtn();
      updateMediaSession(chapterMeta);
      updatePlaybackUi();
      return;
    }

    if (engine() === "browser") {
      if (!speaking) {
        play(index);
        return;
      }
      if (speechSynthesis.paused) {
        speechSynthesis.resume();
        paused = false;
      } else {
        speechSynthesis.pause();
        paused = true;
      }
      updatePlayBtn();
      return;
    }

    if (!speaking && !loading) play(index);
  }

  function prev() {
    if (index > 0) {
      index--;
      play(index);
    }
  }

  function next() {
    if (index < segments.length - 1) {
      index++;
      play(index);
    }
  }

  function findSegmentFromScroll() {
    const scroller = document.getElementById("chapter-scroll");
    if (scroller && document.body.classList.contains("layout-scroll")) {
      const mid = scroller.scrollTop + scroller.clientHeight * 0.3;
      let best = 0;
      let bestDist = Infinity;
      for (let i = 0; i < segments.length; i++) {
        const el = segments[i].el;
        if (!el?.isConnected) continue;
        const top = el.offsetTop;
        const dist = Math.abs(top - mid);
        if (dist < bestDist) {
          bestDist = dist;
          best = i;
        }
      }
      return best;
    }

    for (let i = 0; i < segments.length; i++) {
      const el = segments[i].el;
      if (!el?.isConnected) continue;
      const rect = el.getBoundingClientRect();
      if (rect.top >= 0 && rect.top < window.innerHeight * 0.5) return i;
    }
    const spread = BookPages?.getSpreadIndex?.() ?? 0;
    for (let i = 0; i < segments.length; i++) {
      if (BookPages.findSpreadForElement(segments[i].el) === spread) return i;
    }
    return 0;
  }

  function syncPresetUi() {
    const s = getSettings();
    const id =
      typeof ListenPresets !== "undefined"
        ? ListenPresets.matchesPreset(s.speechRate, s.listenPacing)
        : "standard";
    s.listenPreset = id;
    document.querySelectorAll(".tts-preset-btn").forEach((btn) => {
      const active = btn.dataset.preset === id;
      btn.classList.toggle("active", active);
      btn.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  function applyListenPreset(presetId) {
    if (typeof ListenPresets === "undefined") return;
    const s = getSettings();
    Object.assign(s, ListenPresets.apply(presetId, s));
    saveSettings();
    const rateEl = $("tts-rate");
    const rateVal = $("tts-rate-val");
    const pacingEl = $("tts-pacing");
    const pacingVal = $("tts-pacing-val");
    if (rateEl) rateEl.value = s.speechRate;
    if (rateVal) rateVal.textContent = `${(s.speechRate || 1).toFixed(1)}×`;
    if (pacingEl) pacingEl.value = s.listenPacing;
    if (pacingVal) pacingVal.textContent = `${(s.listenPacing ?? 1).toFixed(2)}×`;
    if (typeof ListenScript !== "undefined") {
      ListenScript.setPacingMultiplier(s.listenPacing ?? 1);
    }
    if (audio) audio.playbackRate = s.speechRate || 1;
    syncPresetUi();
    updateEngineHint();
  }

  function onEngineChange() {
    const sel = $("tts-engine");
    if (!sel) return;
    const s = getSettings();
    s.ttsEngine = sel.value;
    saveSettings();
    stop();
    prefetchCache.clear();
    resetElevenLabsReady();
    updateApiKeyVisibility();
    refreshVoiceList();
    updateEngineHint();
  }

  async function refreshVoiceList() {
    if (engine() === "browser") {
      populateBrowserVoices();
    } else {
      await fetchVoices();
    }
  }

  function bindControls() {
    $("tts-play")?.addEventListener("click", toggle);
    $("tts-stop")?.addEventListener("click", () => hidePanel());
    $("tts-prev")?.addEventListener("click", prev);
    $("tts-next")?.addEventListener("click", next);

    $("tts-continuous")?.addEventListener("change", (e) => {
      setContinuousListen(e.target.checked);
    });

    $("tts-director")?.addEventListener("change", (e) => {
      const s = getSettings();
      s.listenDirector = e.target.checked;
      saveSettings();
      updateEngineHint();
      if (typeof ListenScript !== "undefined") ListenScript.refreshVoiceCache();
    });

    const pacingEl = $("tts-pacing");
    const pacingVal = $("tts-pacing-val");
    if (pacingEl) {
      pacingEl.value = getSettings().listenPacing ?? 1;
      if (pacingVal) pacingVal.textContent = `${parseFloat(pacingEl.value).toFixed(2)}×`;
      pacingEl.addEventListener("input", (e) => {
        const v = parseFloat(e.target.value);
        const s = getSettings();
        s.listenPacing = v;
        s.listenPreset = "custom";
        saveSettings();
        if (pacingVal) pacingVal.textContent = `${v.toFixed(2)}×`;
        if (typeof ListenScript !== "undefined") ListenScript.setPacingMultiplier(v);
        syncPresetUi();
      });
    }

    document.querySelectorAll(".tts-preset-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        applyListenPreset(btn.dataset.preset);
      });
    });

    $("tts-rate")?.addEventListener("input", (e) => {
      const rate = parseFloat(e.target.value);
      $("tts-rate-val").textContent = `${rate.toFixed(1)}×`;
      const s = getSettings();
      s.speechRate = rate;
      s.listenPreset = "custom";
      saveSettings();
      if (audio) audio.playbackRate = rate;
      syncPresetUi();
    });

    $("tts-voice")?.addEventListener("change", (e) => {
      const s = getSettings();
      if (engine() === "browser") {
        s.speechVoice = e.target.value;
      } else {
        s.elevenLabsVoice = e.target.value;
      }
      saveSettings();
      prefetchCache.clear();
    });

    $("tts-engine")?.addEventListener("change", onEngineChange);

    $("tts-api-key")?.addEventListener("change", (e) => {
      const s = getSettings();
      s.elevenLabsApiKey = e.target.value.trim();
      saveSettings();
      resetElevenLabsReady();
      prefetchCache.clear();
      if (s.elevenLabsApiKey) fetchVoices();
      updateEngineHint();
    });

    $("tts-api-save")?.addEventListener("click", () => {
      const input = $("tts-api-key");
      if (!input) return;
      const s = getSettings();
      s.elevenLabsApiKey = input.value.trim();
      saveSettings();
      resetElevenLabsReady();
      prefetchCache.clear();
      updateApiKeyVisibility();
      fetchVoices();
      updateEngineHint();
      setStatus(s.elevenLabsApiKey ? "API key saved" : "");
    });

    $("tts-skip-back")?.addEventListener("click", () => skipSeconds(-15));
    $("tts-skip-fwd")?.addEventListener("click", () => skipSeconds(15));

    const scrub = $("tts-scrub");
    if (scrub) {
      scrub.addEventListener("pointerdown", () => {
        scrubbing = true;
      });
      scrub.addEventListener("input", (e) => {
        const ratio = parseInt(e.target.value, 10) / 1000;
        seekToRatio(ratio);
      });
      scrub.addEventListener("pointerup", () => {
        scrubbing = false;
      });
    }

    const vol = $("tts-volume");
    const volVal = $("tts-volume-val");
    if (vol) {
      vol.value = getSettings().audioVolume ?? 1;
      if (volVal) volVal.textContent = `${Math.round((vol.valueAsNumber || 1) * 100)}%`;
      vol.addEventListener("input", (e) => {
        const v = parseFloat(e.target.value);
        const s = getSettings();
        s.audioVolume = v;
        saveSettings();
        if (volVal) volVal.textContent = `${Math.round(v * 100)}%`;
        applyAudioVolume();
      });
    }

    const sleepSel = $("tts-sleep");
    if (sleepSel) {
      sleepSel.value = String(getSettings().listenSleepMin || 0);
      sleepSel.addEventListener("change", (e) => {
        const s = getSettings();
        s.listenSleepMin = parseInt(e.target.value, 10) || 0;
        saveSettings();
        armSleepTimer();
      });
    }

    if ("speechSynthesis" in window) {
      speechSynthesis.onvoiceschanged = () => {
        if (engine() === "browser") populateBrowserVoices();
      };
    }
  }

  async function bootstrapEngine() {
    await checkProxy();
    if (engine() === "browser") {
      populateBrowserVoices();
    } else {
      await refreshVoiceList();
      await ensureElevenLabsVoice();
    }
    updateEngineHint();
  }

  return {
    init(opts) {
      getSettings = opts.getSettings;
      saveSettings = opts.saveSettings;
      onPlayerVisibility = opts.onPlayerVisibility || onPlayerVisibility;
      onPrevChapter = opts.onPrevChapter || null;
      onNextChapter = opts.onNextChapter || null;
      onPrefetchChapter = opts.onPrefetchChapter || null;

      if (typeof AudioSession !== "undefined") {
        AudioSession.bind({
          play: () => toggle(),
          pause: () => toggle(),
          prevParagraph: () => prev(),
          nextParagraph: () => next(),
          prevChapter: () => onPrevChapter?.(),
          nextChapter: () => onNextChapter?.(),
          seek: (delta) => skipSeconds(delta),
          seekTo: (t) => {
            if (audio?.duration) {
              audio.currentTime = t;
              onFileTimeUpdate();
            }
          },
        });
      }

      bindControls();

      const s = getSettings();
      const eng = $("tts-engine");
      if (eng) eng.value = s.ttsEngine || "auto";

      const directorToggle = $("tts-director");
      if (directorToggle) directorToggle.checked = s.listenDirector !== false;

      const pacingEl = $("tts-pacing");
      const pacingVal = $("tts-pacing-val");
      if (pacingEl) {
        pacingEl.value = s.listenPacing ?? 1;
        if (pacingVal) pacingVal.textContent = `${(s.listenPacing ?? 1).toFixed(2)}×`;
      }
      if (typeof ListenScript !== "undefined") {
        ListenScript.setPacingMultiplier(s.listenPacing ?? 1);
      }

      if (typeof ListenPresets !== "undefined" && s.listenPreset && s.listenPreset !== "custom") {
        const p = ListenPresets.get(s.listenPreset);
        if (
          Math.abs((s.speechRate || 1) - p.speechRate) > 0.05 ||
          Math.abs((s.listenPacing ?? 1) - p.listenPacing) > 0.05
        ) {
          applyListenPreset(s.listenPreset);
        }
      }
      syncPresetUi();

      const keyInput = $("tts-api-key");
      if (keyInput && s.elevenLabsApiKey) {
        keyInput.value = s.elevenLabsApiKey;
      }

      bootstrapEngine();
      refreshHostedAvailability();
      updateContinuousUi();
    },

    supported,
    hidePanel,
    openPlayer,
    isPlayerOpen,

    onChapterLoaded(ch, bodyEl, autoPlay = false) {
      stop();
      prefetchCache.clear();
      index = 0;
      chapterTitle = ch.title;
      chapterMeta = ch;
      $("tts-chapter-title").textContent = ch.title;

      const count = prepareSegments(bodyEl, ch);
      updateMediaSession(ch);
      const listenBtn = $("listen-toggle");
      if (listenBtn) {
        listenBtn.disabled = count === 0;
        listenBtn.title = count ? "Listen (L)" : "No readable text";
      }

      if (chapterMeta?.id && onPrefetchChapter) {
        onPrefetchChapter(chapterMeta.id);
      }

      if (autoPlay && count > 0) play(0);
    },

    onChapterLeave() {
      stop();
      prefetchCache.clear();
      clearMediaSession();
      if (typeof ListenScript !== "undefined") {
        ListenScript.restoreChapterMarkup(document.getElementById("chapter-view"));
      }
    },

    startListening(fromScroll = true) {
      if (!segments.length) return;
      setPlayerOpen(true);
      index = fromScroll ? findSegmentFromScroll() : 0;
      play(index);
    },

    toggle,
    stop,

    setOnEnd(fn) {
      onEndCallback = fn;
    },

    setContinuousListen,
    isContinuousListen,
    setChapterAdvancing,
    consumeChapterAdvancing,

    isActive() {
      return speaking || loading || continuousListen;
    },
  };
})();

window.TTS = TTS;
