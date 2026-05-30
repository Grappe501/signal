import { cpSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { CHAPTERS } from "./chapters.mjs";
import { buildManifest } from "./build-manifest.mjs";
import { writeFileSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const BOOK_CANDIDATES = [
  join(ROOT, "manuscript"),
  join(ROOT, "..", "Book_1_The_Second_Self"),
];

const BOOK = BOOK_CANDIDATES.find((p) => existsSync(join(p, "Draft")));
const SRC = join(ROOT, "source");

const draftOut = join(SRC, "Draft");
const mapsOut = join(SRC, "Outline", "Chapter_Sequence_Maps");

if (!BOOK) {
  console.log("Manuscript not found — skipping copy (using existing source/ if present)");
  console.log("  Expected: manuscript/Draft or ../Book_1_The_Second_Self/Draft");
} else {
  mkdirSync(draftOut, { recursive: true });
  mkdirSync(mapsOut, { recursive: true });

  let copied = 0;
  for (const ch of CHAPTERS) {
    if (ch.prose && ch.publisher) {
      cpSync(join(BOOK, "Draft", ch.publisher), join(draftOut, ch.publisher));
      copied++;
    } else if (ch.map) {
      cpSync(join(BOOK, "Outline", "Chapter_Sequence_Maps", ch.map), join(mapsOut, ch.map));
      copied++;
    }
  }
  console.log(`Copied ${copied} source files to source/`);
}

writeFileSync(join(ROOT, "book.json"), JSON.stringify(buildManifest(), null, 2));
console.log("book.json written");
