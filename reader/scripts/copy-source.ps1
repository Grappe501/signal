# Copy manuscript into source/ without Node (for low-disk environments)
$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
$Book = Join-Path (Split-Path $Root -Parent) "Book_1_The_Second_Self"
$DraftOut = Join-Path $Root "source\Draft"
$MapsOut = Join-Path $Root "source\Outline\Chapter_Sequence_Maps"

if (-not (Test-Path (Join-Path $Book "Draft"))) {
  Write-Error "Manuscript not found at $Book"
}

New-Item -ItemType Directory -Force -Path $DraftOut, $MapsOut | Out-Null

$prose = @(
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
  "077_chapter_77_connection_established_PUBLISHER.md"
)

foreach ($f in $prose) {
  Copy-Item (Join-Path $Book "Draft\$f") (Join-Path $DraftOut $f) -Force
}

$maps = Get-ChildItem (Join-Path $Book "Outline\Chapter_Sequence_Maps\*.md") |
  Where-Object { $_.Name -match '^\d{3}_chapter_' }
foreach ($m in $maps) {
  Copy-Item $m.FullName (Join-Path $MapsOut $m.Name) -Force
}

Write-Host "Copied $($prose.Count) prose + $($maps.Count) maps to source/"
