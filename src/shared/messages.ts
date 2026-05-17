import type { ProjectTreeMode, ContextOutputMode } from '../core/context/ContextFormat'
import type { PromptExportOptions } from '../core/export/ExportOptions'

export type WebviewToExtensionMessage =
  | { type: 'ready' }
  | { type: 'estimateSummary.setProfiles'; profileIds: readonly string[] }
  | { type: 'prefix.inlineChanged'; text: string }
  | { type: 'prefix.selectPreset'; presetId: string | null }
  | { type: 'prefix.createPreset'; name: string; text: string }
  | { type: 'prefix.saveVersion'; presetId: string; text: string }
  | { type: 'prefix.restoreVersion'; presetId: string; versionId: string }
  | { type: 'prefix.duplicatePreset'; presetId: string }
  | { type: 'prefix.deletePreset'; presetId: string }
  | { type: 'context.optionsChanged'; treeMode: ProjectTreeMode; outputMode: ContextOutputMode }
  | { type: 'export.optionsChanged'; options: Partial<PromptExportOptions> }
  | {
      type: 'context.create'
      copy: boolean
      treeMode: ProjectTreeMode
      outputMode: ContextOutputMode
    }
  | { type: 'context.copyPreview'; text: string }
  | {
      type: 'context.save'
      options: Partial<PromptExportOptions>
      treeMode: ProjectTreeMode
      outputMode: ContextOutputMode
    }
  | { type: 'selection.clear' }

export type ExtensionToWebviewMessage =
  | { type: 'state.changed'; state: ContextPanelState }
  | { type: 'context.previewUpdated'; text: string }

export interface ContextPanelState {
  tokenEstimateProfiles: readonly {
    id: string
    label: string
    modelHint: string
    updatedAt: string
  }[]
  visibleEstimateProfileIds: readonly string[]
  estimateSummaries: readonly {
    id: string
    label: string
    tokens: number
    cost: string
  }[]
  promptPresets: readonly {
    id: string
    name: string
    text: string
    currentVersionId: string
    versions: readonly {
      id: string
      text: string
      note?: string
      createdAt: string
      current: boolean
    }[]
  }[]
  activePresetId: string | null
  inlinePrefix: string
  treeMode: ProjectTreeMode
  outputMode: ContextOutputMode
  exportOptions: PromptExportOptions
}

export function isWebviewToExtensionMessage(value: unknown): value is WebviewToExtensionMessage {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const message = value as Record<string, unknown>
  switch (message.type) {
    case 'ready':
    case 'selection.clear':
      return true
    case 'context.copyPreview':
      return typeof message.text === 'string'
    case 'estimateSummary.setProfiles':
      return (
        Array.isArray(message.profileIds) &&
        message.profileIds.every((id) => typeof id === 'string')
      )
    case 'prefix.inlineChanged':
      return typeof message.text === 'string'
    case 'prefix.selectPreset':
      return typeof message.presetId === 'string' || message.presetId === null
    case 'prefix.createPreset':
      return typeof message.name === 'string' && typeof message.text === 'string'
    case 'prefix.saveVersion':
      return typeof message.presetId === 'string' && typeof message.text === 'string'
    case 'prefix.restoreVersion':
      return typeof message.presetId === 'string' && typeof message.versionId === 'string'
    case 'prefix.duplicatePreset':
    case 'prefix.deletePreset':
      return typeof message.presetId === 'string'
    case 'context.optionsChanged':
      return isTreeMode(message.treeMode) && isOutputMode(message.outputMode)
    case 'context.create':
      return (
        typeof message.copy === 'boolean' &&
        isTreeMode(message.treeMode) &&
        isOutputMode(message.outputMode)
      )
    case 'context.save':
      return (
        typeof message.options === 'object' &&
        message.options !== null &&
        isTreeMode(message.treeMode) &&
        isOutputMode(message.outputMode)
      )
    case 'export.optionsChanged':
      return typeof message.options === 'object' && message.options !== null
    default:
      return false
  }
}

function isTreeMode(value: unknown): value is ProjectTreeMode {
  return (
    value === 'selectedFilesOnly' ||
    value === 'fullFilesAndDirectories' ||
    value === 'fullDirectoriesOnly' ||
    value === 'none'
  )
}

function isOutputMode(value: unknown): value is ContextOutputMode {
  return value === 'readable' || value === 'compact'
}

export function isExtensionToWebviewMessage(value: unknown): value is ExtensionToWebviewMessage {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const message = value as Record<string, unknown>
  switch (message.type) {
    case 'context.previewUpdated':
      return typeof message.text === 'string'
    case 'state.changed':
      return isContextPanelState(message.state)
    default:
      return false
  }
}

function isContextPanelState(value: unknown): value is ContextPanelState {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const state = value as Record<string, unknown>
  return (
    Array.isArray(state.tokenEstimateProfiles) &&
    Array.isArray(state.visibleEstimateProfileIds) &&
    Array.isArray(state.estimateSummaries) &&
    Array.isArray(state.promptPresets) &&
    (typeof state.activePresetId === 'string' || state.activePresetId === null) &&
    typeof state.inlinePrefix === 'string' &&
    isTreeMode(state.treeMode) &&
    isOutputMode(state.outputMode) &&
    typeof state.exportOptions === 'object' &&
    state.exportOptions !== null
  )
}
