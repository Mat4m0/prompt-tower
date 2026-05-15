import * as path from 'path'

export type PromptExportFormat = 'md' | 'txt'
export type PromptExportCustomPathMode = 'relative' | 'absolute'
export type PromptExportLocation = 'promptFolder' | 'workspaceRoot' | 'customFolder'

export interface PromptExportOptions {
  fileName: string
  format: PromptExportFormat
  location: PromptExportLocation
  customFolderPath: string
  customFolderPathMode: PromptExportCustomPathMode
  includeTimestamp: boolean
}

export const DEFAULT_EXPORT_OPTIONS: PromptExportOptions = {
  fileName: 'prompt',
  format: 'md',
  location: 'promptFolder',
  customFolderPath: 'prompts',
  customFolderPathMode: 'relative',
  includeTimestamp: true,
}

export function normalizePromptExportOptions(
  options: Partial<PromptExportOptions> | undefined,
): PromptExportOptions {
  const mode = normalizeCustomFolderPathMode(options?.customFolderPathMode)
  return {
    fileName: sanitizeExportFileName(options?.fileName),
    format: normalizeExportFormat(options?.format),
    location: normalizeExportLocation(options?.location),
    customFolderPathMode: mode,
    customFolderPath: normalizeCustomFolderPath(options?.customFolderPath, mode),
    includeTimestamp: options?.includeTimestamp ?? DEFAULT_EXPORT_OPTIONS.includeTimestamp,
  }
}

export function sanitizeExportFileName(fileName: string | undefined): string {
  const fallback = DEFAULT_EXPORT_OPTIONS.fileName
  if (!fileName) {
    return fallback
  }

  const trimmed = fileName.trim()
  if (!trimmed) {
    return fallback
  }

  const withoutExtension = trimmed.replace(/\.(md|txt)$/i, '')
  const sanitized = replaceInvalidFileNameCharacters(withoutExtension)
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '')

  return sanitized || fallback
}

export function normalizeExportFormat(format: string | undefined): PromptExportFormat {
  return format === 'txt' ? 'txt' : DEFAULT_EXPORT_OPTIONS.format
}

export function normalizeExportLocation(location: string | undefined): PromptExportLocation {
  if (location === 'promptFolder' || location === 'workspaceRoot' || location === 'customFolder') {
    return location
  }

  return DEFAULT_EXPORT_OPTIONS.location
}

export function normalizeCustomFolderPathMode(
  mode: string | undefined,
): PromptExportCustomPathMode {
  return mode === 'absolute' ? 'absolute' : 'relative'
}

export function normalizeCustomFolderPath(
  customFolderPath: string | undefined,
  mode: PromptExportCustomPathMode,
): string {
  const fallback = mode === 'relative' ? DEFAULT_EXPORT_OPTIONS.customFolderPath : ''
  if (!customFolderPath) {
    return fallback
  }

  const trimmed = customFolderPath.trim()
  if (!trimmed) {
    return fallback
  }

  if (mode === 'absolute') {
    return path.normalize(trimmed)
  }

  const normalized = trimmed
    .replace(/\\/g, '/')
    .replace(/^\.\/+/, '')
    .replace(/^\/+/, '')
    .replace(/\/+/g, '/')
    .replace(/\/$/, '')

  return normalized || fallback
}

function replaceInvalidFileNameCharacters(value: string): string {
  let result = ''
  for (let index = 0; index < value.length; index++) {
    const character = value[index]
    result += isInvalidFileNameCharacter(character) ? '-' : character
  }
  return result
}

function isInvalidFileNameCharacter(character: string): boolean {
  return (
    character.charCodeAt(0) < 32 ||
    character === '<' ||
    character === '>' ||
    character === ':' ||
    character === '"' ||
    character === '/' ||
    character === '\\' ||
    character === '|' ||
    character === '?' ||
    character === '*'
  )
}
