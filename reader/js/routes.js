/**
 * Chapter URLs — /read/ch-14 (shareable) with hash fallback for legacy links.
 */
const Routes = (() => {
  let onNavigate = () => {};

  function chapterPath(id) {
    if (!id) return "/";
    return `/read/${encodeURIComponent(id)}`;
  }

  function parseChapterId() {
    const path = location.pathname.replace(/\/+$/, "") || "/";
    const readMatch = path.match(/\/read\/([^/]+)$/);
    if (readMatch) return decodeURIComponent(readMatch[1]);

    const hash = location.hash.slice(1).replace(/^#/, "");
    if (hash) return hash;

    const q = new URLSearchParams(location.search).get("chapter");
    return q || null;
  }

  function navigateToChapter(id, { replace = false } = {}) {
    const path = chapterPath(id);
    const state = { chapterId: id || null };
    if (replace) history.replaceState(state, "", path);
    else history.pushState(state, "", path);
    onNavigate();
  }

  function navigateHome({ replace = false } = {}) {
    navigateToChapter(null, { replace });
  }

  /** On load: replace #ch-14 with /read/ch-14 */
  function migrateHashUrl() {
    const hash = location.hash.slice(1).replace(/^#/, "");
    if (!hash) return;
    if (location.pathname.match(/\/read\/[^/]+$/)) return;
    history.replaceState({ chapterId: hash }, "", chapterPath(hash));
  }

  function init({ onRoute }) {
    onNavigate = onRoute || onNavigate;
    migrateHashUrl();
    window.addEventListener("popstate", onNavigate);
  }

  function absoluteChapterUrl(id) {
    return `${location.origin}${chapterPath(id)}`;
  }

  return {
    init,
    parseChapterId,
    navigateToChapter,
    navigateHome,
    chapterPath,
    absoluteChapterUrl,
  };
})();

window.Routes = Routes;
