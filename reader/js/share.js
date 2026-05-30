/**
 * Share chapter + Open Graph meta tags.
 */
const Share = (() => {
  function setMeta(name, content, attr = "name") {
    let el = document.querySelector(`meta[${attr}="${name}"]`);
    if (!el) {
      el = document.createElement("meta");
      el.setAttribute(attr, name);
      document.head.appendChild(el);
    }
    el.setAttribute("content", content);
  }

  function updateChapterMeta(ch, bookTitle) {
    if (!ch) {
      setMeta("og:title", `${bookTitle} — Read online`);
      setMeta("og:description", "Book 1 of The Signal Cycle. Read or listen in your browser.");
      setMeta("og:url", `${location.origin}/`);
      setMeta("twitter:card", "summary");
      return;
    }

    const label = ch.num != null ? `Chapter ${ch.num}` : "Prologue";
    const title = `${ch.title} — ${bookTitle}`;
    const description = `${label} · ${ch.pov} — Book 1 of The Signal Cycle`;
    const url = Routes.absoluteChapterUrl(ch.id);

    document.title = title;
    setMeta("description", description);
    setMeta("og:title", title, "property");
    setMeta("og:description", description, "property");
    setMeta("og:url", url, "property");
    setMeta("og:type", "article", "property");
    setMeta("twitter:card", "summary");
    setMeta("twitter:title", title);
    setMeta("twitter:description", description);
  }

  async function shareChapter(ch, bookTitle) {
    const label = ch.num != null ? `Chapter ${ch.num}` : "Prologue";
    const title = `${label}: ${ch.title}`;
    const url = Routes.absoluteChapterUrl(ch.id);
    const text = `${title} — ${bookTitle}`;

    if (navigator.share) {
      try {
        await navigator.share({ title, text, url });
        return true;
      } catch (e) {
        if (e.name === "AbortError") return false;
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      return "copied";
    } catch {
      prompt("Copy link:", url);
      return false;
    }
  }

  return { updateChapterMeta, shareChapter };
})();

window.Share = Share;
