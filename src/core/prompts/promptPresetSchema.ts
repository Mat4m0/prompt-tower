import type { PromptPreset } from "./PromptPresetTypes";

export function parsePromptPresets(value: unknown): PromptPreset[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(isPromptPreset);
}

function isPromptPreset(value: unknown): value is PromptPreset {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const preset = value as PromptPreset;
  return (
    typeof preset.id === "string" &&
    typeof preset.name === "string" &&
    typeof preset.currentVersionId === "string" &&
    Array.isArray(preset.versions)
  );
}

