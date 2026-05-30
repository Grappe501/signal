#!/usr/bin/env python3
"""Copy manuscript + push to GitHub. Run: python deploy.py"""
import os, shutil, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
BOOK = ROOT.parent / "Book_1_The_Second_Self"
TMP = ROOT.parent / "tmp"
LOG = TMP / "deploy.log"
TMP.mkdir(exist_ok=True)
(TMP / "git").mkdir(exist_ok=True)
os.environ["TEMP"] = str(TMP)
os.environ["TMP"] = str(TMP)
os.environ["TMPDIR"] = str(TMP)
os.environ["GIT_TMP_DIR"] = str(TMP / "git")
os.environ["NPM_CONFIG_CACHE"] = str(ROOT.parent / ".npm-cache")
os.environ["PIP_CACHE_DIR"] = str(ROOT.parent / ".pip-cache")

PROSE = [
    "000_prologue_the_martian_walk_PUBLISHER.md",
    "001_chapter_01_the_frozen_man_PUBLISHER.md",
    "002_chapter_02_running_double_PUBLISHER.md",
    "003_chapter_03_the_score_PUBLISHER.md",
    "004_chapter_04_the_city_of_tomorrow_PUBLISHER.md",
    "005_chapter_05_the_hero_of_mars_PUBLISHER.md",
    "006_chapter_06_the_school_of_everything_PUBLISHER.md",
    "007_chapter_07_mercer_PUBLISHER.md",
    "008_chapter_08_the_empty_chair_PUBLISHER.md",
    "009_chapter_09_the_second_crime_PUBLISHER.md",
    "010_chapter_10_the_veiled_city_PUBLISHER.md",
    "011_chapter_11_the_third_question_PUBLISHER.md",
    "012_chapter_12_impossible_PUBLISHER.md",
    "013_chapter_13_memory_of_a_thing_that_never_happened_PUBLISHER.md",
    "072_chapter_72_the_release_PUBLISHER.md",
    "073_chapter_73_false_peace_PUBLISHER.md",
    "074_chapter_74_breakfast_PUBLISHER.md",
    "075_chapter_75_the_birth_PUBLISHER.md",
    "076_chapter_76_the_vault_PUBLISHER.md",
    "077_chapter_77_connection_established_PUBLISHER.md",
]

def log(msg):
    print(msg)
    with open(LOG, "a", encoding="utf-8") as f:
        f.write(msg + "\n")

def run(cmd, **kw):
    log("+ " + " ".join(cmd))
    return subprocess.run(cmd, cwd=ROOT, check=True, **kw)

def main():
    if LOG.exists():
        LOG.unlink()
    log("=== Deploy The Second Self reader ===")

    if not BOOK.exists():
        log(f"ERROR: Manuscript not found at {BOOK}")
        sys.exit(1)

    draft_out = ROOT / "source" / "Draft"
    maps_out = ROOT / "source" / "Outline" / "Chapter_Sequence_Maps"
    draft_out.mkdir(parents=True, exist_ok=True)
    maps_out.mkdir(parents=True, exist_ok=True)

    for f in PROSE:
        src = BOOK / "Draft" / f
        if not src.exists():
            log(f"ERROR: Missing {src}")
            sys.exit(1)
        shutil.copy2(src, draft_out / f)
    log(f"Copied {len(PROSE)} prose files")

    maps = sorted((BOOK / "Outline" / "Chapter_Sequence_Maps").glob("[0-9][0-9][0-9]_chapter_*.md"))
    for m in maps:
        shutil.copy2(m, maps_out / m.name)
    log(f"Copied {len(maps)} sequence maps")

    if not (ROOT / ".git").exists():
        run(["git", "init"])

    run(["git", "add", "-A"])
    status = subprocess.run(["git", "diff", "--cached", "--quiet"], cwd=ROOT)
    if status.returncode != 0:
        run(["git", "commit", "-m", "Deploy The Second Self online reader v3"])
    else:
        log("No changes to commit")

    subprocess.run(["git", "remote", "remove", "origin"], cwd=ROOT, capture_output=True)
    run(["git", "remote", "add", "origin", "https://github.com/Grappe501/signal.git"])
    run(["git", "branch", "-M", "main"])
    run(["git", "push", "-u", "origin", "main"])

    log("\nSUCCESS: https://github.com/Grappe501/signal")
    log(f"Log saved: {LOG}")

if __name__ == "__main__":
    try:
        main()
    except subprocess.CalledProcessError as e:
        log(f"\nFAILED (exit {e.returncode}): {e.cmd}")
        log("Try: gh auth login")
        sys.exit(1)
    except Exception as e:
        log(f"\nFAILED: {e}")
        sys.exit(1)
