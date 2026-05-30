# Chapter Sequence Map Protocol

**Segment:** 054  
**Status:** Active workflow directive  
**Purpose:** Turn each micro-outline chapter into a **screenplay-ready sequence map** before prose drafting.

---

## When to use

After Part I–V micro outlines are locked (Seg 049–053). **One chapter at a time**, in order, unless author directs a jump.

---

## File naming

```
Book_1_The_Second_Self/Outline/Chapter_Sequence_Maps/
  000_prologue_the_martian_walk.md      (when authorized)
  001_chapter_01_the_frozen_man.md
  002_chapter_02_running_double.md
  ...
  077_chapter_77_connection_established.md
```

---

## Required header block

| Field | Source |
|-------|--------|
| Chapter # + title | Part micro outline registry |
| POV | Micro outline |
| Part / emotion | 054 structural summary |
| Word target | Part word budget ÷ chapter count |
| Scene bible anchor | 045 registry |
| Macro section | 047 map |

---

## Required per-scene fields

Each scene = one screenplay beat (location-bound unit of dramatic action).

```markdown
### Scene X.Y — [Working title]

| | |
|--|--|
| **Location** | From settings bible or `[GAP]` |
| **POV** | Usually chapter POV; note if intercut |
| **Duration est.** | Screen minutes (rough) |

**Scene objective (character):** What POV wants in this beat.

**Scene objective (story):** What the narrative must accomplish.

**Conflict / obstacle:** What resists the objective.

**Reveals:** What audience learns — explicit list.

**Withholds:** Golden rule (Seg 034) — what audience still doesn't know.

**Visual motifs:** Seg 028/029 symbols — light, eyes, silence, etc.

**Character beats:** Emotional shift for POV (and key others on screen).

**Foreshadowing:** B2 collapse seeds (017 registry) · hidden timeline (046) · twist plants (035).

**Connection theme:** How scene tests connected vs together (045).

**End image / transition:** Last frame or line beat into next scene.

**Locked dialogue:** Quoted lines from author material only.

**Canon refs:** Segment IDs.

**Open:** `[GAP]` items needing author input.
```

---

## Chapter-level footer

- **Chapter objective** (one sentence)
- **Chapter ending** (locked from micro outline)
- **Emotional exit state** for POV
- **Plant payoffs** (scenes this chapter sets up)
- **Conflicts flagged**
- **Sequence map status:** Draft / Author review / Locked

---

## Fidelity rules

1. Do not invent plot events, names, or dialogue not in uploads.
2. Scene **count** and **ordering** may be inferred only when micro outline implies sequential beats (e.g. arrive → encounter → forensic proof).
3. Expand **craft direction** (camera, motif, tone) only when supported by style guide, scene bible, or dossiers.
4. Phase 2 conflicts stay flagged — do not merge silently.

---

## Relation to screenplay

Maps feed `Screenplay_Adaptation/` beat sheets. Legendary scenes (045) get **craft priority** notes in their chapter maps.

**Screenplay target:** ~2 hr 45 min total (Seg 036) — sequence maps allocate rough screen time per scene.

---

## Build order (Step 10)

See `015_pre_draft_build_order.md` — Step 10 = chapter sequence maps.
