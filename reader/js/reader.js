const STORAGE_KEY = "signal-reader-v3.3";
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
      JSON.parse(localStorage.getItem("signal-reader-v3")) ||
      JSON.parse(localStorage.getItem("signal-reader-v2.1")) ||
      JSON.parse(localStorage.getItem("signal-reader-v2"));
    return migrateStoredSettings(saved);
  } catch {
    return defaults();
  }
}

function migrateStoredSettings(saved) {
  const out = { ...defaults(), ...saved };
  if (out.fontScale > 1.08) out.fontScale = 1.05;
  if (out.listenDirector === undefined) out.listenDirector = true;
  if (out.listenPacing == null) out.listenPacing = 1;
  if (!out.listenPreset) out.listenPreset = "standard";
  if (out.scrollPositions) {
    for (const key of Object.keys(out.scrollPositions)) {
      out.scrollPositions[key] = normalizeScrollPosition(out.scrollPositions[key]);
    }
  }
  if (out.pageSpreads) {
    for (const key of Object.keys(out.pageSpreads)) {
      out.pageSpreads[key] = normalizePageSpread(out.pageSpreads[key]);
    }
  }
  return out;
}

function normalizeScrollPosition(val) {
  if (val == null) return null;
  if (typeof val === "number") {
    return { scrollTop: val, ratio: null, anchorId: null };
  }
  return {
    scrollTop: val.scrollTop ?? 0,
    ratio: val.ratio ?? null,
    anchorId: val.anchorId || null,
  };
}

function normalizePageSpread(val) {
  if (val == null) return null;
  if (typeof val === "number") {
    return { spread: val, anchorId: null };
  }
  return { spread: val.spread ?? 0, anchorId: val.anchorId || null };
}

function hasResumePosition(pos) {
  const n = normalizeScrollPosition(pos);
  if (!n) return false;
  return n.scrollTop > 80 || (n.ratio != null && n.ratio > 0.02) || !!n.anchorId;
}

function defaults() {
  return {
    theme: "paper",
    fontScale: 1.05,
    focusMode: false,
    proseOnly: false,
    readingLayout: "scroll",
    readerMode: true,
    lastChapter: null,
    visited: [],
    scrollPositions: {},
    pageSpreads: {},
    speechRate: 1,
    speechVoice: "",
    ttsEngine: "browser",
    listenDirector: true,
    listenPacing: 1,
    listenPreset: "standard",
    elevenLabsVoice: "",
    elevenLabsModel: "eleven_turbo_v2_5",
    elevenLabsApiKey: "",
    typeface: "serif",
    lineHeight: 1.72,
    readWidth: 40,
    paragraphGap: 0.95,
    bookmarks: [],
  };
}

function isScrollLayout() {
  return settings.readingLayout !== "spread";
}

function isSpreadLayout() {
  return settings.readingLayout === "spread";
}

function isReaderMode() {
  return settings.readerMode !== false;
}

function saveSettings() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

function applySettings() {
  document.documentElement.dataset.theme = settings.theme;
  document.documentElement.style.setProperty("--font-scale", settings.fontScale);
  document.body.classList.toggle("focus-mode", settings.focusMode);
  document.body.classList.toggle("prose-only-mode", settings.proseOnly);
  document.body.classList.toggle("layout-scroll", isScrollLayout());
  document.body.classList.toggle("layout-spread", isSpreadLayout());
  document.body.classList.toggle("reader-mode", isReaderMode());
  $("#prose-only-toggle")?.classList.toggle("active", settings.proseOnly);
  const devTools = $("#dev-tools-sidebar");
  if (devTools) devTools.checked = !isReaderMode();
  const sidebarToggle = $("#prose-only-sidebar");
  if (sidebarToggle) sidebarToggle.checked = settings.proseOnly;
  const spreadSidebar = $("#layout-spread-sidebar");
  if (spreadSidebar) spreadSidebar.checked = isSpreadLayout();
  const layoutBtn = $("#layout-toggle");
  if (layoutBtn) {
    layoutBtn.textContent = isScrollLayout() ? "▤" : "▥";
    layoutBtn.classList.toggle("active", isSpreadLayout());
    layoutBtn.title = isScrollLayout()
      ? "Book spread layout (B)"
      : "Scroll layout (B)";
  }
  applyTypographySettings();
  syncReadPrefsUi();
  updateReadingNavLabels();
}

function updateReadingNavLabels() {
  const prevLabel = $("#reading-nav-prev-label");
  const nextLabel = $("#reading-nav-next-label");
  const prevBtn = $("#reading-nav-prev");
  const nextBtn = $("#reading-nav-next");
  if (!prevLabel || !nextLabel) return;

  if (isScrollLayout()) {
    prevLabel.textContent = "Previous chapter";
    nextLabel.textContent = "Next chapter";
    prevBtn?.setAttribute("title", "Previous chapter (K)");
    nextBtn?.setAttribute("title", "Next chapter (J)");
  } else {
    prevLabel.textContent = "Previous page";
    nextLabel.textContent = "Next page";
    prevBtn?.setAttribute("title", "Previous page (←)");
    nextBtn?.setAttribute("title", "Next page (→)");
  }
}

function applyTypographySettings() {
  const typeface = settings.typeface || "serif";
  document.documentElement.dataset.typeface = typeface;
  document.documentElement.style.setProperty(
    "--read-font-family",
    typeface === "sans" ? "var(--font-sans)" : "var(--font-serif)"
  );
  document.documentElement.style.setProperty(
    "--read-max-width",
    `${settings.readWidth || 40}rem`
  );
  document.documentElement.style.setProperty(
    "--page-line",
    String(settings.lineHeight || 1.72)
  );
  document.documentElement.style.setProperty(
    "--para-gap",
    `${settings.paragraphGap ?? 0.95}em`
  );
}

function syncReadPrefsUi() {
  const type = $("#pref-typeface");
  if (type) type.value = settings.typeface || "serif";

  const line = $("#pref-line");
  const lineVal = $("#pref-line-val");
  if (line) {
    line.value = settings.lineHeight || 1.72;
    if (lineVal) lineVal.textContent = Number(line.value).toFixed(2);
  }

  const width = $("#pref-width");
  const widthVal = $("#pref-width-val");
  if (width) {
    width.value = settings.readWidth || 40;
    if (widthVal) widthVal.textContent = `${width.value}rem`;
  }

  const gap = $("#pref-gap");
  const gapVal = $("#pref-gap-val");
  if (gap) {
    gap.value = settings.paragraphGap ?? 0.95;
    if (gapVal) gapVal.textContent = `${Number(gap.value).toFixed(2)}em`;
  }
}

function assignScrollAnchors(root, chapterId) {
  if (!root) return;
  let n = 0;
  root.querySelectorAll("p, li, blockquote").forEach((el) => {
    const text = el.textContent.replace(/\s+/g, " ").trim();
    if (text.length < 24) return;
    n += 1;
    el.dataset.readId = `${chapterId}-${n}`;
  });
}

function findTopAnchor(sc) {
  const markers = sc.querySelectorAll("[data-read-id]");
  const viewTop = sc.scrollTop + 32;
  let bestId = null;
  let bestTop = -1;
  markers.forEach((el) => {
    const top = el.offsetTop;
    if (top <= viewTop && top >= bestTop) {
      bestTop = top;
      bestId = el.dataset.readId;
    }
  });
  return bestId;
}

function bindReadPrefs() {
  const onTypoChange = () => {
    if (currentChapterId && isSpreadLayout()) {
      const ch = chapterIndex[currentChapterId];
      BookPages.repaginateFromVisible(ch.prose);
      savePageSpread();
    }
  };

  $("#pref-typeface")?.addEventListener("change", (e) => {
    settings.typeface = e.target.value;
    applyTypographySettings();
    saveSettings();
    onTypoChange();
  });

  $("#pref-line")?.addEventListener("input", (e) => {
    settings.lineHeight = parseFloat(e.target.value);
    $("#pref-line-val").textContent = settings.lineHeight.toFixed(2);
    applyTypographySettings();
    saveSettings();
    onTypoChange();
  });

  $("#pref-width")?.addEventListener("input", (e) => {
    settings.readWidth = parseInt(e.target.value, 10);
    $("#pref-width-val").textContent = `${settings.readWidth}rem`;
    applyTypographySettings();
    saveSettings();
    onTypoChange();
  });

  $("#pref-gap")?.addEventListener("input", (e) => {
    settings.paragraphGap = parseFloat(e.target.value);
    $("#pref-gap-val").textContent = `${settings.paragraphGap.toFixed(2)}em`;
    applyTypographySettings();
    saveSettings();
    onTypoChange();
  });
}

function onReadingNavPrev() {
  if (isScrollLayout()) navigateChapter("prev");
  else flipPage(-1);
}

function onReadingNavNext() {
  if (isScrollLayout()) navigateChapter("next");
  else flipPage(1);
}

function getScrollEl() {
  return $("#chapter-scroll");
}

function saveScrollPosition() {
  if (!currentChapterId || !isScrollLayout()) return;
  const sc = getScrollEl();
  if (!sc) return;
  const max = sc.scrollHeight - sc.clientHeight;
  const ratio = max > 8 ? sc.scrollTop / max : 0;
  if (!settings.scrollPositions) settings.scrollPositions = {};
  settings.scrollPositions[currentChapterId] = {
    scrollTop: sc.scrollTop,
    ratio,
    anchorId: findTopAnchor(sc),
  };
  saveSettings();
}

function saveReadingPosition() {
  if (isScrollLayout()) saveScrollPosition();
  else savePageSpread();
}

function restoreScrollPosition(id) {
  const sc = getScrollEl();
  if (!sc) return;

  const bookmark = Bookmarks?.consumeRestore?.();
  if (bookmark && bookmark.chapterId === id) {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (bookmark.anchorId) {
          const el = sc.querySelector(`[data-read-id="${bookmark.anchorId}"]`);
          if (el) {
            sc.scrollTop = Math.max(0, el.offsetTop - 16);
            updateScrollIndicator();
            return;
          }
        }
        const max = Math.max(0, sc.scrollHeight - sc.clientHeight);
        if (bookmark.ratio != null && max > 0) {
          sc.scrollTop = Math.round(bookmark.ratio * max);
        } else if (bookmark.scrollTop > 0) {
          sc.scrollTop = bookmark.scrollTop;
        }
        updateScrollIndicator();
      });
    });
    return;
  }

  const openEnd = sessionStorage.getItem("signal-open-scroll-end") === "1";
  if (openEnd) {
    sessionStorage.removeItem("signal-open-scroll-end");
    requestAnimationFrame(() => {
      sc.scrollTop = Math.max(0, sc.scrollHeight - sc.clientHeight);
      updateScrollIndicator();
    });
    return;
  }

  const saved = normalizeScrollPosition(settings.scrollPositions?.[id]);
  if (!saved) return;

  const apply = () => {
    const max = Math.max(0, sc.scrollHeight - sc.clientHeight);
    if (saved.anchorId) {
      const el = sc.querySelector(`[data-read-id="${saved.anchorId}"]`);
      if (el) {
        const top = Math.max(0, el.offsetTop - 16);
        sc.scrollTop = top;
        updateScrollIndicator();
        return;
      }
    }
    if (saved.ratio != null && max > 0) {
      sc.scrollTop = Math.round(saved.ratio * max);
    } else if (saved.scrollTop > 0) {
      sc.scrollTop = saved.scrollTop;
    }
    updateScrollIndicator();
  };

  requestAnimationFrame(() => requestAnimationFrame(apply));
}

function updateScrollIndicator() {
  const el = $("#reading-indicator");
  const sc = getScrollEl();
  if (!el || !sc || !isScrollLayout()) return;
  const max = sc.scrollHeight - sc.clientHeight;
  if (max <= 8) {
    el.textContent = "Short chapter";
    return;
  }
  const pct = Math.round((sc.scrollTop / max) * 100);
  el.textContent = `${pct}% through chapter`;
}

function getTtsBodyEl() {
  return isScrollLayout() ? $("#chapter-scroll-inner") : $("#page-left-inner");
}

function decorateChapterStaging(staging, ch, label) {
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
}

function mountScrollChapter(staging, ch) {
  const scroll = getScrollEl();
  const inner = $("#chapter-scroll-inner");
  if (!scroll || !inner) return;

  inner.className = ch.prose
    ? "chapter-scroll-inner page-inner is-prose"
    : "chapter-scroll-inner page-inner is-outline";
  inner.innerHTML = staging.innerHTML;
  staging.innerHTML = "";
  assignScrollAnchors(inner, ch.id);

  scroll.classList.remove("hidden");
  scroll.scrollTop = 0;
  restoreScrollPosition(ch.id);

  if (!scroll._scrollSaveBound) {
    scroll._scrollSaveBound = true;
    scroll.addEventListener(
      "scroll",
      () => {
        if (currentChapterId && isScrollLayout()) {
          updateScrollIndicator();
          if (!scroll._saveTimer) {
            scroll._saveTimer = setTimeout(() => {
              scroll._saveTimer = null;
              saveScrollPosition();
            }, 200);
          }
        }
      },
      { passive: true }
    );
  }
  updateScrollIndicator();
}

function mountSpreadChapter(staging, ch, id, openLastSpread, autoPlay) {
  const scroll = getScrollEl();
  scroll?.classList.add("hidden");

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      BookPages.paginate(staging, ch.prose);
      staging.innerHTML = "";

      const bookmark = Bookmarks?.consumeRestore?.();
      const savedSpread = normalizePageSpread(settings.pageSpreads?.[id]);
      let spread = savedSpread?.spread ?? 0;
      let anchorId = savedSpread?.anchorId || null;

      if (bookmark && bookmark.chapterId === id) {
        if (bookmark.spread != null) spread = bookmark.spread;
        if (bookmark.anchorId) anchorId = bookmark.anchorId;
      } else if (openLastSpread) {
        spread = BookPages.spreadCount() - 1;
      }

      BookPages.goToSpread(spread);
      if (anchorId) {
        const anchor = document.querySelector(`[data-read-id="${anchorId}"]`);
        if (anchor && window.BookPages) BookPages.showSpreadContaining(anchor);
      }
      updatePageIndicator(
        BookPages.getSpreadIndex(),
        BookPages.spreadCount(),
        BookPages.totalPages()
      );
      finishChapterMount(ch, autoPlay);
    });
  });
}

function syncTtsPlayerLayout() {
  const open = TTS.isPlayerOpen?.() ?? document.body.classList.contains("tts-player-open");
  document.body.classList.toggle("tts-player-open", open);
  const player = $("#tts-player");
  if (player) player.classList.toggle("hidden", !open);
}

function finishChapterMount(ch, autoPlay) {
  const bodyEl = getTtsBodyEl();
  const label = ch.num != null ? `Chapter ${ch.num}` : "Prologue";
  $("#tts-player-title").textContent = `${label} — ${ch.title}`;
  TTS.onChapterLoaded(ch, bodyEl, autoPlay);
  if (autoPlay) TTS.openPlayer();
  syncTtsPlayerLayout();
  $("#listen-toggle")?.classList.toggle("active", autoPlay || TTS.isContinuousListen());
  const nextNav = getNavChapter(ch, "next");
  if (nextNav) prefetchChapter(nextNav.id);
  updateChapterNavButtons(ch);
  updateReadingNavLabels();
  scheduleIdlePrefetch(ch);
  Bookmarks?.updateToolbarBtn?.($("#bookmark-toggle"), currentChapterId);
  renderBookmarksUi();
}

function updateChapterNavButtons(ch) {
  const prev = getNavChapter(ch, "prev");
  const next = getNavChapter(ch, "next");
  if (isScrollLayout()) {
    $("#reading-nav-prev")?.toggleAttribute("disabled", !prev);
    $("#reading-nav-next")?.toggleAttribute("disabled", !next);
  } else {
    const atStart = BookPages.getSpreadIndex() <= 0;
    const atEnd = BookPages.getSpreadIndex() >= BookPages.spreadCount() - 1;
    $("#reading-nav-prev")?.toggleAttribute("disabled", atStart && !prev);
    $("#reading-nav-next")?.toggleAttribute("disabled", atEnd && !next);
  }
}

function navigateChapter(direction) {
  const ch = currentChapterId ? chapterIndex[currentChapterId] : null;
  if (!ch) return;
  const target = getNavChapter(ch, direction);
  if (!target) return;
  if (direction === "prev") {
    if (isSpreadLayout()) {
      sessionStorage.setItem("signal-open-last-spread", "1");
    } else {
      sessionStorage.setItem("signal-open-scroll-end", "1");
    }
  }
  Routes.navigateToChapter(target.id);
}

function toggleReadingLayout() {
  saveReadingPosition();
  settings.readingLayout = isScrollLayout() ? "spread" : "scroll";
  applySettings();
  saveSettings();
  if (currentChapterId && !$("#chapter-view")?.classList.contains("hidden")) {
    showChapter(currentChapterId);
  }
}

function findSpreadAnchor() {
  const ids = [];
  $("#page-left-inner")
    ?.querySelectorAll("[data-read-id]")
    .forEach((el) => ids.push(el));
  $("#page-right-inner")
    ?.querySelectorAll("[data-read-id]")
    .forEach((el) => ids.push(el));
  if (!ids.length) return null;
  const spread = BookPages.getSpreadIndex();
  for (const el of ids) {
    if (BookPages.findSpreadForElement(el) === spread) {
      return el.dataset.readId;
    }
  }
  return ids[0]?.dataset.readId || null;
}

function savePageSpread() {
  if (!currentChapterId) return;
  if (!settings.pageSpreads) settings.pageSpreads = {};
  settings.pageSpreads[currentChapterId] = {
    spread: BookPages.getSpreadIndex(),
    anchorId: findSpreadAnchor(),
  };
  saveSettings();
}

function updatePageIndicator(spreadIdx, spreadTotal, pageTotal) {
  const el = $("#reading-indicator");
  if (!el || !isSpreadLayout()) return;
  const pps = window.innerWidth <= 900 ? 1 : 2;
  const pageNum = spreadIdx * pps + 1;
  const endPage = pps > 1 ? Math.min(pageNum + 1, pageTotal) : pageNum;
  el.textContent =
    pageTotal > 1
      ? `Page ${pageNum}${endPage > pageNum ? `–${endPage}` : ""} of ${pageTotal}`
      : "Page 1";
}

function flipPage(direction = 1) {
  if (!isSpreadLayout()) return;
  if (!$("#chapter-view")?.classList.contains("hidden")) {
    if (direction > 0) {
      if (BookPages.nextSpread()) {
        savePageSpread();
        const ch = currentChapterId ? chapterIndex[currentChapterId] : null;
        if (ch) updateChapterNavButtons(ch);
        return;
      }
      const ch = currentChapterId ? chapterIndex[currentChapterId] : null;
      const next = ch ? getNavChapter(ch, "next") : null;
      if (next) Routes.navigateToChapter(next.id);
    } else {
      if (BookPages.prevSpread()) {
        savePageSpread();
        const ch = currentChapterId ? chapterIndex[currentChapterId] : null;
        if (ch) updateChapterNavButtons(ch);
        return;
      }
      const ch = currentChapterId ? chapterIndex[currentChapterId] : null;
      const prev = ch ? getNavChapter(ch, "prev") : null;
      if (prev) {
        sessionStorage.setItem("signal-open-last-spread", "1");
        Routes.navigateToChapter(prev.id);
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

function scheduleIdlePrefetch(ch) {
  if (!ch || !window.ChapterPrefetch) return;
  ChapterPrefetch.aroundChapter(ch, getNavChapter);
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
  startSearchIndexBuild();
}

async function init() {
  applySettings();

  TTS.init({
    getSettings: () => settings,
    saveSettings,
    onPlayerVisibility: syncTtsPlayerLayout,
  });

  TouchNav.init({
    isScrollLayout,
    flipPage,
    navigateChapter,
    getScrollEl,
  });

  ChapterPrefetch.init({
    isCached: (id) => !!cache[id],
    loadChapter: (id) => {
      const ch = chapterIndex[id];
      if (!ch || cache[id]) return Promise.resolve();
      if (settings.proseOnly && !ch.prose) return Promise.resolve();
      return loadChapterMarkdown(ch);
    },
  });

  Bookmarks.init({
    getSettings: () => settings,
    saveSettings,
    onChange: renderBookmarksUi,
  });

  BookSearch.init({
    onReady: () => {
      const q = $("#book-search")?.value?.trim();
      if (q) onBookSearchInput(q);
    },
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
    Routes.navigateToChapter(next.id);
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
  renderBookmarksUi();
  startSearchIndexBuild();

  const first = settings.proseOnly ? firstProseChapter() : book.chapters[0];
  if (first) ChapterPrefetch.enqueue([first.id, getNavChapter(first, "next")?.id].filter(Boolean));
  BookPages.setOnSpreadChange((spreadIdx, spreadTotal, pageTotal) => {
    if (isSpreadLayout()) {
      updatePageIndicator(spreadIdx, spreadTotal, pageTotal);
      const ch = currentChapterId ? chapterIndex[currentChapterId] : null;
      if (ch) updateChapterNavButtons(ch);
    }
  });

  let resizeTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (
        currentChapterId &&
        isSpreadLayout() &&
        !$("#chapter-view").classList.contains("hidden")
      ) {
        const ch = chapterIndex[currentChapterId];
        BookPages.repaginateFromVisible(ch.prose);
        savePageSpread();
      }
    }, 200);
  });

  Routes.init({ onRoute: route });
  bindReadPrefs();
  route();

  window.addEventListener("keydown", onKey);
  window.addEventListener("beforeunload", saveReadingPosition);
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
      Routes.navigateToChapter(btn.dataset.id);
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
      a.href = Routes.chapterPath(ch.id);
      a.dataset.id = ch.id;
      a.addEventListener("click", (e) => {
        e.preventDefault();
        Routes.navigateToChapter(ch.id);
      });
      a.dataset.part = part.id;
      a.dataset.title = ch.title.toLowerCase();
      a.dataset.prose = ch.prose;

      const num = ch.num != null ? ch.num : "P";
      const dotClass =
        ch.phase === "v8" ? "prose" : ch.phase === "v6" ? "v6" : ch.phase === "v5" ? "v5" : "outline";
      const dotHtml = isReaderMode()
        ? ""
        : `<span class="dot ${dotClass}"></span>`;

      a.innerHTML = `<span class="num">${num}</span><span class="title">${ch.title}</span>${dotHtml}`;
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
    let midChapter = "";
    if (isScrollLayout()) {
      if (hasResumePosition(settings.scrollPositions?.[settings.lastChapter])) {
        midChapter = " · mid-chapter";
      }
    } else {
      const spread = normalizePageSpread(settings.pageSpreads?.[settings.lastChapter]);
      if (spread && (spread.spread > 0 || spread.anchorId)) {
        midChapter = " · mid-chapter";
      }
    }
    $("#continue-reading").textContent = `Continue · ${label}${midChapter}`;
    $("#continue-welcome").textContent = `Continue · ${label}${midChapter}`;
  }
}

function bindEvents() {
  $("#home-link").addEventListener("click", (e) => {
    e.preventDefault();
    saveReadingPosition();
    Routes.navigateHome();
  });

  $("#start-reading").addEventListener("click", () => {
    Routes.navigateToChapter(book.chapters[0].id);
  });

  $("#start-listen").addEventListener("click", () => {
    TTS.setContinuousListen(true);
    Routes.navigateToChapter(book.chapters[0].id);
    sessionStorage.setItem("signal-autoplay", "1");
  });

  $("#start-prose").addEventListener("click", () => {
    settings.proseOnly = true;
    applySettings();
    saveSettings();
    Routes.navigateToChapter(firstProseChapter().id);
  });

  const continueFn = () => {
    if (settings.lastChapter) Routes.navigateToChapter(settings.lastChapter);
  };
  $("#read-through").addEventListener("click", () => {
    Routes.navigateToChapter(
      (settings.proseOnly ? firstProseChapter() : book.chapters[0]).id
    );
    closeSidebar();
  });
  $("#continue-reading")?.addEventListener("click", continueFn);
  $("#continue-welcome")?.addEventListener("click", continueFn);

  $("#menu-toggle").addEventListener("click", toggleSidebar);
  $("#sidebar-backdrop").addEventListener("click", closeSidebar);
  $("#toc-search").addEventListener("input", (e) => filterToc(e.target.value));
  $("#book-search")?.addEventListener("input", (e) => onBookSearchInput(e.target.value));
  $("#bookmark-toggle")?.addEventListener("click", toggleBookmark);
  $("#share-toggle")?.addEventListener("click", async () => {
    if (!currentChapterId) return;
    const ch = chapterIndex[currentChapterId];
    const result = await Share.shareChapter(ch, book?.title || "The Second Self");
    const btn = $("#share-toggle");
    if (btn && result === "copied") {
      const prev = btn.title;
      btn.title = "Link copied!";
      setTimeout(() => {
        btn.title = prev || "Share chapter";
      }, 2000);
    }
  });

  $("#layout-toggle").addEventListener("click", toggleReadingLayout);
  $("#layout-spread-sidebar").addEventListener("change", (e) => {
    saveReadingPosition();
    settings.readingLayout = e.target.checked ? "spread" : "scroll";
    applySettings();
    saveSettings();
    if (currentChapterId && !$("#chapter-view")?.classList.contains("hidden")) {
      showChapter(currentChapterId);
    }
  });

  $("#dev-tools-sidebar")?.addEventListener("change", (e) => {
    settings.readerMode = !e.target.checked;
    applySettings();
    saveSettings();
    renderToc();
  });

  $("#prose-only-toggle").addEventListener("click", toggleProseOnly);
  $("#prose-only-sidebar").addEventListener("change", (e) => {
    settings.proseOnly = e.target.checked;
    applySettings();
    saveSettings();
    if (currentChapterId) {
      updateProgress(chapterIndex[currentChapterId]);
    }
    startSearchIndexBuild();
  });

  $("#font-down").addEventListener("click", () => {
    settings.fontScale = Math.max(0.9, +(settings.fontScale - 0.05).toFixed(2));
    applySettings();
    saveSettings();
    if (currentChapterId && isSpreadLayout()) {
      const ch = chapterIndex[currentChapterId];
      BookPages.repaginateFromVisible(ch.prose);
    }
  });

  $("#font-up").addEventListener("click", () => {
    settings.fontScale = Math.min(1.35, +(settings.fontScale + 0.05).toFixed(2));
    applySettings();
    saveSettings();
    if (currentChapterId && isSpreadLayout()) {
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

  $("#tts-player-settings")?.addEventListener("click", () => {
    $("#tts-settings-panel")?.classList.remove("hidden");
  });

  $("#reading-nav-prev").addEventListener("click", onReadingNavPrev);
  $("#reading-nav-next").addEventListener("click", onReadingNavNext);

  $("#listen-toggle").addEventListener("click", () => {
    if (TTS.isActive()) {
      TTS.toggle();
    } else {
      TTS.openPlayer();
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

function updateChapterUrlMeta(ch) {
  const canonical = $("#canonical-link");
  if (canonical) {
    canonical.href = ch ? Routes.absoluteChapterUrl(ch.id) : `${location.origin}/`;
  }
  Share?.updateChapterMeta?.(ch, book?.title || "The Second Self");
}

function renderBookmarksUi() {
  const list = $("#bookmarks-list");
  const count = $("#bookmarks-count");
  const bookmarks = Bookmarks?.list?.() || [];
  if (count) count.textContent = bookmarks.length ? `(${bookmarks.length})` : "";
  Bookmarks?.renderList?.(list);
}

function toggleBookmark() {
  if (!currentChapterId) return;
  const ch = chapterIndex[currentChapterId];
  Bookmarks.toggle(currentChapterId, ch);
  Bookmarks.updateToolbarBtn($("#bookmark-toggle"), currentChapterId);
  renderBookmarksUi();
}

function onBookSearchInput(query) {
  const resultsEl = $("#search-results");
  const status = $("#book-search-status");
  const q = query.trim();

  if (!q || q.length < 2) {
    document.body.classList.remove("search-results-open");
    resultsEl?.classList.add("hidden");
    if (status) status.textContent = "";
    filterToc($("#toc-search")?.value || "");
    return;
  }

  if (!BookSearch.isReady()) {
    if (status) {
      status.textContent = BookSearch.isBuilding()
        ? "Building search index…"
        : "Search index not ready";
    }
    return;
  }

  const hits = BookSearch.search(q);
  document.body.classList.add("search-results-open");
  resultsEl?.classList.remove("hidden");

  if (status) {
    status.textContent = hits.length
      ? `${hits.length} result${hits.length === 1 ? "" : "s"}`
      : "No matches";
  }

  if (!resultsEl) return;

  if (!hits.length) {
    resultsEl.innerHTML = `<p class="bookmarks-empty">No matches for “${escapeHtml(q)}”</p>`;
    return;
  }

  resultsEl.innerHTML = hits
    .map((h) => {
      const label = h.num != null ? `Ch ${h.num}: ${h.title}` : h.title;
      return `<button type="button" class="search-result" data-id="${h.id}">
        <strong>${escapeHtml(label)}</strong>
        <span>${escapeHtml(h.excerpt)}</span>
      </button>`;
    })
    .join("");

  resultsEl.querySelectorAll(".search-result").forEach((btn) => {
    btn.addEventListener("click", () => {
      $("#book-search").value = "";
      onBookSearchInput("");
      closeSidebar();
      Routes.navigateToChapter(btn.dataset.id);
    });
  });
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;");
}

function startSearchIndexBuild() {
  const status = $("#book-search-status");
  if (status) status.textContent = "Building search index…";

  const chapters = settings.proseOnly
    ? book.chapters.filter((c) => c.prose)
    : book.chapters;

  BookSearch.buildIndex(chapters, (ch) => loadChapterMarkdown(ch)).then(() => {
    if (status) {
      status.textContent = BookSearch.isReady()
        ? `Search ready · ${BookSearch.indexSize()} chapters`
        : "";
    }
  });
}

async function route() {
  const rawId = Routes.parseChapterId();
  const id = rawId && chapterIndex[rawId] ? rawId : null;

  if (!id) {
    saveReadingPosition();
    TTS.onChapterLeave();
    currentChapterId = null;
    if (rawId && chapterIndex) Routes.navigateHome({ replace: true });
    showWelcome();
    updateChapterUrlMeta(null);
    return;
  }
  await showChapter(id);
}

function showWelcome() {
  document.body.classList.remove("reading-mode");
  document.body.classList.remove("layout-scroll", "layout-spread");
  document.body.classList.remove("tts-player-open");
  $("#bottom-nav").classList.add("hidden");
  $("#tap-zones")?.classList.add("hidden");
  $("#tts-player")?.classList.add("hidden");
  getScrollEl()?.classList.add("hidden");
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
    saveReadingPosition();
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
  applySettings();
  $("#welcome").classList.add("hidden");
  $("#chapter-view").classList.remove("hidden");
  $("#bottom-nav").classList.remove("hidden");
  $("#tap-zones")?.classList.remove("hidden");

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
  if (badge) {
    badge.textContent = ch.prose ? ch.phaseLabel : "Outline preview";
    badge.className = `phase-badge dev-only ${ch.phase}`;
  }

  const partBanner = $("#part-banner");
  partBanner.classList.add("hidden");
  partBanner.innerHTML = "";

  BookPages.setPageClasses(ch.prose);
  const staging = $("#chapter-staging");
  staging.className = ch.prose ? "chapter-staging is-prose" : "chapter-staging is-outline";
  staging.innerHTML = "<p class='loading'>Loading…</p>";

  try {
    const md = await loadChapterMarkdown(ch);
    if (typeof marked === "undefined") {
      throw new Error("Markdown parser missing — run npm run vendor");
    }
    staging.innerHTML = marked.parse(md);
    decorateChapterStaging(staging, ch, label);
    assignScrollAnchors(staging, ch.id);

    if (isScrollLayout()) {
      mountScrollChapter(staging, ch);
      finishChapterMount(ch, autoPlay);
    } else {
      mountSpreadChapter(staging, ch, id, openLastSpread, autoPlay);
    }
  } catch (err) {
    staging.innerHTML = `<p class="error">Could not load this chapter. Run <code>npm run setup</code> to copy manuscript files.</p>`;
    if (isSpreadLayout()) BookPages.paginate(staging, false);
    else {
      const inner = $("#chapter-scroll-inner");
      if (inner) inner.innerHTML = staging.innerHTML;
      getScrollEl()?.classList.remove("hidden");
    }
    console.error(err);
  }

  document.title = `${ch.title} — ${book.title}`;
  history.replaceState({ chapterId: id }, "", Routes.chapterPath(id));
  updateChapterUrlMeta(ch);
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
    $("#tts-settings-panel")?.classList.add("hidden");
    if (TTS.isActive()) TTS.hidePanel();
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

  if ((e.key === "p" || e.key === "P") && !isReaderMode()) {
    toggleProseOnly();
    return;
  }

  if (e.key === "b" || e.key === "B") {
    toggleReadingLayout();
    return;
  }

  if (e.key === "l" || e.key === "L") {
    if (currentChapterId) {
      TTS.openPlayer();
      TTS.startListening(true, true);
      $("#listen-toggle")?.classList.add("active");
    }
    return;
  }

  if (e.key === "m" || e.key === "M") {
    if (currentChapterId) {
      e.preventDefault();
      toggleBookmark();
    }
    return;
  }

  if (!currentChapterId || !chapterIndex[currentChapterId]) return;
  const ch = chapterIndex[currentChapterId];

  const next = getNavChapter(ch, "next");
  const prev = getNavChapter(ch, "prev");

  if (isSpreadLayout()) {
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
  }

  if ((e.key === "j" || e.key === "J") && next) {
    e.preventDefault();
    Routes.navigateToChapter(next.id);
  }
  if ((e.key === "k" || e.key === "K") && prev) {
    e.preventDefault();
    navigateChapter("prev");
  }
}

init();
