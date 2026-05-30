import { BOOK, PARTS, CHAPTERS } from "./chapters.mjs";

export function buildManifest() {
  return {
    ...BOOK,
    parts: PARTS,
    chapters: CHAPTERS.map((ch, i) => ({
      id: ch.id,
      num: ch.num,
      title: ch.title,
      pov: ch.pov,
      phase: ch.phase,
      phaseLabel: ch.phaseLabel,
      part: ch.part,
      prose: ch.prose,
      source: ch.prose
        ? `source/Draft/${ch.publisher}`
        : `source/Outline/Chapter_Sequence_Maps/${ch.map}`,
      prev: i > 0 ? CHAPTERS[i - 1].id : null,
      next: i < CHAPTERS.length - 1 ? CHAPTERS[i + 1].id : null,
    })),
  };
}

import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

if (process.argv[1]?.endsWith("build-manifest.mjs")) {
  writeFileSync(join(root, "book.json"), JSON.stringify(buildManifest(), null, 2));
  console.log(`Wrote book.json (${CHAPTERS.length} chapters)`);
}
