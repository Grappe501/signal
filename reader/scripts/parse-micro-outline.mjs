import { readFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const NOTES = join(__dirname, "..", "..", "Book_2_The_Great_Disconnection", "Notes");

const ACT_FILES = [
  { act: "I", file: "018_book_two_act_one_micro_outline.md", part: "b2-act-i", partLabel: "Act I · False Peace", range: [1, 8] },
  { act: "II", file: "019_book_two_act_two_micro_outline.md", part: "b2-act-ii", partLabel: "Act II · Correction", range: [9, 21] },
  { act: "III", file: "020_book_two_act_three_micro_outline.md", part: "b2-act-iii", partLabel: "Act III · Separation", range: [22, 36] },
  { act: "IV", file: "021_book_two_act_four_micro_outline.md", part: "b2-act-iv", partLabel: "Act IV · Emergency", range: [37, 50] },
  { act: "V", file: "022_book_two_act_five_micro_outline.md", part: "b2-act-v", partLabel: "Act V · Realignment", range: [51, 68] },
  { act: "VI", file: "023_book_two_act_six_micro_outline.md", part: "b2-act-vi", partLabel: "Act VI · Aftermath", range: [69, 82] },
];

function pad(n) {
  return String(n).padStart(2, "0");
}

function slug(title) {
  return title
    .replace(/★/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function extractTableField(block, field) {
  const re = new RegExp(`\\*\\*${field}\\*\\*\\s*\\|\\s*([^\\n|]+)`, "i");
  const m = block.match(re);
  return m ? m[1].trim().replace(/\*\*/g, "") : "";
}

function extractSection(block, name) {
  const re = new RegExp(`## ${name}[\\s\\S]*?(?=\\n## |\\n# |$)`, "i");
  const m = block.match(re);
  if (!m) return "";
  return m[0].replace(/^##[^\n]*\n/, "").trim();
}

function extractMicroBeats(block) {
  const sec = extractSection(block, "Micro Beats");
  if (!sec) return [];
  return sec
    .split("\n")
    .map((l) => l.replace(/^\d+\.\s*/, "").trim())
    .filter(Boolean);
}

function parseChapterBlock(block, meta) {
  const head = block.match(/^# CHAPTER (\d+)\s*·\s*([^\n]+)/i);
  if (!head) return null;
  const num = parseInt(head[1], 10);
  const title = head[2].replace(/\s*★\s*$/, "").trim();

  const pov = extractTableField(block, "POV") || "—";
  const words = extractTableField(block, "Estimated Word Count") || "—";
  const register = extractTableField(block, "Emotional Register") || "—";
  const opening = extractSection(block, "Opening State");
  const conflict = extractSection(block, "Core Conflict");
  const movement = extractSection(block, "Character Movement");
  const symbols = extractSection(block, "Symbol Placement");
  const b3 = extractSection(block, "Book Three Seed");
  const exit = extractSection(block, "Exit Hook");
  const beats = extractMicroBeats(block);

  return {
    num,
    id: `b2-ch-${pad(num)}`,
    title,
    pov,
    words,
    register,
    part: meta.part,
    act: meta.act,
    actLabel: meta.partLabel,
    sourceFile: meta.file,
    opening,
    conflict,
    movement,
    symbols,
    b3,
    exit,
    beats,
    raw: block.trim(),
  };
}

export function loadBookTwoChapters() {
  const chapters = [];
  for (const meta of ACT_FILES) {
    const path = join(NOTES, meta.file);
    const md = readFileSync(path, "utf8");
    const parts = md.split(/\n(?=# CHAPTER \d+)/);
    for (const part of parts) {
      if (!part.startsWith("# CHAPTER")) continue;
      const ch = parseChapterBlock(part, meta);
      if (ch) chapters.push(ch);
    }
  }
  chapters.sort((a, b) => a.num - b.num);
  return chapters;
}

export function microOutlineToReader(ch) {
  let body = `> **Book Two · Development preview**\n`;
  body += `> **Act ${ch.act}** · ${ch.actLabel}\n`;
  body += `> **Phase:** Micro outline (scene design not started)\n`;
  body += `> **POV:** ${ch.pov} · **Target:** ${ch.words} words · **Register:** ${ch.register}\n\n`;
  body += `This chapter is built from the **micro outline** — beats and architecture only, no prose yet. Use this as your working read-through while scenes are drafted.\n\n`;

  if (ch.opening) body += `## Opening state\n\n${ch.opening}\n\n`;
  if (ch.conflict) body += `## Core conflict\n\n${ch.conflict}\n\n`;
  if (ch.movement) body += `## Character movement\n\n${ch.movement}\n\n`;

  if (ch.beats.length) {
    body += `## Micro beats\n\n`;
    ch.beats.forEach((b, i) => {
      body += `${i + 1}. ${b}\n\n`;
    });
  }

  if (ch.symbols) body += `## Symbol placement\n\n${ch.symbols}\n\n`;
  if (ch.b3) body += `## Book Three seed\n\n${ch.b3}\n\n`;
  if (ch.exit) body += `## Exit hook\n\n${ch.exit}\n\n`;

  body += `---\n\n*Source: \`${ch.sourceFile}\` · Book Two micro outline · Chapter ${ch.num}*`;
  return body;
}

export function loadArchitectureNotes() {
  const files = readdirSync(NOTES)
    .filter((f) => f.endsWith(".md"))
    .sort();
  return files.map((file) => {
    const md = readFileSync(join(NOTES, file), "utf8");
    const titleMatch = md.match(/^#\s+BOOK TWO[^\n]*\n+#\s+\*?([^*\n]+)\*?/m) || md.match(/^#\s+(.+)/m);
    const title = titleMatch ? titleMatch[1].replace(/\*/g, "").trim() : file;
    const num = file.match(/^(\d+)/)?.[1] || "000";
    return {
      id: `b2-note-${num.padStart(3, "0")}`,
      file,
      title,
      md,
    };
  });
}

export function architectureNoteToReader(note) {
  let body = `> **Book Two · Architecture reference**\n`;
  body += `> Development document — not narrative prose.\n\n`;
  body += note.md.trim();
  body += `\n\n---\n\n*Source: \`Book_2_The_Great_Disconnection/Notes/${note.file}\`*`;
  return body;
}

if (process.argv[1]?.endsWith("parse-micro-outline.mjs")) {
  const chs = loadBookTwoChapters();
  console.log(`Parsed ${chs.length} Book Two micro-outline chapters`);
  console.log(chs.map((c) => `${c.num}. ${c.title}`).join("\n"));
}
