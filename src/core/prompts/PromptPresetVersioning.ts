import { createHash } from "crypto";
import type { PromptPreset, PromptPresetVersion } from "./PromptPresetTypes";

export function createPromptPreset(
  name: string,
  text: string,
  now: string = new Date().toISOString(),
  id: string = createId()
): PromptPreset {
  const version = createPromptPresetVersion(text, now);
  return {
    id,
    name: normalizePresetName(name),
    currentVersionId: version.id,
    createdAt: now,
    updatedAt: now,
    versions: [version],
  };
}

export function savePromptPresetVersion(
  preset: PromptPreset,
  text: string,
  note?: string,
  now: string = new Date().toISOString()
): PromptPreset {
  const version = createPromptPresetVersion(text, now, note);
  return {
    ...preset,
    currentVersionId: version.id,
    updatedAt: now,
    versions: [...preset.versions, version],
  };
}

export function restorePromptPresetVersion(
  preset: PromptPreset,
  versionId: string,
  now: string = new Date().toISOString()
): PromptPreset {
  const version = preset.versions.find((candidate) => candidate.id === versionId);
  if (!version) {
    throw new Error("Prompt preset version not found.");
  }
  return savePromptPresetVersion(preset, version.text, `Restored ${versionId}`, now);
}

export function duplicatePromptPreset(
  preset: PromptPreset,
  now: string = new Date().toISOString(),
  id: string = createId()
): PromptPreset {
  const current = getCurrentPromptPresetVersion(preset);
  return createPromptPreset(`${preset.name} Copy`, current.text, now, id);
}

export function softDeletePromptPreset(
  preset: PromptPreset,
  now: string = new Date().toISOString()
): PromptPreset {
  return { ...preset, deletedAt: now, updatedAt: now };
}

export function getCurrentPromptPresetVersion(
  preset: PromptPreset
): PromptPresetVersion {
  const version = preset.versions.find(
    (candidate) => candidate.id === preset.currentVersionId
  );
  if (!version) {
    throw new Error("Prompt preset current version not found.");
  }
  return version;
}

export function checksumPromptText(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function createPromptPresetVersion(
  text: string,
  now: string,
  note?: string
): PromptPresetVersion {
  return {
    id: createId(),
    text,
    note,
    createdAt: now,
    checksum: checksumPromptText(text),
  };
}

function normalizePresetName(name: string): string {
  const trimmed = name.trim();
  return trimmed || "Untitled Prefix";
}

function createId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

