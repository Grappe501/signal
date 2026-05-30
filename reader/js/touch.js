/**
 * Touch navigation — edge taps and horizontal swipes.
 * Scroll: tap/swipe navigates pages within chapter; at ends, changes chapter.
 * Spread: tap/swipe turns pages (chapter at spread ends via flipPage).
 */
const TouchNav = (() => {
  const $ = (sel) => document.querySelector(sel);
  const SWIPE_MIN = 48;
  const SWIPE_MAX_VERTICAL = 80;
  const TAP_EDGE = 0.2;
  const SCROLL_END_THRESHOLD = 32;

  let getSettings = () => ({});
  let isScrollLayout = () => true;
  let flipPage = () => {};
  let navigateChapter = () => {};
  let getScrollEl = () => null;

  let startX = 0;
  let startY = 0;
  let tracking = false;

  function readingSurface() {
    if (isScrollLayout()) return getScrollEl();
    return document.querySelector(".book-stage");
  }

  function scrollAtStart(sc) {
    return sc.scrollTop <= SCROLL_END_THRESHOLD;
  }

  function scrollAtEnd(sc) {
    return sc.scrollTop + sc.clientHeight >= sc.scrollHeight - SCROLL_END_THRESHOLD;
  }

  function scrollByPage(sc, direction) {
    const delta = sc.clientHeight * 0.88 * direction;
    sc.scrollBy({ top: delta, behavior: "smooth" });
  }

  function navBack() {
    if (isScrollLayout()) {
      const sc = getScrollEl();
      if (!sc) return;
      if (scrollAtStart(sc)) navigateChapter("prev");
      else scrollByPage(sc, -1);
    } else {
      flipPage(-1);
    }
  }

  function navForward() {
    if (isScrollLayout()) {
      const sc = getScrollEl();
      if (!sc) return;
      if (scrollAtEnd(sc)) navigateChapter("next");
      else scrollByPage(sc, 1);
    } else {
      flipPage(1);
    }
  }

  function handleTap(clientX) {
    if (isScrollLayout()) return;

    const surface = readingSurface();
    if (!surface || surface.classList.contains("hidden")) return;

    const rect = surface.getBoundingClientRect();
    if (rect.width < 40) return;

    const ratio = (clientX - rect.left) / rect.width;
    if (ratio < TAP_EDGE) navBack();
    else if (ratio > 1 - TAP_EDGE) navForward();
  }

  function onTouchStart(e) {
    if (!$("#chapter-view")?.classList.contains("hidden")) {
      const t = e.touches[0];
      startX = t.clientX;
      startY = t.clientY;
      tracking = true;
    }
  }

  function onTouchEnd(e) {
    if (!tracking) return;
    tracking = false;
    const t = e.changedTouches[0];
    const dx = t.clientX - startX;
    const dy = t.clientY - startY;

    if (isScrollLayout()) {
      if (Math.abs(dx) < SWIPE_MIN || Math.abs(dx) <= Math.abs(dy) * 1.25) return;
      const sc = getScrollEl();
      if (!sc) return;
      if (dx < 0 && !scrollAtEnd(sc)) return;
      if (dx > 0 && !scrollAtStart(sc)) return;
      e.preventDefault();
      if (dx < 0) navForward();
      else navBack();
      return;
    }

    if (Math.abs(dy) > SWIPE_MAX_VERTICAL && Math.abs(dy) > Math.abs(dx)) return;

    if (Math.abs(dx) >= SWIPE_MIN) {
      e.preventDefault();
      if (dx < 0) navForward();
      else navBack();
      return;
    }

    if (Math.abs(dx) < 12 && Math.abs(dy) < 12) {
      handleTap(t.clientX);
    }
  }

  function bindTapZones() {
    $("#tap-zone-left")?.addEventListener("click", (e) => {
      e.preventDefault();
      navBack();
    });
    $("#tap-zone-right")?.addEventListener("click", (e) => {
      e.preventDefault();
      navForward();
    });
  }

  function init(opts) {
    getSettings = opts.getSettings || getSettings;
    isScrollLayout = opts.isScrollLayout || isScrollLayout;
    flipPage = opts.flipPage || flipPage;
    navigateChapter = opts.navigateChapter || navigateChapter;
    getScrollEl = opts.getScrollEl || getScrollEl;

    bindTapZones();

    const view = $("#chapter-view");
    view?.addEventListener("touchstart", onTouchStart, { passive: true });
    view?.addEventListener("touchend", onTouchEnd, { passive: false });
  }

  return { init, navBack, navForward };
})();

window.TouchNav = TouchNav;
