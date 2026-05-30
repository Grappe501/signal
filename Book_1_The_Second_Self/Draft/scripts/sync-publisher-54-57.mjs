#!/usr/bin/env node
import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const map = {
  54: "the_second_war",
  55: "the_real_confession",
  56: "mercers_warning",
  57: "the_ghost_in_the_system",
};

for (const n of [54, 55, 56, 57]) {
  const slug = map[n];
  const pad = String(n).padStart(3, "0");
  const craftPath = join(ROOT, `${pad}_chapter_${n}_${slug}.md`);
  const craft = readFileSync(craftPath, "utf8");
  const body = craft.slice(craft.indexOf("---") + 3).trim();
  writeFileSync(
    join(ROOT, `${pad}_chapter_${n}_${slug}_PUBLISHER.md`),
    `# Chapter ${n}\n\n${body}\n`
  );
  console.log(`Synced Ch ${n}`);
}
