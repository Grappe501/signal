/**
 * Plain speech text from reader markdown — used by Piper batch.
 */
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(__dirname, "..", "content");

export function stripDraftMeta(md) {
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

export function markdownToPlainText(md) {
  let text = stripDraftMeta(md);
  text = text.replace(/```[\s\S]*?```/g, " ");
  text = text.replace(/!\[[^\]]*]\([^)]+\)/g, " ");
  text = text.replace(/\[([^\]]+)]\([^)]+\)/g, "$1");
  text = text.replace(/^#{1,6}\s+/gm, "");
  text = text.replace(/\*\*([^*]+)\*\*/g, "$1");
  text = text.replace(/\*([^*]+)\*/g, "$1");
  text = text.replace(/^>\s?/gm, "");
  text = text.replace(/^[-*+]\s+/gm, "");
  text = text.replace(/^\d+\.\s+/gm, "");
  text = text.replace(/[“”]/g, '"');
  text = text.replace(/[‘’]/g, "'");
  text = text.replace(/—/g, " — ");
  text = text.replace(/\s+/g, " ").trim();
  return text;
}

/** Paragraph-level blocks for per-segment Piper output. */
export function blocksFromMarkdown(md) {
  const body = stripDraftMeta(md);
  const blocks = [];
  const parts = body.split(/\n---\n|\n\n+/);

  for (const part of parts) {
    if (part.trim() === "---") {
      blocks.push({ kind: "break", text: "" });
      continue;
    }
    const lines = part
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("|") && !l.startsWith("**Phase:"));
    if (!lines.length) continue;

    const para = lines
      .join(" ")
      .replace(/^#{1,6}\s+/, "")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/\*([^*]+)\*/g, "$1")
      .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
      .replace(/\s+/g, " ")
      .trim();

    if (para.length < 2) continue;
    blocks.push({ kind: "speech", text: markdownToPlainText(para) });
  }

  return blocks.filter((b) => b.kind === "break" || (b.text && b.text.length > 1));
}

export function readChapterMarkdown(chapterId) {
  const path = join(CONTENT_DIR, `${chapterId}.md`);
  if (!existsSync(path)) return null;
  return readFileSync(path, "utf8");
}

export function chapterSpeechPayload(chapterId) {
  const md = readChapterMarkdown(chapterId);
  if (!md) return null;
  return {
    id: chapterId,
    fullText: markdownToPlainText(md),
    blocks: blocksFromMarkdown(md),
  };
}
