/**
 * Book pagination — maps chapter blocks onto fixed-size left/right pages.
 */
const BookPages = (() => {
  /** @type {HTMLElement[][]} */
  let pages = [];
  let spreadIndex = 0;
  let measurePage = null;
  let onSpreadChange = null;
  let lastSpread = 0;

  const BLOCK_SEL =
    "p, li, blockquote, h2, h3, h4, pre, table, .part-banner-inline, .chapter-opener";

  function $(id) {
    return document.getElementById(id);
  }

  function pagesPerSpread() {
    return window.innerWidth <= 900 ? 1 : 2;
  }

  function spreadCount() {
    const pps = pagesPerSpread();
    return Math.max(1, Math.ceil(pages.length / pps));
  }

  function totalPages() {
    return pages.length;
  }

  function getSpreadIndex() {
    return spreadIndex;
  }

  function setOnSpreadChange(fn) {
    onSpreadChange = fn;
  }

  function ensureMeasure(isProse) {
    if (!measurePage) {
      measurePage = document.createElement("div");
      measurePage.className = "page-inner page-measure";
      measurePage.setAttribute("aria-hidden", "true");
      document.body.appendChild(measurePage);
    }
    const ref = $("page-left-inner");
    if (ref && ref.clientWidth > 0) {
      measurePage.style.width = `${ref.clientWidth}px`;
      measurePage.style.height = `${ref.clientHeight}px`;
    }
    measurePage.classList.toggle("is-prose", isProse);
    measurePage.classList.toggle("is-outline", !isProse);
    return measurePage;
  }

  function collectBlocks(source) {
    const blocks = [];
    source.querySelectorAll(BLOCK_SEL).forEach((el) => blocks.push(el));
    return blocks;
  }

  function gatherAllBlocks() {
    if (pages.length) return pages.flat();
    const nodes = [];
    const left = $("page-left-inner");
    const right = $("page-right-inner");
    const staging = $("chapter-staging");
    [left, right, staging].forEach((el) => {
      if (!el) return;
      el.querySelectorAll(BLOCK_SEL).forEach((b) => nodes.push(b));
    });
    return nodes;
  }

  function fits(measure, container) {
    return container.scrollHeight <= measure.clientHeight + 2;
  }

  function splitBlockIfNeeded(block, measure, bucket) {
    bucket.innerHTML = "";
    bucket.appendChild(block);
    if (fits(measure, bucket)) return [block];

    if (block.tagName !== "P") return [block];

    const full = block.textContent.trim();
    const sentences = full.match(/[^.!?…]+[.!?…]+|[^.!?…]+$/g) || [full];
    block.remove();

    const parts = [];
    let acc = document.createElement("p");
    acc.className = block.className;

    for (const s of sentences) {
      const piece = s.trim();
      if (!piece) continue;
      const trial = acc.textContent ? `${acc.textContent} ${piece}` : piece;
      const trialEl = document.createElement("p");
      trialEl.className = block.className;
      trialEl.textContent = trial;
      bucket.innerHTML = "";
      bucket.appendChild(trialEl);

      if (!fits(measure, bucket) && acc.textContent) {
        parts.push(acc);
        acc = document.createElement("p");
        acc.className = block.className;
        acc.textContent = piece;
      } else {
        acc.textContent = trial;
      }
    }

    if (acc.textContent.trim()) parts.push(acc);
    return parts.length ? parts : [block];
  }

  function paginate(sourceBody, isProse) {
    spreadIndex = 0;
    pages = [];

    const measure = ensureMeasure(isProse);
    const blocks = collectBlocks(sourceBody);

    if (!blocks.length) {
      pages.push([]);
      mountSpread(false);
      return 0;
    }

    measure.innerHTML = "";
    const bucket = document.createElement("div");
    bucket.className = "page-inner " + (isProse ? "is-prose" : "is-outline");
    measure.appendChild(bucket);

    let current = [];

    for (let block of blocks) {
      const splitParts = splitBlockIfNeeded(block, measure, bucket);
      for (const part of splitParts) {
        block = part;
        bucket.innerHTML = "";
        bucket.appendChild(block);
        if (!fits(measure, bucket)) {
          bucket.removeChild(block);
          if (current.length) pages.push(current);
          current = [block];
          bucket.innerHTML = "";
          bucket.appendChild(block);
        } else {
          current.push(block);
        }
      }
    }

    if (current.length) pages.push(current);
    if (!pages.length) pages.push([]);

    measure.innerHTML = "";
    mountSpread(false);
    return pages.length;
  }

  function mountSpread(animate) {
    const leftInner = $("page-left-inner");
    const rightInner = $("page-right-inner");
    const rightPage = document.querySelector(".book-page-right");
    if (!leftInner || !rightInner) return;

    const pps = pagesPerSpread();
    const leftIdx = spreadIndex * pps;
    const rightIdx = pps > 1 ? spreadIndex * 2 + 1 : -1;

    leftInner.innerHTML = "";
    rightInner.innerHTML = "";

    if (pages[leftIdx]) {
      pages[leftIdx].forEach((n) => leftInner.appendChild(n));
    }
    if (pps > 1 && pages[rightIdx]) {
      pages[rightIdx].forEach((n) => rightInner.appendChild(n));
      if (rightPage) rightPage.style.display = "";
    } else if (rightPage) {
      rightPage.style.display = "none";
    }

    const leftNum = $("page-left-num");
    const rightNum = $("page-right-num");
    if (leftNum) leftNum.textContent = pages[leftIdx]?.length ? String(leftIdx + 1) : "";
    if (rightNum) {
      rightNum.textContent =
        pps > 1 && pages[rightIdx]?.length ? String(rightIdx + 1) : "";
    }

    const spread = $("book-spread");
    if (spread && animate) {
      spread.classList.remove("turn-forward", "turn-back");
      void spread.offsetWidth;
      spread.classList.add(spreadIndex > lastSpread ? "turn-forward" : "turn-back");
      setTimeout(() => spread.classList.remove("turn-forward", "turn-back"), 650);
    }
    lastSpread = spreadIndex;

    if (onSpreadChange) onSpreadChange(spreadIndex, spreadCount(), totalPages());
  }

  function showSpread(idx, animate = true) {
    const max = spreadCount() - 1;
    spreadIndex = Math.max(0, Math.min(idx, max));
    mountSpread(animate);
  }

  function nextSpread() {
    if (spreadIndex < spreadCount() - 1) {
      showSpread(spreadIndex + 1);
      return true;
    }
    return false;
  }

  function prevSpread() {
    if (spreadIndex > 0) {
      showSpread(spreadIndex - 1);
      return true;
    }
    return false;
  }

  function goToSpread(idx) {
    showSpread(idx, false);
  }

  function findSpreadForElement(el) {
    if (!el) return spreadIndex;
    const pps = pagesPerSpread();
    for (let i = 0; i < pages.length; i++) {
      if (pages[i].includes(el)) return Math.floor(i / pps);
    }
    return spreadIndex;
  }

  function showSpreadContaining(el) {
    const idx = findSpreadForElement(el);
    if (idx !== spreadIndex) showSpread(idx, false);
  }

  function repaginateFromVisible(isProse) {
    const staging = $("chapter-staging");
    if (!staging) return;
    staging.innerHTML = "";
    staging.className = isProse ? "chapter-staging is-prose" : "chapter-staging is-outline";
    gatherAllBlocks().forEach((n) => staging.appendChild(n));
    const saved = spreadIndex;
    paginate(staging, isProse);
    showSpread(Math.min(saved, spreadCount() - 1), false);
  }

  function reset() {
    pages = [];
    spreadIndex = 0;
    lastSpread = 0;
    $("page-left-inner") && ($("page-left-inner").innerHTML = "");
    $("page-right-inner") && ($("page-right-inner").innerHTML = "");
    $("chapter-staging") && ($("chapter-staging").innerHTML = "");
  }

  function setPageClasses(isProse) {
    const cls = isProse ? "page-inner is-prose" : "page-inner is-outline";
    $("page-left-inner") && ($("page-left-inner").className = cls);
    $("page-right-inner") && ($("page-right-inner").className = cls);
  }

  function allBlocks() {
    return pages.flat();
  }

  return {
    paginate,
    repaginateFromVisible,
    reset,
    setPageClasses,
    nextSpread,
    prevSpread,
    goToSpread,
    showSpreadContaining,
    findSpreadForElement,
    getSpreadIndex,
    spreadCount,
    totalPages,
    allBlocks,
    setOnSpreadChange,
  };
})();

window.BookPages = BookPages;
