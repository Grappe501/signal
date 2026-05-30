# Build Book One Part IV Movement III / finale MS (Ch 54–57) — v7 assembly
$base = Split-Path -Parent $MyInvocation.MyCommand.Path
$files = @(
  "054_chapter_54_the_second_war_PUBLISHER.md",
  "055_chapter_55_the_real_confession_PUBLISHER.md",
  "056_chapter_56_mercers_warning_PUBLISHER.md",
  "057_chapter_57_the_ghost_in_the_system_PUBLISHER.md"
)
$header = @"
# Book One — Part IV Movement III Continuous Manuscript (v7)

**Status:** **ASSEMBLY v7**
**Scope:** Ch 54–57 · Part IV finale · handoff to Part V Ch 58
**Audit:** ``054-057_part_iv_v7_unified_pass_audit.md`` (**PASS**)

---

"@
$out = $header
foreach ($f in $files) {
  $p = Join-Path $base $f
  if (-not (Test-Path $p)) { throw "Missing: $f" }
  $out += (Get-Content $p -Raw).Trim() + "`n`n"
}
Set-Content -Path (Join-Path $base "054-057_part_iv_continuous_v7_PUBLISHER.md") -Value $out -NoNewline
Write-Host "Wrote 054-057_part_iv_continuous_v7_PUBLISHER.md ($($files.Count) units)"
