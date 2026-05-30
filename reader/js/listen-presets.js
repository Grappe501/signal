/**
 * Dramatic listen presets — rate + pause pacing bundles.
 */
const ListenPresets = (() => {
  const PRESETS = {
    calm: {
      id: "calm",
      label: "Calm",
      speechRate: 0.88,
      listenPacing: 1.25,
    },
    standard: {
      id: "standard",
      label: "Standard",
      speechRate: 1,
      listenPacing: 1,
    },
    urgent: {
      id: "urgent",
      label: "Urgent",
      speechRate: 1.12,
      listenPacing: 0.78,
    },
  };

  const TOLERANCE = { rate: 0.03, pacing: 0.04 };

  function list() {
    return Object.values(PRESETS);
  }

  function get(id) {
    return PRESETS[id] || PRESETS.standard;
  }

  function matchesPreset(speechRate, listenPacing) {
    for (const p of list()) {
      if (
        Math.abs((speechRate ?? 1) - p.speechRate) <= TOLERANCE.rate &&
        Math.abs((listenPacing ?? 1) - p.listenPacing) <= TOLERANCE.pacing
      ) {
        return p.id;
      }
    }
    return "custom";
  }

  function apply(id, settings) {
    const preset = get(id === "custom" ? "standard" : id);
    if (!preset) return settings;
    return {
      ...settings,
      listenPreset: preset.id,
      speechRate: preset.speechRate,
      listenPacing: preset.listenPacing,
    };
  }

  return {
    PRESETS,
    list,
    get,
    matchesPreset,
    apply,
  };
})();

window.ListenPresets = ListenPresets;
