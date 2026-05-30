/** Multi-voice Piper model selection per cue. */
const MALE_SPEAKERS = new Set([
  "noah",
  "eli",
  "mercer",
  "vale",
  "adrian",
  "chen",
]);

export function resolveModels(env) {
  const primary = env.PIPER_MODEL || "";
  return {
    default: primary,
    female: env.PIPER_MODEL_FEMALE || primary,
    male: env.PIPER_MODEL_MALE || env.PIPER_MODEL_FEMALE || primary,
    archive: env.PIPER_MODEL_ARCHIVE || env.PIPER_MODEL_MALE || primary,
  };
}

export function pickModelForCue(cue, models) {
  if (!cue?.text) return models.default;
  const key = (cue.speakerKey || cue.speakerLabel || "").toLowerCase();
  if (cue.role === "archive" || key.includes("archive")) return models.archive;
  if (cue.role === "dialogue") {
    if (MALE_SPEAKERS.has(key) || /\b(noah|eli|mercer|vale|adrian)\b/i.test(key)) {
      return models.male;
    }
    return models.female;
  }
  if (cue.role === "blockquote") return models.archive;
  return models.default;
}
