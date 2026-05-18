import * as vscode from 'vscode'
import type { ContextOutputMode, ProjectTreeMode } from '../../core/context/ContextFormat'
import { buildPromptExportTarget } from '../../core/export/PromptFileWriter'
import {
  normalizePromptExportOptions,
  type PromptExportOptions,
} from '../../core/export/ExportOptions'
import {
  TOKEN_ESTIMATE_PROFILES,
  getTokenEstimateProfile,
} from '../../core/tokens/TokenEstimateProfiles'
import type { ExtensionServices } from './extensionServices'
import { confirmLargeContextAction } from './contextActionConfirmation'
import type {
  ContextPanelState,
  ExtensionToWebviewMessage,
  WebviewToExtensionMessage,
} from '../../shared/messages'

export class WebviewMessageHandler {
  private treeMode: ProjectTreeMode
  private outputMode: ContextOutputMode
  private exportOptions: PromptExportOptions

  constructor(
    private services: ExtensionServices,
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
      case 'estimateSummary.setProfiles':
        await this.services.workspaceState.setEstimateSummaryProfileIds(message.profileIds)
        await this.postState()
        return
      case 'prefix.inlineChanged': {
        const activePrefixId = this.services.promptPrefixes.getActivePrefixId()
        if (activePrefixId) {
          await this.services.promptPrefixes.updatePrefix(activePrefixId, { text: message.text })
        } else {
          await this.services.promptPrefixes.setInlinePrefix(message.text)
          await this.services.promptPrefixes.setActivePrefix(null)
        }
        await this.postState()
        return
      }
      case 'prefix.selectPrefix':
        await this.services.promptPrefixes.setActivePrefix(message.prefixId)
        await this.postState()
        return
      case 'prefix.createPrefix':
        await this.services.promptPrefixes.createPrefix(message.name, message.text)
        await this.postState()
        return
      case 'prefix.renamePrefix':
        await this.services.promptPrefixes.updatePrefix(message.prefixId, { name: message.name })
        await this.postState()
        return
      case 'prefix.duplicatePrefix':
        await this.services.promptPrefixes.duplicatePrefix(message.prefixId)
        await this.postState()
        return
      case 'prefix.deletePrefix':
        await this.services.promptPrefixes.deletePrefix(message.prefixId)
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
        const preflight = await this.services.preflightContext({
          treeMode: this.treeMode,
          outputMode: this.outputMode,
        })
        if (
          !(await confirmLargeContextAction(message.copy ? 'copy' : 'create', preflight.warnings))
        ) {
          return
        }
        const output = await this.services.createContextFromSelection({
          treeMode: this.treeMode,
          outputMode: this.outputMode,
        })
        if (message.copy) {
          await vscode.env.clipboard.writeText(output.text)
        }
        this.post({ type: 'context.previewUpdated', text: output.text })
        await this.postState()
        showContextResultMessage(
          message.copy ? 'Context copied to clipboard.' : 'Context created.',
          output.warnings.length,
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
        const preflight = await this.services.preflightContext({
          treeMode: this.treeMode,
          outputMode: this.outputMode,
        })
        if (!(await confirmLargeContextAction('save', preflight.warnings))) {
          return
        }
        const output = await this.services.createContextFromSelection({
          treeMode: this.treeMode,
          outputMode: this.outputMode,
        })
        const target = buildPromptExportTarget(this.workspaceRoot, this.exportOptions, new Date())
        await this.services.fileSystem.writeText(target.absolutePath, output.text)
        this.post({ type: 'context.previewUpdated', text: output.text })
        await this.postState()
        showContextResultMessage(`Saved ${target.fileName}.`, output.warnings.length)
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
    const activePrefixId = this.services.promptPrefixes.getActivePrefixId()
    const prefix = this.services.promptPrefixes.getEffectivePrefix()
    const visibleEstimateProfileIds = this.services.workspaceState.getEstimateSummaryProfileIds()
    const estimateSummaries = await this.services.contextBuilder.estimatePreviewForProfiles(
      {
        prefix,
        treeMode: this.treeMode,
        outputMode: this.outputMode,
      },
      visibleEstimateProfileIds.map(getTokenEstimateProfile),
    )
    return {
      tokenEstimateProfiles: TOKEN_ESTIMATE_PROFILES.map(({ id, label, estimateNote }) => ({
        id,
        label,
        estimateNote,
      })),
      visibleEstimateProfileIds,
      estimateSummaries: estimateSummaries.map(({ profile, tokens }) => ({
        id: profile.id,
        label: profile.label,
        tokens,
      })),
      promptPrefixes: this.services.promptPrefixes.listPrefixes().map((promptPrefix) => ({
        id: promptPrefix.id,
        name: promptPrefix.name,
        text: promptPrefix.text,
      })),
      activePrefixId,
      inlinePrefix: prefix,
      treeMode: this.treeMode,
      outputMode: this.outputMode,
      exportOptions: this.exportOptions,
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

  private post(message: ExtensionToWebviewMessage): void {
    void this.panel.webview.postMessage(message)
  }
}

function showContextResultMessage(successMessage: string, warningCount: number): void {
  if (warningCount === 0) {
    vscode.window.showInformationMessage(successMessage)
    return
  }

  vscode.window.showWarningMessage(`${successMessage} ${formatWarnings(warningCount)}.`)
}

function formatWarnings(count: number): string {
  return count === 1 ? '1 warning was reported' : `${count} warnings were reported`
}
