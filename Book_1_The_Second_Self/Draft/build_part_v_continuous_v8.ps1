# Build Book One Part V continuous MS (Ch 58–71) — v8 assembly
$base = Split-Path -Parent $MyInvocation.MyCommand.Path
$files = @(
  "058_chapter_58_the_first_fall_PUBLISHER.md",
  "059_chapter_59_denial_PUBLISHER.md",
  "060_chapter_60_the_salt_revelation_PUBLISHER.md",
  "061_chapter_61_static_PUBLISHER.md",
  "062_chapter_62_the_empty_man_speaks_PUBLISHER.md",
  "063_chapter_63_greenland_PUBLISHER.md",
  "064_chapter_64_the_architects_PUBLISHER.md",
  "065_chapter_65_the_signal_chamber_PUBLISHER.md",
  "066_chapter_66_the_blind_spot_PUBLISHER.md",
  "067_chapter_67_mercers_truth_PUBLISHER.md",
  "068_chapter_68_the_choice_PUBLISHER.md",
  "069_chapter_69_the_second_self_PUBLISHER.md",
  "070_chapter_70_convergence_PUBLISHER.md",
  "071_chapter_71_disconnection_PUBLISHER.md"
)
$header = @"
# Book One — Part V Continuous Manuscript (v8)

**Status:** **ASSEMBLY v8**
**Scope:** Ch 58–71 · Act III climax · continuous read (Ch 57 map gap · Ch 72–77 v8 block)
**Audit:** ``058-071_part_v_v8_unified_pass_audit.md`` (**PASS**)
**Master:** ``000-077_written_full_v8_unified_pass_audit.md`` (**PASS**)

---

"@
$out = $header
foreach ($f in $files) {
  $p = Join-Path $base $f
  if (-not (Test-Path $p)) { throw "Missing: $f" }
  $out += (Get-Content $p -Raw).Trim() + "`n`n"
}
Set-Content -Path (Join-Path $base "058-071_part_v_continuous_v8_PUBLISHER.md") -Value $out -NoNewline
Write-Host "Wrote 058-071_part_v_continuous_v8_PUBLISHER.md ($($files.Count) units)"
