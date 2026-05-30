import { readFileSync, writeFileSync, mkdirSync, existsSync, cpSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { CHAPTERS } from "./chapters.mjs";
import { buildManifest } from "./build-manifest.mjs";
import {
  loadBookTwoChapters,
  loadArchitectureNotes,
  microOutlineToReader,
  architectureNoteToReader,
} from "./parse-micro-outline.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const REPO = join(ROOT, "..");
const SOURCE = join(REPO, "Book_1_The_Second_Self");
const DRAFT = join(SOURCE, "Draft");
const MAPS = join(SOURCE, "Outline", "Chapter_Sequence_Maps");
const B2_NOTES = join(REPO, "Book_2_The_Great_Disconnection", "Notes");
const OUT = join(ROOT, "content");

mkdirSync(OUT, { recursive: true });

function read(path) {
  return readFileSync(path, "utf8");
}

function stripDraftMeta(md) {
  const lines = md.split("\n");
  let i = 0;
  if (lines[i]?.startsWith("#")) i++;
  while (i < lines.length) {
    const line = lines[i].trim();
    if (line === "" || line.startsWith("**") || line.startsWith("|") || line === "---") {
      i++;
      continue;
    }
    break;
  }
  return lines.slice(i).join("\n").trim();
}

function extractSection(md, heading) {
  const re = new RegExp(`## ${heading}[\\s\\S]*?(?=\\n## |$)`, "i");
  const m = md.match(re);
  return m ? m[0].replace(/^##[^\n]*\n/, "").trim() : "";
}

function outlineToReader(ch, mapMd) {
  const objective = extractSection(mapMd, "Chapter objective");
  const ending = extractSection(mapMd, "Chapter ending \\(locked\\)") || extractSection(mapMd, "Chapter ending");
  const overview = extractSection(mapMd, "Sequence overview");
  const authorLock = extractSection(mapMd, "Author lock");

  let body = `> **Development preview** — Full prose for this chapter has not been drafted yet.\n`;
  body += `> **Phase:** ${ch.phaseLabel}\n`;
  body += `> **POV:** ${ch.pov}\n\n`;
  body += `This page is built from the sequence map so you can skim the story arc. Prose chapters (v8 / v5) read as finished text; outline chapters show beats and objectives only.\n\n`;

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
        body += reveals[1].trim().split("\n").filter((l) => l.startsWith("-")).join("\n") + "\n\n";
      }
    }
  }

  if (ending) body += `## Chapter ending\n\n${ending}\n\n`;
  body += `---\n\n*Source: sequence map · ${ch.map}*`;
  return body;
}

function bookTwoDividerMarkdown() {
  return `# The Great Disconnection

**Book Two · The Signal Cycle**

> A civilization that loses trust in prediction will attempt to replace trust with **control**.

---

## Continuation

You finished **Book One: *The Second Self*** at *Connection Established*.

**Book Two** picks up in the aftermath — false peace, voluntary surrender, emergency culture, the Drafting, the Three Days War, and the question of what deserves to be remembered.

---

## What you're reading

| Layer | Status |
|-------|--------|
| **Book One prose** | Complete (78 units) |
| **Book Two micro outlines** | Complete (82 chapters · Acts I–VI) |
| **Book Two scene design** | Not started |
| **Book Two prose** | Not started |

Each Book Two chapter below is a **micro outline** — opening state, conflict, character movement, 8–12 beats, symbols, and exit hooks. This is the working manuscript for scene design and drafting.

---

## Architecture notes

After the chapter outlines, the **Architecture notes** section holds all Book Two development documents (pressure maps, act purposes, movement architecture, signature set pieces, and act micro maps).

---

*Thesis: CONTROL · Emotion: surrender under pressure · Handoff: CONTROL → MEMORY*
`;
}

const manifest = buildManifest();

// Book One
for (let i = 0; i < CHAPTERS.length; i++) {
  const ch = CHAPTERS[i];
  const entry = manifest.chapters[i];

  let markdown;
  if (ch.prose && ch.publisher) {
    const path = join(DRAFT, ch.publisher);
    if (!existsSync(path)) throw new Error(`Missing prose: ${path}`);
    markdown = read(path);
  } else if (ch.map) {
    const path = join(MAPS, ch.map);
    if (!existsSync(path)) throw new Error(`Missing map: ${path}`);
    markdown = outlineToReader(ch, read(path));
  } else {
    throw new Error(`No source for ${ch.id}`);
  }

  writeFileSync(join(OUT, entry.file), markdown, "utf8");
}

// Book Two
const microDir = join(ROOT, "source", "Book2", "Micro");
const notesDir = join(ROOT, "source", "Book2", "Notes");
mkdirSync(microDir, { recursive: true });
mkdirSync(notesDir, { recursive: true });

const microChapters = loadBookTwoChapters();
const microById = Object.fromEntries(microChapters.map((c) => [c.id, c]));

for (const entry of manifest.chapters.filter((c) => c.book === 2)) {
  let markdown;
  if (entry.kind === "divider") {
    markdown = bookTwoDividerMarkdown();
  } else if (entry.kind === "micro-outline") {
    const ch = microById[entry.id];
    if (!ch) throw new Error(`Missing micro outline for ${entry.id}`);
    markdown = microOutlineToReader(ch);
    writeFileSync(join(microDir, `${entry.id}.md`), ch.raw, "utf8");
  } else if (entry.kind === "architecture") {
    const notes = loadArchitectureNotes();
    const note = notes.find((n) => n.id === entry.id);
    if (!note) throw new Error(`Missing architecture note ${entry.id}`);
    markdown = architectureNoteToReader(note);
    cpSync(join(B2_NOTES, note.file), join(notesDir, note.file));
  } else {
    throw new Error(`Unknown Book Two kind: ${entry.kind}`);
  }
  writeFileSync(join(OUT, entry.file), markdown, "utf8");
}

writeFileSync(join(ROOT, "book.json"), JSON.stringify(manifest, null, 2), "utf8");

const b1 = manifest.chapters.filter((c) => c.book === 1);
const b2 = manifest.chapters.filter((c) => c.book === 2);
const proseCount = b1.filter((c) => c.prose).length;
const b2Micro = b2.filter((c) => c.kind === "micro-outline").length;
const b2Arch = b2.filter((c) => c.kind === "architecture").length;
console.log(
  `Built ${manifest.chapters.length} chapters — Book One: ${b1.length} (${proseCount} prose) · Book Two: ${b2.length} (${b2Micro} micro + ${b2Arch} architecture + divider)`
);
