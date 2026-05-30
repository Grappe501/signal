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
  let iosKeepAlive = null;
  let segmentEnding = false;

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
    return proxyAvailable === true || !!getSettings().elevenLabsApiKey;
  }

  function engine() {
    return getSettings().ttsEngine || "browser";
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
      hint.textContent =
        "Using your device voice — free and instant. Choose ElevenLabs (Pro) for studio narration.";
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

  function prepareSegments(bodyEl) {
    const blocks = window.BookPages?.allBlocks?.().length
      ? window.BookPages.allBlocks()
      : Array.from(bodyEl.querySelectorAll("p, li, blockquote, h2, h3, h4, pre, table, .chapter-opener, .part-banner-inline"));

    segments = [];
    blocks.forEach((el) => {
      const text = el.textContent.replace(/\s+/g, " ").trim();
      if (text.length < 2) return;
      el.dataset.ttsIndex = segments.length;
      el.classList.add("tts-segment");
      segments.push({ el, text });
    });

    return segments.length;
  }

  function highlight(i) {
    document.querySelectorAll(".tts-active").forEach((el) => el.classList.remove("tts-active"));
    if (segments[i]?.el) {
      segments[i].el.classList.add("tts-active");
      if (document.body.classList.contains("layout-scroll")) {
        segments[i].el.scrollIntoView({
          block: "center",
          behavior: isAppleTouch() ? "auto" : "smooth",
        });
      } else if (window.BookPages) {
        BookPages.showSpreadContaining(segments[i].el);
      }
    }
    const seg = $("tts-segment");
    if (seg) seg.textContent = segments.length ? `${i + 1} / ${segments.length}` : "0 / 0";
    const fill = $("tts-progress-fill");
    if (fill && segments.length) {
      fill.style.width = `${((i + 1) / segments.length) * 100}%`;
    }
  }

  function setStatus(msg) {
    const el = $("tts-status");
    if (el) el.textContent = msg || "";
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

  function releaseAudio() {
    if (audio) {
      audio.onended = null;
      audio.onerror = null;
      audio.onstalled = null;
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
    return audio;
  }

  function stop(clearContinuous = true) {
    abortCtrl?.abort();
    abortCtrl = null;
    segmentEnding = false;
    textChunks = [];
    chunkIndex = 0;
    stopIosKeepAlive();
    if (engine() === "browser") speechSynthesis.cancel();
    releaseAudio();
    speaking = false;
    paused = false;
    loading = false;
    if (clearContinuous) continuousListen = false;
    setStatus("");
    document.querySelectorAll(".tts-active").forEach((el) => el.classList.remove("tts-active"));
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

  function speakBrowserChunk() {
    if (!segments[index] || !textChunks[chunkIndex]) {
      textChunks = [];
      chunkIndex = 0;
      finishSegment();
      return;
    }

    speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(textChunks[chunkIndex]);
    const settings = getSettings();
    utt.rate = settings.speechRate || 1;
    utt.pitch = 1;
    const voice = pickBrowserVoice(settings.speechVoice || $("tts-voice")?.value);
    if (voice) utt.voice = voice;

    utt.onstart = () => {
      speaking = true;
      paused = false;
      loading = false;
      updatePlayBtn();
      highlight(index);
      const tag = isAppleTouch() ? "Device voice · iPad" : "Device voice";
      setStatus(
        textChunks.length > 1
          ? `${tag} · ${chunkIndex + 1}/${textChunks.length}`
          : tag
      );
      startIosKeepAlive();
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
      finishSegment();
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
      finishSegment();
    };

    speechSynthesis.speak(utt);
  }

  function speakBrowser() {
    if (!segments[index]) return;
    textChunks = splitTextChunks(segments[index].text, chunkMaxLen());
    chunkIndex = 0;
    if (!textChunks.length) {
      finishSegment();
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
    highlight(index);

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

  async function speakElevenLabs() {
    if (!segments[index]) return;
    if (!(await ensureElevenLabsVoice())) {
      setStatus("No ElevenLabs voice — add key or use Browser");
      if ("speechSynthesis" in window) speakBrowser();
      return;
    }

    textChunks = splitTextChunks(segments[index].text, chunkMaxLen());
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
    speakCurrent();
  }

  function toggle() {
    if (!segments.length) return;

    if (engine() === "elevenlabs" && audio) {
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

    $("tts-rate")?.addEventListener("input", (e) => {
      const rate = parseFloat(e.target.value);
      $("tts-rate-val").textContent = `${rate.toFixed(1)}×`;
      const s = getSettings();
      s.speechRate = rate;
      saveSettings();
      if (audio) audio.playbackRate = rate;
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
      bindControls();

      const s = getSettings();
      const eng = $("tts-engine");
      if (eng) eng.value = s.ttsEngine || "browser";

      const keyInput = $("tts-api-key");
      if (keyInput && s.elevenLabsApiKey) {
        keyInput.value = s.elevenLabsApiKey;
      }

      bootstrapEngine();
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
      $("tts-chapter-title").textContent = ch.title;

      const count = prepareSegments(bodyEl);
      const listenBtn = $("listen-toggle");
      if (listenBtn) {
        listenBtn.disabled = count === 0;
        listenBtn.title = count ? "Listen (L)" : "No readable text";
      }

      if (autoPlay && count > 0) play(0);
    },

    onChapterLeave() {
      stop();
      prefetchCache.clear();
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
