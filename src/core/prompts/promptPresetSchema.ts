import type { PromptPreset } from './PromptPresetTypes'

export function parsePromptPresets(value: unknown): PromptPreset[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.filter(isPromptPreset)
}

function isPromptPreset(value: unknown): value is PromptPreset {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const preset = value as PromptPreset
  if (!Array.isArray(preset.versions) || preset.versions.length === 0) {
    return false
  }
  if (!preset.versions.every(isPromptPresetVersion)) {
    return false
  }
  if (!preset.versions.some((version) => version.id === preset.currentVersionId)) {
    return false
  }
  return (
    typeof preset.id === 'string' &&
    typeof preset.name === 'string' &&
    typeof preset.currentVersionId === 'string' &&
    typeof preset.createdAt === 'string' &&
    typeof preset.updatedAt === 'string' &&
    (preset.deletedAt === undefined || typeof preset.deletedAt === 'string')
  )
}

function isPromptPresetVersion(value: unknown): value is PromptPreset['versions'][number] {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const version = value as PromptPreset['versions'][number]
  return (
    typeof version.id === 'string' &&
    typeof version.text === 'string' &&
    typeof version.createdAt === 'string' &&
    typeof version.checksum === 'string' &&
    (version.note === undefined || typeof version.note === 'string')
  )
}
