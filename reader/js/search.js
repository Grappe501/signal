/**
 * Full-book search — plain-text index built in idle time.
 */
const BookSearch = (() => {
  let index = [];
  let building = false;
  let ready = false;
  let onReady = () => {};

  function stripMarkdown(md) {
    return md
      .replace(/^#+ .+$/gm, " ")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/[*_`>#|~-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function excerptAround(text, query, radius = 70) {
    const lower = text.toLowerCase();
    const q = query.toLowerCase();
    const idx = lower.indexOf(q);
    if (idx < 0) return text.slice(0, radius * 2) + "…";
    const start = Math.max(0, idx - radius);
    const end = Math.min(text.length, idx + q.length + radius);
    let slice = text.slice(start, end).trim();
    if (start > 0) slice = "…" + slice;
    if (end < text.length) slice = slice + "…";
    return slice;
  }

  async function buildIndex(chapters, loadMarkdown) {
    if (building) return;
    building = true;
    ready = false;
    index = [];

    const batch = [...chapters];
    const chunk = 4;

    while (batch.length) {
      const slice = batch.splice(0, chunk);
      await Promise.all(
        slice.map(async (ch) => {
          try {
            const md = await loadMarkdown(ch);
            const plain = stripMarkdown(md);
            index.push({
              id: ch.id,
              num: ch.num,
              title: ch.title,
              titleLower: ch.title.toLowerCase(),
              bodyLower: plain.toLowerCase(),
              plain,
            });
          } catch {
            /* skip */
          }
        })
      );
      await new Promise((r) => {
        if (typeof requestIdleCallback === "function") {
          requestIdleCallback(() => r(), { timeout: 80 });
        } else {
          setTimeout(r, 20);
        }
      });
    }

    building = false;
    ready = true;
    onReady();
  }

  function search(query, limit = 24) {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];

    const results = [];
    for (const row of index) {
      let score = 0;
      if (row.titleLower.includes(q)) score += 12;
      if (String(row.num) === q) score += 15;
      const bodyIdx = row.bodyLower.indexOf(q);
      if (bodyIdx >= 0) score += 2;
      if (score > 0) {
        results.push({
          id: row.id,
          title: row.title,
          num: row.num,
          score,
          excerpt: bodyIdx >= 0 ? excerptAround(row.plain, q) : row.title,
        });
      }
    }

    return results.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  function isReady() {
    return ready;
  }

  function isBuilding() {
    return building;
  }

  function indexSize() {
    return index.length;
  }

  return {
    init(opts) {
      onReady = opts.onReady || onReady;
    },
    buildIndex,
    search,
    isReady,
    isBuilding,
    indexSize,
  };
})();

window.BookSearch = BookSearch;
