#!/usr/bin/env node
/**
 * Interactive ElevenLabs API key ingestion.
 * Run: npm run ingest-key
 *   or: node scripts/ingest-api-key.mjs
 */
import { createInterface } from "readline/promises";
import { writeFileSync, readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";
import { stdin as input, stdout as output } from "process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ENV_PATH = join(ROOT, ".env");
const VAR_NAME = "ELEVENLABS_API_KEY";

const rl = createInterface({ input, output });

function banner() {
  console.log("");
  console.log("  ◈  ElevenLabs API key ingestion");
  console.log("  ───────────────────────────────");
  console.log(`  Saves to: ${ENV_PATH}`);
  console.log("  (.env is gitignored — never committed)");
  console.log("");
}

function normalizeKey(raw) {
  return raw.trim().replace(/^["']|["']$/g, "");
}

function validateFormat(key) {
  if (!key) return "Key cannot be empty.";
  if (key.length < 20) return "Key looks too short — paste the full ElevenLabs API key.";
  if (/\s/.test(key)) return "Key must not contain spaces.";
  return null;
}

async function testKey(key) {
  process.stdout.write("  Validating with ElevenLabs… ");
  try {
    const res = await fetch("https://api.elevenlabs.io/v1/user", {
      headers: { "xi-api-key": key },
    });
    if (res.ok) {
      const user = await res.json();
      const label = user.subscription?.tier || user.first_name || "OK";
      console.log(`✓ (${label})`);
      return true;
    }
    const err = await res.text();
    console.log(`✗ HTTP ${res.status}`);
    if (err) console.log(`  ${err.slice(0, 200)}`);
    return false;
  } catch (e) {
    console.log("✗");
    console.log(`  ${e.message}`);
    return false;
  }
}

function writeEnv(key) {
  const line = `${VAR_NAME}=${key}\n`;
  let content = "";

  if (existsSync(ENV_PATH)) {
    content = readFileSync(ENV_PATH, "utf8");
    const re = new RegExp(`^${VAR_NAME}=.*$`, "m");
    if (re.test(content)) {
      content = content.replace(re, `${VAR_NAME}=${key}`);
    } else {
      content = content.trimEnd() + (content.endsWith("\n") ? "" : "\n") + line;
    }
  } else {
    content = `# Local secrets — do not commit\n${line}`;
  }

  writeFileSync(ENV_PATH, content.endsWith("\n") ? content : content + "\n", "utf8");
}

function hasNetlifyCli() {
  const r = spawnSync("netlify", ["--version"], { shell: true, encoding: "utf8" });
  return r.status === 0;
}

function pushNetlify(key) {
  console.log("");
  console.log("  Pushing to Netlify (all contexts)…");

  const linkCheck = spawnSync("netlify", ["status"], { cwd: ROOT, shell: true, encoding: "utf8" });
  const linked = linkCheck.status === 0 && !/No project id found/i.test(linkCheck.stdout + linkCheck.stderr);

  if (!linked) {
    console.log("  ✗ Netlify project not linked.");
    console.log("    Run: netlify link --id 039c583e-b96b-4212-96ee-fcc1c684e5b1");
    console.log("    (signal-cycle → github.com/Grappe501/signal)");
    return false;
  }

  const r = spawnSync(
    "netlify",
    ["env:set", VAR_NAME, key, "--context", "production", "--context", "deploy-preview", "--context", "branch-deploy"],
    { cwd: ROOT, shell: true, encoding: "utf8" }
  );
  const out = (r.stdout || "") + (r.stderr || "");
  if (r.status === 0 && !/error|failed|No project id/i.test(out)) {
    console.log("  ✓ Netlify env updated — trigger a redeploy for the live site.");
    return true;
  }
  console.log("  ✗ Netlify push failed.");
  if (out.trim()) console.log("   ", out.trim().split("\n")[0]);
  console.log("    Run: netlify login && netlify link");
  return false;
}

async function askYesNo(question, defaultYes = false) {
  const hint = defaultYes ? "[Y/n]" : "[y/N]";
  const ans = (await rl.question(`  ${question} ${hint} `)).trim().toLowerCase();
  if (!ans) return defaultYes;
  return ans === "y" || ans === "yes";
}

async function main() {
  banner();

  const raw = await rl.question("  Paste your ElevenLabs API key: ");
  const key = normalizeKey(raw);

  const formatErr = validateFormat(key);
  if (formatErr) {
    console.log(`\n  ✗ ${formatErr}\n`);
    rl.close();
    process.exit(1);
  }

  const ok = await testKey(key);
  if (!ok) {
    const cont = await askYesNo("Save anyway?", false);
    if (!cont) {
      console.log("\n  Aborted.\n");
      rl.close();
      process.exit(1);
    }
  }

  writeEnv(key);
  console.log(`\n  ✓ Saved to ${ENV_PATH}`);

  if (hasNetlifyCli()) {
    const push = await askYesNo("Also push this key to Netlify?", true);
    if (push) pushNetlify(key);
  } else {
    console.log("");
    console.log("  Tip: install Netlify CLI to push from terminal:");
    console.log("    npm i -g netlify-cli && netlify login");
    console.log("  Or add ELEVENLABS_API_KEY in Netlify → Site → Environment variables.");
  }

  console.log("");
  console.log("  Local dev with functions:");
  console.log("    cd reader && netlify dev");
  console.log("");
  console.log("  Or paste the key once in the reader audio panel (Listen → API key).");
  console.log("");

  rl.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
