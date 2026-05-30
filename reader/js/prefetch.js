/**
 * Idle-time prefetch of upcoming chapter markdown into the reader cache.
 */
const ChapterPrefetch = (() => {
  let queue = [];
  let scheduled = false;
  let loadChapter = null;
  let isCached = () => false;

  function enqueue(ids) {
    for (const id of ids) {
      if (!id || isCached(id) || queue.includes(id)) continue;
      queue.push(id);
    }
    if (queue.length) pump();
  }

  function pump() {
    if (scheduled || !queue.length || !loadChapter) return;
    scheduled = true;

    const run = (deadline) => {
      scheduled = false;
      while (queue.length) {
        const idle = deadline.timeRemaining?.() ?? 50;
        if (idle < 4 && !deadline.didTimeout) break;

        const id = queue.shift();
        if (!isCached(id)) loadChapter(id);

        const again = deadline.timeRemaining?.() ?? 0;
        if (again < 8 && queue.length) break;
      }
      if (queue.length) pump();
    };

    if (typeof requestIdleCallback === "function") {
      requestIdleCallback(run, { timeout: 3000 });
    } else {
      setTimeout(() => run({ timeRemaining: () => 40, didTimeout: true }), 150);
    }
  }

  function aroundChapter(ch, getNavChapter) {
    if (!ch) return;
    const ids = [];
    const n1 = getNavChapter(ch, "next");
    const n2 = n1 ? getNavChapter(n1, "next") : null;
    const p1 = getNavChapter(ch, "prev");
    if (n1) ids.push(n1.id);
    if (n2) ids.push(n2.id);
    if (p1) ids.push(p1.id);
    enqueue(ids);
  }

  function cancel() {
    queue = [];
    scheduled = false;
  }

  function init(opts) {
    loadChapter = opts.loadChapter;
    isCached = opts.isCached || isCached;
  }

  return { init, enqueue, aroundChapter, cancel };
})();

window.ChapterPrefetch = ChapterPrefetch;
