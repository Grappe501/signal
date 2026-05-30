#!/usr/bin/env node
/**
 * Copy marked into vendor/ for offline reader (no CDN).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const candidates = [
  path.join(root, "node_modules", "marked", "marked.min.js"),
  path.join(root, "node_modules", "marked", "lib", "marked.umd.js"),
];

const src = candidates.find((p) => fs.existsSync(p));
if (!src) {
  console.error("Run npm install marked first.");
  process.exit(1);
}

const dest = path.join(root, "vendor", "marked.min.js");
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.copyFileSync(src, dest);
console.log(`Wrote ${path.relative(root, dest)} (${fs.statSync(dest).size} bytes)`);
