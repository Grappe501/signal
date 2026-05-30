# Build Book One written continuous MS (Prologue + Ch 1–13) — v8 assembly
$base = Split-Path -Parent $MyInvocation.MyCommand.Path
$files = @(
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
  "013_chapter_13_memory_of_a_thing_that_never_happened_PUBLISHER.md"
)
$header = @"
# Book One — Written Continuous Manuscript (v8)

**Status:** **ASSEMBLY v8**
**Scope:** Prologue · Ch 1–13 · **PRINT READY v8** · continuous read
**Audit:** ``000-013_written_continuous_v8_unified_pass_audit.md`` (**PASS**)
**Master:** ``000-077_written_full_v8_unified_pass_audit.md``

---

"@
$out = $header
foreach ($f in $files) {
  $p = Join-Path $base $f
  if (-not (Test-Path $p)) { throw "Missing: $f" }
  $out += (Get-Content $p -Raw).Trim() + "`n`n"
}
Set-Content -Path (Join-Path $base "000-013_written_continuous_v8_PUBLISHER.md") -Value $out -NoNewline
Write-Host "Wrote 000-013_written_continuous_v8_PUBLISHER.md ($($files.Count) units)"
