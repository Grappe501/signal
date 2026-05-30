import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { CHAPTERS } from "./chapters.mjs";
import { buildManifest } from "./build-manifest.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SOURCE = join(ROOT, "..", "Book_1_The_Second_Self");
const DRAFT = join(SOURCE, "Draft");
const MAPS = join(SOURCE, "Outline", "Chapter_Sequence_Maps");
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

  if (objective) {
    body += `## What this chapter does\n\n${objective}\n\n`;
  }
  if (authorLock) {
    body += `## Author lock\n\n${authorLock}\n\n`;
  }
  if (overview) {
    body += `## Sequence overview\n\n${overview}\n\n`;
  }

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
        body += reveals[1].trim().split("\n").filter(l => l.startsWith("-")).join("\n") + "\n\n";
      }
    }
  }

  if (ending) {
    body += `## Chapter ending\n\n${ending}\n\n`;
  }

  body += `---\n\n*Source: sequence map · ${ch.map}*`;
  return body;
}

const manifest = buildManifest();

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

  const outFile = `${ch.id}.md`;
  writeFileSync(join(OUT, outFile), markdown, "utf8");
  entry.file = outFile;
}

writeFileSync(join(ROOT, "book.json"), JSON.stringify(manifest, null, 2), "utf8");

const proseCount = manifest.chapters.filter(c => c.prose).length;
const outlineCount = manifest.chapters.length - proseCount;
console.log(`Built ${manifest.chapters.length} chapters (${proseCount} prose, ${outlineCount} outline)`);
