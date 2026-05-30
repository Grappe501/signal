/**
 * Text-to-speech — ElevenLabs (primary) + Web Speech API (fallback).
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
  let continuousListen = false;
  let chapterAdvancing = false;

  let audio = null;
  let audioUrl = null;
  let abortCtrl = null;
  let prefetchCache = new Map();
  let voices = [];
  let proxyAvailable = null;

  const $ = (id) => document.getElementById(id);

  function supported() {
    const s = getSettings();
    if (s.ttsEngine === "browser") return "speechSynthesis" in window;
    return true;
  }

  function engine() {
    return getSettings().ttsEngine || "elevenlabs";
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
      if (window.BookPages) BookPages.showSpreadContaining(segments[i].el);
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

  function showPanel() {
    document.body.classList.add("tts-active");
  }

  function hidePanel() {
    stop(true);
    document.body.classList.remove("tts-active");
    document.getElementById("listen-toggle")?.classList.remove("active");
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
      audio.pause();
      audio = null;
    }
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      audioUrl = null;
    }
  }

  function stop(clearContinuous = true) {
    abortCtrl?.abort();
    abortCtrl = null;
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

  function speakBrowser() {
    if (!segments[index]) return;
    speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(segments[index].text);
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
      setStatus("Browser voice");
    };

    utt.onend = () => onSegmentEnd();
    utt.onerror = () => {
      speaking = false;
      updatePlayBtn();
    };

    speechSynthesis.speak(utt);
  }

  // ── ElevenLabs engine ──

  async function checkProxy() {
    if (proxyAvailable != null) return proxyAvailable;
    try {
      const res = await fetch("/api/voices", { method: "GET" });
      proxyAvailable = res.ok;
    } catch {
      proxyAvailable = false;
    }
    updateApiKeyVisibility();
    return proxyAvailable;
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

  async function speakElevenLabs() {
    if (!segments[index]) return;

    abortCtrl?.abort();
    abortCtrl = new AbortController();
    releaseAudio();

    loading = true;
    updatePlayBtn();
    setStatus("Generating…");
    highlight(index);

    try {
      const blob = await synthesize(segments[index].text, abortCtrl.signal);
      if (abortCtrl.signal.aborted) return;

      audioUrl = URL.createObjectURL(blob);
      audio = new Audio(audioUrl);
      audio.playbackRate = getSettings().speechRate || 1;

      audio.onended = () => onSegmentEnd();
      audio.onerror = () => {
        speaking = false;
        loading = false;
        setStatus("Playback error");
        updatePlayBtn();
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
      setStatus("TTS error — check API key");
      console.error("ElevenLabs TTS:", e);
    }
  }

  function onSegmentEnd() {
    if (index < segments.length - 1) {
      index++;
      speakCurrent();
      return;
    }
    speaking = false;
    paused = false;
    loading = false;
    updatePlayBtn();
    if (continuousListen && onEndCallback) {
      setStatus("Next chapter…");
      onEndCallback();
      return;
    }
    setStatus("");
  }

  function speakCurrent() {
    if (engine() === "browser") {
      speakBrowser();
    } else {
      speakElevenLabs();
    }
  }

  function play(fromIndex) {
    if (engine() === "browser" && !("speechSynthesis" in window)) {
      alert("Browser TTS not supported here. Switch to ElevenLabs.");
      return;
    }
    if (fromIndex != null) index = fromIndex;
    if (!segments.length) return;
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
    updateApiKeyVisibility();
    refreshVoiceList();
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
    $("tts-stop")?.addEventListener("click", () => stop());
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
      proxyAvailable = null;
      prefetchCache.clear();
      if (s.elevenLabsApiKey) fetchVoices();
    });

    $("tts-api-save")?.addEventListener("click", () => {
      const input = $("tts-api-key");
      if (!input) return;
      const s = getSettings();
      s.elevenLabsApiKey = input.value.trim();
      saveSettings();
      proxyAvailable = null;
      prefetchCache.clear();
      updateApiKeyVisibility();
      fetchVoices();
      setStatus(s.elevenLabsApiKey ? "API key saved" : "");
    });

    if ("speechSynthesis" in window) {
      speechSynthesis.onvoiceschanged = () => {
        if (engine() === "browser") populateBrowserVoices();
      };
    }
  }

  return {
    init(opts) {
      getSettings = opts.getSettings;
      saveSettings = opts.saveSettings;
      bindControls();

      const s = getSettings();
      const eng = $("tts-engine");
      if (eng) eng.value = s.ttsEngine || "elevenlabs";

      const keyInput = $("tts-api-key");
      if (keyInput && s.elevenLabsApiKey) {
        keyInput.value = s.elevenLabsApiKey;
      }

      refreshVoiceList();
      updateContinuousUi();
    },

    supported,
    hidePanel,

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
