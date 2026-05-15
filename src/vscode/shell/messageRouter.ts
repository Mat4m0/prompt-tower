import * as vscode from 'vscode'
import type { ContextOutputMode, ProjectTreeMode } from '../../core/context/ContextFormat'
import {
  normalizePromptExportOptions,
  type PromptExportOptions,
} from '../../core/export/ExportOptions'
import { TOKEN_PROFILES, getTokenProfile } from '../../core/tokens/TokenProfiles'
import type { IndexedNode } from '../../core/files/FileIndex'
import { getCurrentPromptPresetVersion } from '../../core/prompts/PromptPresetVersioning'
import type { ServiceContainer } from './serviceContainer'
import type {
  ContextPanelState,
  ExtensionToWebviewMessage,
  WebviewToExtensionMessage,
} from '../webview/webviewMessages'

export class MessageRouter {
  private treeMode: ProjectTreeMode
  private outputMode: ContextOutputMode
  private exportOptions: PromptExportOptions
  private preview = ''
  private draftPrefixOverride: string | null = null

  constructor(
    private services: ServiceContainer,
    private panel: vscode.WebviewPanel,
    private workspaceRoot: string,
  ) {
    this.treeMode = services.workspaceState.getTreeMode()
    this.outputMode = services.workspaceState.getOutputMode()
    this.exportOptions = services.workspaceState.getExportOptions()
  }

  async handle(message: WebviewToExtensionMessage): Promise<void> {
    switch (message.type) {
      case 'ready':
        await this.postState()
        return
      case 'tokenSummary.setProfiles':
        await this.services.workspaceState.setTokenSummaryProfileIds(message.profileIds)
        await this.postState()
        return
      case 'prefix.inlineChanged':
        if (this.services.promptPresets.getActivePresetId()) {
          this.draftPrefixOverride = message.text
        } else {
          this.draftPrefixOverride = null
          await this.services.promptPresets.setInlinePrefix(message.text)
          await this.services.promptPresets.setActivePreset(null)
        }
        await this.postState()
        return
      case 'prefix.selectPreset':
        this.draftPrefixOverride = null
        await this.services.promptPresets.setActivePreset(message.presetId)
        await this.postState()
        return
      case 'prefix.createPreset':
        this.draftPrefixOverride = null
        await this.services.promptPresets.createPreset(message.name, message.text)
        await this.postState()
        return
      case 'prefix.saveVersion':
        await this.services.promptPresets.saveVersion(message.presetId, message.text)
        this.draftPrefixOverride = null
        await this.postState()
        return
      case 'prefix.restoreVersion':
        await this.services.promptPresets.restoreVersion(message.presetId, message.versionId)
        this.draftPrefixOverride = null
        await this.postState()
        return
      case 'prefix.duplicatePreset':
        await this.services.promptPresets.duplicatePreset(message.presetId)
        this.draftPrefixOverride = null
        await this.postState()
        return
      case 'prefix.deletePreset':
        await this.services.promptPresets.deletePreset(message.presetId)
        this.draftPrefixOverride = null
        await this.postState()
        return
      case 'context.optionsChanged':
        await this.setContextOptions(message.treeMode, message.outputMode)
        await this.postState()
        return
      case 'export.optionsChanged':
        this.exportOptions = normalizePromptExportOptions(message.options)
        await this.services.workspaceState.setExportOptions(this.exportOptions)
        await this.postState()
        return
      case 'context.create': {
        await this.setContextOptions(message.treeMode, message.outputMode)
        const output = message.copy
          ? await this.services.contextService.copyContext(this.buildOptions())
          : await this.services.contextService.buildContext(this.buildOptions())
        this.preview = output.text
        this.post({ type: 'context.previewUpdated', text: output.text })
        await this.postState()
        vscode.window.showInformationMessage(
          message.copy ? 'Context copied to clipboard.' : 'Context created.',
        )
        return
      }
      case 'context.copyPreview':
        await vscode.env.clipboard.writeText(message.text)
        vscode.window.showInformationMessage('Preview copied.')
        return
      case 'context.save': {
        await this.setContextOptions(message.treeMode, message.outputMode)
        this.exportOptions = normalizePromptExportOptions(message.options)
        await this.services.workspaceState.setExportOptions(this.exportOptions)
        const saved = await this.services.contextService.saveContext(
          this.workspaceRoot,
          this.exportOptions,
          this.buildOptions(),
        )
        this.preview = saved.output.text
        this.post({ type: 'context.previewUpdated', text: saved.output.text })
        await this.postState()
        vscode.window.showInformationMessage(`Saved ${saved.fileName}.`)
        return
      }
      case 'selection.clear':
        this.services.fileSelection.clear(this.services.fileIndex.getSnapshot())
        await this.postState()
        return
      default:
        throw new Error('Unknown webview message.')
    }
  }

  async postState(): Promise<void> {
    this.post({ type: 'state.changed', state: await this.createState() })
  }

  async createState(): Promise<ContextPanelState> {
    const activePresetId = this.services.promptPresets.getActivePresetId()
    const presets = this.services.promptPresets.listPresets()
    const prefix = this.getDraftPrefix()
    const visibleTokenProfileIds = this.services.workspaceState.getTokenSummaryProfileIds()
    const tokenSummaries = await this.services.contextService.estimatePreviewForProfiles(
      {
        prefix,
        treeMode: this.treeMode,
        outputMode: this.outputMode,
      },
      visibleTokenProfileIds.map(getTokenProfile),
    )
    const selection = this.services.fileSelection.getSnapshot()
    return {
      tokenProfiles: TOKEN_PROFILES.map(({ id, label }) => ({ id, label })),
      visibleTokenProfileIds,
      tokenSummaries: tokenSummaries.map(({ profile, tokens, cost }) => ({
        id: profile.id,
        label: profile.label,
        tokens,
        cost,
      })),
      promptPresets: presets.map((preset) => ({
        id: preset.id,
        name: preset.name,
        currentVersionId: preset.currentVersionId,
        versions: preset.versions.map((version) => ({
          id: version.id,
          text: version.text,
          note: version.note,
          createdAt: version.createdAt,
          current: version.id === preset.currentVersionId,
        })),
        text: getCurrentPromptPresetVersion(preset).text,
      })),
      activePresetId,
      inlinePrefix: prefix,
      treeMode: this.treeMode,
      outputMode: this.outputMode,
      exportOptions: this.exportOptions,
      selectionSummary: {
        selectedFiles: selection.selectedFiles.length,
        selectedTokens: selection.selectedTokenEstimate,
      },
      syncStatus: this.services.fileIndex.getRefreshState(),
    }
  }

  private buildOptions() {
    return {
      prefix: this.getDraftPrefix(),
      treeMode: this.treeMode,
      outputMode: this.outputMode,
    }
  }

  private async setContextOptions(
    treeMode: ProjectTreeMode,
    outputMode: ContextOutputMode,
  ): Promise<void> {
    this.treeMode = treeMode
    this.outputMode = outputMode
    await this.services.workspaceState.setTreeMode(treeMode)
    await this.services.workspaceState.setOutputMode(outputMode)
  }

  private getDraftPrefix(): string {
    return this.draftPrefixOverride ?? this.services.promptPresets.getEffectivePrefix()
  }

  private post(message: ExtensionToWebviewMessage): void {
    void this.panel.webview.postMessage(message)
  }
}

export function isIndexedNode(value: unknown): value is IndexedNode {
  return typeof value === 'object' && value !== null && 'id' in value && 'kind' in value
}
