import { BOOK, PARTS, CHAPTERS } from "./chapters.mjs";
import { BOOK_TWO, BOOK_TWO_PARTS } from "./book-two-manifest.mjs";
import {
  loadBookTwoChapters,
  loadArchitectureNotes,
} from "./parse-micro-outline.mjs";

function buildBookTwoManifestEntries() {
  const micro = loadBookTwoChapters();
  const notes = loadArchitectureNotes();

  const start = {
    id: "b2-start",
    num: null,
    title: "The Great Disconnection",
    pov: "—",
    phase: "b2-start",
    phaseLabel: "Book Two · Continuation",
    part: "b2-start",
    prose: false,
    book: 2,
    kind: "divider",
    source: "generated",
  };

  const chapters = micro.map((ch) => ({
    id: ch.id,
    num: ch.num,
    title: ch.title,
    pov: ch.pov,
    phase: "b2-outline",
    phaseLabel: `Micro outline · Act ${ch.act}`,
    part: ch.part,
    prose: false,
    book: 2,
    kind: "micro-outline",
    source: `source/Book2/Micro/${ch.id}.md`,
    act: ch.act,
    actLabel: ch.actLabel,
    targetWords: ch.words,
    register: ch.register,
  }));

  const arch = notes.map((note) => ({
    id: note.id,
    num: null,
    title: note.title.replace(/^BOOK TWO · /i, "").trim() || note.file,
    pov: "Architecture",
    phase: "b2-arch",
    phaseLabel: "Architecture note",
    part: "b2-architecture",
    prose: false,
    book: 2,
    kind: "architecture",
    source: `source/Book2/Notes/${note.file}`,
    noteFile: note.file,
  }));

  return [start, ...chapters, ...arch];
}

export function buildManifest() {
  const bookOne = CHAPTERS.map((ch, i) => ({
    id: ch.id,
    num: ch.num,
    title: ch.title,
    pov: ch.pov,
    phase: ch.phase,
    phaseLabel: ch.phaseLabel,
    part: ch.part,
    prose: ch.prose,
    book: 1,
    kind: ch.prose ? "prose" : "outline",
    source: ch.prose
      ? `source/Draft/${ch.publisher}`
      : ch.map
        ? `source/Outline/Chapter_Sequence_Maps/${ch.map}`
        : undefined,
  }));

  const bookTwo = buildBookTwoManifestEntries();
  const all = [...bookOne, ...bookTwo];

  for (let i = 0; i < all.length; i++) {
    all[i].prev = i > 0 ? all[i - 1].id : null;
    all[i].next = i < all.length - 1 ? all[i + 1].id : null;
    all[i].file = `${all[i].id}.md`;
  }

  return {
    title: "The Signal Cycle",
    subtitle: "Books 1–2 · Read online",
    author: BOOK.author,
    bookOne: {
      title: BOOK.title,
      subtitle: BOOK.subtitle,
      parts: PARTS,
    },
    bookTwo: {
      title: BOOK_TWO.title,
      subtitle: BOOK_TWO.subtitle,
      thesis: BOOK_TWO.thesis,
      parts: BOOK_TWO_PARTS,
    },
    parts: [...PARTS, ...BOOK_TWO_PARTS],
    chapters: all,
  };
}

import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

if (process.argv[1]?.endsWith("build-manifest.mjs")) {
  const m = buildManifest();
  writeFileSync(join(root, "book.json"), JSON.stringify(m, null, 2));
  console.log(
    `Wrote book.json (${m.chapters.length} chapters: B1 ${m.chapters.filter((c) => c.book === 1).length}, B2 ${m.chapters.filter((c) => c.book === 2).length})`
  );
}
