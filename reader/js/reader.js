const STORAGE_KEY = "signal-reader-v3";
const THEMES = ["paper", "sepia", "dark"];

let book = null;
let chapterIndex = {};
let partIndex = {};
let cache = {};
let settings = loadSettings();
let currentChapterId = null;

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function loadSettings() {
  try {
    const saved =
      JSON.parse(localStorage.getItem(STORAGE_KEY)) ||
      JSON.parse(localStorage.getItem("signal-reader-v2.1")) ||
      JSON.parse(localStorage.getItem("signal-reader-v2"));
    return { ...defaults(), ...saved };
  } catch {
    return defaults();
  }
}

function defaults() {
  return {
    theme: "paper",
    fontScale: 1.12,
    focusMode: false,
    proseOnly: false,
    lastChapter: null,
    visited: [],
    scrollPositions: {},
    pageSpreads: {},
    speechRate: 1,
    speechVoice: "",
    ttsEngine: "elevenlabs",
    elevenLabsVoice: "",
    elevenLabsModel: "eleven_turbo_v2_5",
    elevenLabsApiKey: "",
  };
}

function saveSettings() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

function applySettings() {
  document.documentElement.dataset.theme = settings.theme;
  document.documentElement.style.setProperty("--font-scale", settings.fontScale);
  document.body.classList.toggle("focus-mode", settings.focusMode);
  document.body.classList.toggle("prose-only-mode", settings.proseOnly);
  $("#prose-only-toggle")?.classList.toggle("active", settings.proseOnly);
  const sidebarToggle = $("#prose-only-sidebar");
  if (sidebarToggle) sidebarToggle.checked = settings.proseOnly;
}

function savePageSpread() {
  if (!currentChapterId) return;
  if (!settings.pageSpreads) settings.pageSpreads = {};
  settings.pageSpreads[currentChapterId] = BookPages.getSpreadIndex();
  saveSettings();
}

function updatePageIndicator(spreadIdx, spreadTotal, pageTotal) {
  const el = $("#page-indicator");
  if (!el) return;
  const pps = window.innerWidth <= 900 ? 1 : 2;
  const pageNum = spreadIdx * pps + 1;
  const endPage = pps > 1 ? Math.min(pageNum + 1, pageTotal) : pageNum;
  el.textContent =
    pageTotal > 1
      ? `Page ${pageNum}${endPage > pageNum ? `–${endPage}` : ""} of ${pageTotal}`
      : "Page 1";
}

function flipPage(direction = 1) {
  if (!$("#chapter-view")?.classList.contains("hidden")) {
    if (direction > 0) {
      if (BookPages.nextSpread()) {
        savePageSpread();
        return;
      }
      const ch = currentChapterId ? chapterIndex[currentChapterId] : null;
      const next = ch ? getNavChapter(ch, "next") : null;
      if (next) location.hash = next.id;
    } else {
      if (BookPages.prevSpread()) {
        savePageSpread();
        return;
      }
      const ch = currentChapterId ? chapterIndex[currentChapterId] : null;
      const prev = ch ? getNavChapter(ch, "prev") : null;
      if (prev) {
        sessionStorage.setItem("signal-open-last-spread", "1");
        location.hash = prev.id;
      }
    }
  }
}

function getNavChapter(ch, direction) {
  if (!settings.proseOnly) {
    const id = direction === "next" ? ch.next : ch.prev;
    return id ? chapterIndex[id] : null;
  }
  let id = direction === "next" ? ch.next : ch.prev;
  while (id) {
    const candidate = chapterIndex[id];
    if (candidate.prose) return candidate;
    id = direction === "next" ? candidate.next : candidate.prev;
  }
  return null;
}

function firstProseChapter() {
  return book.chapters.find((c) => c.prose) || book.chapters[0];
}

function markVisited(id) {
  if (!settings.visited.includes(id)) {
    settings.visited.push(id);
    saveSettings();
  }
  updateTocVisited();
}

function updateTocVisited() {
  $$(".toc-link").forEach((a) => {
    a.classList.toggle("visited", settings.visited.includes(a.dataset.id));
  });
}

function updateProgress(ch) {
  const chapters = settings.proseOnly
    ? book.chapters.filter((c) => c.prose)
    : book.chapters;
  const idx = chapters.findIndex((c) => c.id === ch.id);
  const pct = idx >= 0 ? Math.round(((idx + 1) / chapters.length) * 100) : 0;
  $("#progress-fill").style.width = `${pct}%`;
  $("#progress-bar").setAttribute("aria-valuenow", pct);
}

function estimateReadTime(text, isProse) {
  const words = text.split(/\s+/).length;
  const wpm = isProse ? 220 : 350;
  const min = Math.max(1, Math.round(words / wpm));
  return min === 1 ? "~1 min read" : `~${min} min read`;
}

function extractSection(md, heading) {
  const re = new RegExp(`## ${heading}[\\s\\S]*?(?=\\n## |$)`, "i");
  const m = md.match(re);
  return m ? m[0].replace(/^##[^\n]*\n/, "").trim() : "";
}

function outlineToReader(ch, mapMd) {
  const objective = extractSection(mapMd, "Chapter objective");
  const ending =
    extractSection(mapMd, "Chapter ending \\(locked\\)") ||
    extractSection(mapMd, "Chapter ending");
  const overview = extractSection(mapMd, "Sequence overview");
  const authorLock = extractSection(mapMd, "Author lock");

  let body = `> **Development preview** — Full prose for this chapter has not been drafted yet.\n`;
  body += `> **Phase:** ${ch.phaseLabel} · **POV:** ${ch.pov}\n\n`;
  body += `Skim the beats below to follow the story arc.\n\n`;

  if (objective) body += `## What this chapter does\n\n${objective}\n\n`;
  if (authorLock) body += `## Author lock\n\n${authorLock}\n\n`;
  if (overview) body += `## Sequence overview\n\n${overview}\n\n`;

  const scenes = mapMd.split(/^### Scene/m).slice(1);
  if (scenes.length) {
    body += `## Scene beats\n\n`;
    for (const block of scenes) {
      const titleMatch = block.match(/^[^\n—]+—\s*([^\n]+)/);
      const title = titleMatch ? titleMatch[1].trim() : "Scene";
      const objMatch = block.match(/\*\*Scene objective \(story\):\*\*\s*([^\n]+)/);
      const charMatch = block.match(/\*\*Scene objective \(character\):\*\*\s*([^\n]+)/);
      const reveals = block.match(/\*\*Reveals:\*\*([\s\S]*?)(?=\n\*\*|$)/);
      body += `### ${title}\n\n`;
      if (objMatch) body += `${objMatch[1]}\n\n`;
      else if (charMatch) body += `${charMatch[1]}\n\n`;
      if (reveals) {
        body += reveals[1]
          .trim()
          .split("\n")
          .filter((l) => l.startsWith("-"))
          .join("\n");
        body += "\n\n";
      }
    }
  }

  if (ending) body += `## Chapter ending\n\n${ending}\n\n`;
  return body;
}

async function fetchMarkdown(path) {
  const paths = [
    path,
    path.replace(/^source\/Draft\//, "../Book_1_The_Second_Self/Draft/"),
    path.replace(/^source\/Outline\//, "../Book_1_The_Second_Self/Outline/"),
  ];
  for (const p of paths) {
    const res = await fetch(p);
    if (res.ok) return res.text();
  }
  return null;
}

async function loadChapterMarkdown(ch) {
  if (cache[ch.id]) return cache[ch.id];

  if (ch.file) {
    const res = await fetch(`content/${ch.file}`);
    if (res.ok) {
      const md = await res.text();
      cache[ch.id] = md;
      return md;
    }
  }

  const raw = await fetchMarkdown(ch.source);
  if (!raw) throw new Error(`Could not load ${ch.source}`);

  const md = ch.prose ? raw : outlineToReader(ch, raw);
  cache[ch.id] = md;
  return md;
}

function prefetchChapter(id) {
  if (!id || cache[id]) return;
  const ch = chapterIndex[id];
  if (!ch) return;
  if (settings.proseOnly && !ch.prose) {
    const next = getNavChapter(ch, "next");
    if (next) prefetchChapter(next.id);
    return;
  }
  loadChapterMarkdown(ch).catch(() => {});
}

function isFirstInPart(ch) {
  const partChapters = book.chapters.filter((c) => c.part === ch.part);
  return partChapters[0]?.id === ch.id;
}

function partLabel(partId) {
  return partIndex[partId]?.label || partId;
}

function toggleProseOnly() {
  settings.proseOnly = !settings.proseOnly;
  applySettings();
  saveSettings();
  if (currentChapterId) {
    updateProgress(chapterIndex[currentChapterId]);
  }
}

async function init() {
  applySettings();

  TTS.init({
    getSettings: () => settings,
    saveSettings,
  });

  TTS.setOnEnd(() => {
    if (!TTS.isContinuousListen()) return;
    const ch = currentChapterId ? chapterIndex[currentChapterId] : null;
    if (!ch) return;
    const next = getNavChapter(ch, "next");
    if (!next) {
      TTS.setContinuousListen(false);
      return;
    }
    TTS.setChapterAdvancing(true);
    prefetchChapter(next.id);
    location.hash = next.id;
  });

  const res = await fetch("book.json");
  book = await res.json();
  book.chapters.forEach((ch) => {
    chapterIndex[ch.id] = ch;
  });
  book.parts.forEach((p) => {
    partIndex[p.id] = p;
  });

  renderStats();
  renderPartMap();
  renderToc();
  updateContinueButtons();
  bindEvents();
  BookPages.setOnSpreadChange((spreadIdx, spreadTotal, pageTotal) => {
    updatePageIndicator(spreadIdx, spreadTotal, pageTotal);
  });

  let resizeTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (currentChapterId && !$("#chapter-view").classList.contains("hidden")) {
        const ch = chapterIndex[currentChapterId];
        BookPages.repaginateFromVisible(ch.prose);
        savePageSpread();
      }
    }, 200);
  });

  route();

  window.addEventListener("hashchange", route);
  window.addEventListener("keydown", onKey);
  window.addEventListener("beforeunload", savePageSpread);
}

function renderStats() {
  const prose = book.chapters.filter((c) => c.prose).length;
  const visited = settings.visited.length;
  $("#stats").innerHTML = `
    <div><strong>${book.chapters.length}</strong><span>chapters</span></div>
    <div><strong>${prose}</strong><span>prose</span></div>
    <div><strong>${visited}</strong><span>visited</span></div>
  `;
}

function renderPartMap() {
  const el = $("#part-map");
  el.innerHTML = book.parts
    .filter((p) => p.id !== "prologue")
    .map((p) => {
      const chapters = book.chapters.filter((c) => c.part === p.id);
      const first = chapters.find((c) => c.prose) || chapters[0];
      if (!first) return "";
      const prose = chapters.filter((c) => c.prose).length;
      return `<button class="part-map-item" data-id="${first.id}">
        <strong>${p.label.replace(/^Part [IVX]+ — /, "")}</strong>
        <span>${chapters.length} ch · ${prose} prose</span>
      </button>`;
    })
    .join("");

  el.querySelectorAll(".part-map-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      location.hash = btn.dataset.id;
    });
  });
}

function renderToc() {
  const toc = $("#toc");
  toc.innerHTML = "";

  const groups = {};
  for (const ch of book.chapters) {
    if (!groups[ch.part]) groups[ch.part] = [];
    groups[ch.part].push(ch);
  }

  for (const part of book.parts) {
    const chapters = groups[part.id];
    if (!chapters?.length) continue;

    const heading = document.createElement("div");
    heading.className = "toc-part";
    heading.dataset.part = part.id;
    heading.textContent = part.label;
    toc.appendChild(heading);

    for (const ch of chapters) {
      const a = document.createElement("a");
      a.className = "toc-link";
      a.href = `#${ch.id}`;
      a.dataset.id = ch.id;
      a.dataset.part = part.id;
      a.dataset.title = ch.title.toLowerCase();
      a.dataset.prose = ch.prose;

      const num = ch.num != null ? ch.num : "P";
      const dotClass =
        ch.phase === "v8" ? "prose" : ch.phase === "v6" ? "v6" : ch.phase === "v5" ? "v5" : "outline";

      a.innerHTML = `<span class="num">${num}</span><span class="title">${ch.title}</span><span class="dot ${dotClass}"></span>`;
      if (settings.visited.includes(ch.id)) a.classList.add("visited");
      toc.appendChild(a);
    }
  }
}

function filterToc(query) {
  const q = query.trim().toLowerCase();
  const links = $$(".toc-link");
  const parts = $$(".toc-part");

  if (!q) {
    links.forEach((a) => a.classList.remove("hidden-by-search"));
    parts.forEach((p) => p.classList.remove("hidden-by-search"));
    return;
  }

  const visibleParts = new Set();
  links.forEach((a) => {
    const match =
      a.dataset.title.includes(q) ||
      a.dataset.id.includes(q) ||
      a.querySelector(".num")?.textContent === q;
    a.classList.toggle("hidden-by-search", !match);
    if (match) visibleParts.add(a.dataset.part);
  });

  parts.forEach((p) => {
    p.classList.toggle("hidden-by-search", !visibleParts.has(p.dataset.part));
  });
}

function updateContinueButtons() {
  const hasLast = settings.lastChapter && chapterIndex[settings.lastChapter];
  $("#continue-reading")?.classList.toggle("hidden", !hasLast);
  $("#continue-welcome")?.classList.toggle("hidden", !hasLast);

  if (hasLast) {
    const ch = chapterIndex[settings.lastChapter];
    const label = ch.num != null ? `Ch ${ch.num}: ${ch.title}` : ch.title;
    const spread = settings.pageSpreads?.[settings.lastChapter];
    const midChapter = spread && spread > 0 ? " · mid-chapter" : "";
    $("#continue-reading").textContent = `Continue · ${label}${midChapter}`;
    $("#continue-welcome").textContent = `Continue · ${label}${midChapter}`;
  }
}

function bindEvents() {
  $("#home-link").addEventListener("click", (e) => {
    e.preventDefault();
    savePageSpread();
    location.hash = "";
  });

  $("#start-reading").addEventListener("click", () => {
    location.hash = book.chapters[0].id;
  });

  $("#start-listen").addEventListener("click", () => {
    TTS.setContinuousListen(true);
    location.hash = book.chapters[0].id;
    sessionStorage.setItem("signal-autoplay", "1");
  });

  $("#start-prose").addEventListener("click", () => {
    settings.proseOnly = true;
    applySettings();
    saveSettings();
    location.hash = firstProseChapter().id;
  });

  const continueFn = () => {
    if (settings.lastChapter) location.hash = settings.lastChapter;
  };
  $("#read-through").addEventListener("click", () => {
    location.hash = (settings.proseOnly ? firstProseChapter() : book.chapters[0]).id;
    closeSidebar();
  });
  $("#continue-reading")?.addEventListener("click", continueFn);
  $("#continue-welcome")?.addEventListener("click", continueFn);

  $("#menu-toggle").addEventListener("click", toggleSidebar);
  $("#sidebar-backdrop").addEventListener("click", closeSidebar);
  $("#toc-search").addEventListener("input", (e) => filterToc(e.target.value));

  $("#prose-only-toggle").addEventListener("click", toggleProseOnly);
  $("#prose-only-sidebar").addEventListener("change", (e) => {
    settings.proseOnly = e.target.checked;
    applySettings();
    saveSettings();
    if (currentChapterId) {
      updateProgress(chapterIndex[currentChapterId]);
    }
  });

  $("#font-down").addEventListener("click", () => {
    settings.fontScale = Math.max(0.9, +(settings.fontScale - 0.05).toFixed(2));
    applySettings();
    saveSettings();
    if (currentChapterId) {
      const ch = chapterIndex[currentChapterId];
      BookPages.repaginateFromVisible(ch.prose);
    }
  });

  $("#font-up").addEventListener("click", () => {
    settings.fontScale = Math.min(1.35, +(settings.fontScale + 0.05).toFixed(2));
    applySettings();
    saveSettings();
    if (currentChapterId) {
      const ch = chapterIndex[currentChapterId];
      BookPages.repaginateFromVisible(ch.prose);
    }
  });

  $("#theme-toggle").addEventListener("click", () => {
    const idx = THEMES.indexOf(settings.theme);
    settings.theme = THEMES[(idx + 1) % THEMES.length];
    applySettings();
    saveSettings();
  });

  $("#focus-toggle").addEventListener("click", toggleFocus);

  $("#audio-settings-toggle").addEventListener("click", () => {
    $("#tts-settings-panel").classList.toggle("hidden");
  });
  $("#tts-settings-close").addEventListener("click", () => {
    $("#tts-settings-panel").classList.add("hidden");
  });

  $("#page-prev").addEventListener("click", () => flipPage(-1));
  $("#page-next").addEventListener("click", () => flipPage(1));
  $("#page-flip").addEventListener("click", () => flipPage(1));

  $("#listen-toggle").addEventListener("click", () => {
    if (TTS.isActive()) {
      TTS.toggle();
    } else {
      TTS.startListening(true, true);
    }
    $("#listen-toggle").classList.toggle("active", TTS.isActive() || TTS.isContinuousListen());
  });

  const rateEl = document.getElementById("tts-rate");
  const rateVal = document.getElementById("tts-rate-val");
  if (rateEl) {
    rateEl.value = settings.speechRate || 1;
    if (rateVal) rateVal.textContent = `${(settings.speechRate || 1).toFixed(1)}×`;
  }

  $("#shortcuts-close").addEventListener("click", () => {
    $("#shortcuts").classList.add("hidden");
  });
  $("#shortcuts").addEventListener("click", (e) => {
    if (e.target === $("#shortcuts")) $("#shortcuts").classList.add("hidden");
  });
}

function toggleSidebar() {
  const open = $("#sidebar").classList.toggle("open");
  $("#sidebar-backdrop").classList.toggle("visible", open);
}

function closeSidebar() {
  $("#sidebar").classList.remove("open");
  $("#sidebar-backdrop").classList.remove("visible");
}

function toggleFocus() {
  settings.focusMode = !settings.focusMode;
  document.body.classList.toggle("focus-mode", settings.focusMode);
  saveSettings();
}

async function route() {
  const id = location.hash.slice(1);
  if (!id || !chapterIndex[id]) {
    savePageSpread();
    TTS.onChapterLeave();
    currentChapterId = null;
    showWelcome();
    return;
  }
  await showChapter(id);
}

function showWelcome() {
  document.body.classList.remove("reading-mode");
  $("#bottom-nav").classList.add("hidden");
  $("#welcome").classList.remove("hidden");
  $("#chapter-view").classList.add("hidden");
  BookPages.reset();
  $("#toolbar-title").textContent = "";
  $("#toolbar-title").classList.remove("visible");
  const total = settings.proseOnly
    ? book.chapters.filter((c) => c.prose).length
    : book.chapters.length;
  const visitedInMode = settings.visited.filter((id) => {
    const ch = chapterIndex[id];
    return ch && (!settings.proseOnly || ch.prose);
  }).length;
  $("#progress-fill").style.width = visitedInMode
    ? `${Math.round((visitedInMode / total) * 100)}%`
    : "0%";
  document.title = `${book.title} — Reader`;
  $$(".toc-link").forEach((a) => a.classList.remove("active"));
  updateContinueButtons();
  renderStats();
}

async function showChapter(id) {
  if (currentChapterId && currentChapterId !== id) {
    savePageSpread();
    if (!TTS.consumeChapterAdvancing()) {
      TTS.onChapterLeave();
      TTS.setContinuousListen(false);
    }
  }

  const ch = chapterIndex[id];
  currentChapterId = id;
  const autoPlay = sessionStorage.getItem("signal-autoplay") === "1";
  if (autoPlay) sessionStorage.removeItem("signal-autoplay");
  const openLastSpread = sessionStorage.getItem("signal-open-last-spread") === "1";
  if (openLastSpread) sessionStorage.removeItem("signal-open-last-spread");

  document.body.classList.add("reading-mode");
  $("#welcome").classList.add("hidden");
  $("#chapter-view").classList.remove("hidden");
  $("#bottom-nav").classList.remove("hidden");

  settings.lastChapter = id;
  markVisited(id);
  saveSettings();
  updateContinueButtons();
  renderStats();
  updateProgress(ch);

  const label = ch.num != null ? `Chapter ${ch.num}` : "Prologue";
  $("#toolbar-title").textContent = `${label} — ${ch.title}`;
  $("#toolbar-title").classList.add("visible");
  $("#tts-chapter-title").textContent = `${label} — ${ch.title}`;

  const badge = $("#phase-badge");
  badge.textContent = ch.prose ? ch.phaseLabel : "Outline preview";
  badge.className = `phase-badge ${ch.phase}`;

  const partBanner = $("#part-banner");
  partBanner.classList.add("hidden");
  partBanner.innerHTML = "";

  BookPages.setPageClasses(ch.prose);
  const staging = $("#chapter-staging");
  staging.className = ch.prose ? "chapter-staging is-prose" : "chapter-staging is-outline";
  staging.innerHTML = "<p class='loading'>Loading…</p>";

  try {
    const md = await loadChapterMarkdown(ch);
    staging.innerHTML = marked.parse(md);

    const opener = document.createElement("div");
    opener.className = "chapter-opener";
    opener.innerHTML = `
      <p class="chapter-meta">${label} · ${ch.pov}</p>
      <h2>${ch.title}</h2>
    `;
    staging.insertBefore(opener, staging.firstChild);

    if (isFirstInPart(ch) && ch.part !== "prologue") {
      const banner = document.createElement("div");
      banner.className = "part-banner-inline";
      banner.innerHTML = `
        <p class="part-banner-kicker">${partLabel(ch.part).split(" — ")[0]}</p>
        <h3>${partLabel(ch.part).split(" — ").slice(1).join(" — ") || partLabel(ch.part)}</h3>
      `;
      staging.insertBefore(banner, staging.firstChild);
    } else if (ch.id === "prologue") {
      const banner = document.createElement("div");
      banner.className = "part-banner-inline";
      banner.innerHTML = `<p class="part-banner-kicker">The Signal Cycle · Book 1</p><h3>Prologue</h3>`;
      staging.insertBefore(banner, staging.firstChild);
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        BookPages.paginate(staging, ch.prose);
        TTS.onChapterLoaded(ch, $("#page-left-inner"), autoPlay);

        let spread = settings.pageSpreads?.[id] ?? 0;
        if (openLastSpread) spread = BookPages.spreadCount() - 1;
        BookPages.goToSpread(spread);
        updatePageIndicator(
          BookPages.getSpreadIndex(),
          BookPages.spreadCount(),
          BookPages.totalPages()
        );

        $("#listen-toggle")?.classList.toggle("active", autoPlay || TTS.isContinuousListen());
        const nextNav = getNavChapter(ch, "next");
        if (nextNav) prefetchChapter(nextNav.id);
      });
    });
  } catch (err) {
    staging.innerHTML = `<p class="error">Could not load this chapter. Run <code>npm run setup</code> to copy manuscript files.</p>`;
    BookPages.paginate(staging, false);
    console.error(err);
  }

  document.title = `${ch.title} — ${book.title}`;
  $$(".toc-link").forEach((a) => {
    a.classList.toggle("active", a.dataset.id === id);
    if (a.dataset.id === id) a.scrollIntoView({ block: "nearest" });
  });

  closeSidebar();
}

function onKey(e) {
  if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;

  if ((e.metaKey || e.ctrlKey) && e.key === "p") return;

  if (e.key === " " && TTS.isActive()) {
    e.preventDefault();
    TTS.toggle();
    return;
  }

  if (e.key === "?" && !e.shiftKey) {
    e.preventDefault();
    $("#shortcuts").classList.toggle("hidden");
    return;
  }

  if (e.key === "Escape") {
    $("#shortcuts").classList.add("hidden");
    closeSidebar();
    return;
  }

  if (e.key === "t" || e.key === "T") {
    toggleSidebar();
    return;
  }

  if (e.key === "f" || e.key === "F") {
    toggleFocus();
    return;
  }

  if (e.key === "p" || e.key === "P") {
    toggleProseOnly();
    return;
  }

  if (e.key === "l" || e.key === "L") {
    if (currentChapterId) {
      TTS.startListening(true, true);
      $("#listen-toggle")?.classList.add("active");
    }
    return;
  }

  const id = location.hash.slice(1);
  if (!id || !chapterIndex[id]) return;
  const ch = chapterIndex[id];

  const next = getNavChapter(ch, "next");
  const prev = getNavChapter(ch, "prev");

  if (e.key === "ArrowRight" || e.key === "PageDown") {
    e.preventDefault();
    flipPage(1);
    return;
  }
  if (e.key === "ArrowLeft" || e.key === "PageUp") {
    e.preventDefault();
    flipPage(-1);
    return;
  }

  if ((e.key === "j" || e.key === "J") && next) {
    e.preventDefault();
    location.hash = next.id;
  }
  if ((e.key === "k" || e.key === "K") && prev) {
    e.preventDefault();
    sessionStorage.setItem("signal-open-last-spread", "1");
    location.hash = prev.id;
  }
}

init();
