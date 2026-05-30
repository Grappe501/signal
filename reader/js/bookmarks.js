/**
 * Bookmarks — save reading positions with optional paragraph anchors.
 */
const Bookmarks = (() => {
  let getSettings = () => ({ bookmarks: [] });
  let saveSettings = () => {};
  let onChange = () => {};

  function list() {
    return getSettings().bookmarks || [];
  }

  function persist(bookmarks) {
    const s = getSettings();
    s.bookmarks = bookmarks;
    saveSettings();
    onChange();
  }

  function chapterLabel(ch) {
    if (!ch) return "Chapter";
    return ch.num != null ? `Ch ${ch.num}: ${ch.title}` : ch.title;
  }

  function findAtPosition(chapterId, anchorId) {
    return list().findIndex(
      (b) => b.chapterId === chapterId && (b.anchorId || null) === (anchorId || null)
    );
  }

  function capturePosition(chapterId, ch) {
    const sc = document.getElementById("chapter-scroll");
    const anchorId =
      sc && document.body.classList.contains("layout-scroll")
        ? findTopAnchorIn(sc)
        : findSpreadAnchorId();
    const max = sc ? sc.scrollHeight - sc.clientHeight : 0;
    const scrollTop = sc?.scrollTop ?? 0;
    const ratio = max > 8 ? scrollTop / max : 0;
    const spread =
      typeof BookPages !== "undefined" ? BookPages.getSpreadIndex() : 0;

    return {
      id: `${chapterId}-${anchorId || spread}-${Date.now()}`,
      chapterId,
      title: chapterLabel(ch),
      anchorId: anchorId || null,
      scrollTop,
      ratio,
      spread: document.body.classList.contains("layout-spread") ? spread : null,
      createdAt: Date.now(),
    };
  }

  function findTopAnchorIn(sc) {
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

  function findSpreadAnchorId() {
    const spread = typeof BookPages !== "undefined" ? BookPages.getSpreadIndex() : 0;
    for (const sel of ["#page-left-inner", "#page-right-inner"]) {
      const root = document.querySelector(sel);
      if (!root) continue;
      for (const el of root.querySelectorAll("[data-read-id]")) {
        if (BookPages.findSpreadForElement(el) === spread) {
          return el.dataset.readId;
        }
      }
    }
    return null;
  }

  function toggle(chapterId, ch) {
    const pos = capturePosition(chapterId, ch);
    const idx = findAtPosition(pos.chapterId, pos.anchorId);
    const bookmarks = list();
    if (idx >= 0) {
      bookmarks.splice(idx, 1);
      persist(bookmarks);
      return false;
    }
    bookmarks.unshift(pos);
    if (bookmarks.length > 48) bookmarks.length = 48;
    persist(bookmarks);
    return true;
  }

  function remove(id) {
    persist(list().filter((b) => b.id !== id));
  }

  function isBookmarked(chapterId) {
    const sc = document.getElementById("chapter-scroll");
    const anchorId =
      sc && document.body.classList.contains("layout-scroll")
        ? findTopAnchorIn(sc)
        : findSpreadAnchorId();
    return findAtPosition(chapterId, anchorId) >= 0;
  }

  function goTo(bookmark) {
    sessionStorage.setItem("signal-restore-bookmark", JSON.stringify(bookmark));
    Routes.navigateToChapter(bookmark.chapterId);
  }

  function consumeRestore() {
    const raw = sessionStorage.getItem("signal-restore-bookmark");
    if (!raw) return null;
    sessionStorage.removeItem("signal-restore-bookmark");
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function renderList(container) {
    if (!container) return;
    const bookmarks = list();
    if (!bookmarks.length) {
      container.innerHTML = `<p class="bookmarks-empty">No bookmarks yet. Tap ★ while reading.</p>`;
      return;
    }
    container.innerHTML = bookmarks
      .map(
        (b) => `
      <li class="bookmark-item">
        <button type="button" class="bookmark-go" data-id="${b.id}">
          <span class="bookmark-title">${escapeHtml(b.title)}</span>
          <span class="bookmark-meta">${formatDate(b.createdAt)}</span>
        </button>
        <button type="button" class="bookmark-remove" data-remove="${b.id}" aria-label="Remove bookmark">×</button>
      </li>`
      )
      .join("");

    container.querySelectorAll(".bookmark-go").forEach((btn) => {
      btn.addEventListener("click", () => {
        const b = bookmarks.find((x) => x.id === btn.dataset.id);
        if (b) goTo(b);
      });
    });
    container.querySelectorAll(".bookmark-remove").forEach((btn) => {
      btn.addEventListener("click", () => remove(btn.dataset.remove));
    });
  }

  function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  }

  function formatDate(ts) {
    return new Date(ts).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  }

  function updateToolbarBtn(btn, chapterId) {
    if (!btn) return;
    const on = chapterId && isBookmarked(chapterId);
    btn.classList.toggle("active", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    btn.title = on ? "Remove bookmark (M)" : "Add bookmark (M)";
  }

  return {
    init(opts) {
      getSettings = opts.getSettings;
      saveSettings = opts.saveSettings;
      onChange = opts.onChange || onChange;
    },
    list,
    toggle,
    remove,
    goTo,
    consumeRestore,
    isBookmarked,
    renderList,
    updateToolbarBtn,
  };
})();

window.Bookmarks = Bookmarks;
