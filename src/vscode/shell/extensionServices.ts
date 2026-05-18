import * as vscode from 'vscode'
import {
  SelectionContextBuilder,
  type ContextBuildOptions,
  type ContextBuildOutput,
} from '../../app/SelectionContextBuilder'
import { PromptPrefixes } from '../../app/PromptPrefixes'
import { createSelectedGitDiffReader } from '../../app/SelectedGitDiffs'
import { WorkspaceSettings } from '../../app/WorkspaceSettings'
import { FileIndex, type IndexedWorkspace } from '../../core/files/FileIndex'
import { FileSelection } from '../../core/files/FileSelection'
import { GitSelection } from '../../core/git/GitSelection'
import {
  getTokenEstimateProfile,
  type TokenEstimateProfile,
} from '../../core/tokens/TokenEstimateProfiles'
import { VsCodeFileSystem } from '../VsCodeFileSystem'
import { VsCodeGit } from '../VsCodeGit'
import { DebugLogger } from './DebugLogger'

export interface ExtensionServices {
  getWorkspaces(): IndexedWorkspace[]
  getPrimaryWorkspaceRoot(): string | undefined
  fileSystem: VsCodeFileSystem
  gitHost: VsCodeGit
  fileIndex: FileIndex
  fileSelection: FileSelection
  gitSelection: GitSelection
  contextBuilder: SelectionContextBuilder
  promptPrefixes: PromptPrefixes
  workspaceState: WorkspaceSettings
  logger: DebugLogger
  createContextFromSelection(
    options: Omit<ContextBuildOptions, 'prefix'>,
  ): Promise<ContextBuildOutput>
  preflightContext(
    options: Omit<ContextBuildOptions, 'prefix'>,
  ): ReturnType<SelectionContextBuilder['preflightContext']>
  clearSelectedGitDiffCache(): void
  getTokenEstimateProfile(): TokenEstimateProfile
  setTokenEstimateProfile(profileId: string): Promise<TokenEstimateProfile>
}

export function createExtensionServices(context: vscode.ExtensionContext): ExtensionServices {
  const logger = new DebugLogger()
  const fileSystem = new VsCodeFileSystem(logger)
  const gitHost = new VsCodeGit(logger)
  const getWorkspaces = () => readWorkspaceFolders()
  const getPrimaryWorkspaceRoot = () => getWorkspaces()[0]?.rootPath
  let tokenProfile = getTokenEstimateProfile(
    context.globalState.get<string>('lupinumContext.selectedTokenEstimateProfile', 'claude'),
  )
  const fileIndex = new FileIndex(fileSystem, getWorkspaces(), tokenProfile, logger)
  const fileSelection = new FileSelection()
  const gitSelection = new GitSelection()
  const selectedGitDiffs = createSelectedGitDiffReader(gitSelection, (commit) =>
    gitHost.readCommitDiff(commit),
  )
  const contextBuilder = new SelectionContextBuilder(
    fileIndex,
    fileSelection,
    fileSystem,
    tokenProfile,
    getWorkspaces,
    () => selectedGitDiffs.readSelectedGitDiffs(),
  )
  const promptPrefixes = new PromptPrefixes(context.globalState, context.workspaceState)
  const workspaceState = new WorkspaceSettings(context.workspaceState)

  return {
    getWorkspaces,
    getPrimaryWorkspaceRoot,
    fileSystem,
    gitHost,
    fileIndex,
    fileSelection,
    gitSelection,
    contextBuilder,
    promptPrefixes,
    workspaceState,
    logger,
    createContextFromSelection(options): Promise<ContextBuildOutput> {
      return contextBuilder.createContextFromSelection({
        ...options,
        prefix: promptPrefixes.getEffectivePrefix(),
      })
    },
    preflightContext(options) {
      return contextBuilder.preflightContext({
        ...options,
        prefix: promptPrefixes.getEffectivePrefix(),
      })
    },
    clearSelectedGitDiffCache(): void {
      selectedGitDiffs.clear()
    },
    getTokenEstimateProfile(): TokenEstimateProfile {
      return tokenProfile
    },
    async setTokenEstimateProfile(profileId: string): Promise<TokenEstimateProfile> {
      const profile = getTokenEstimateProfile(profileId)
      await context.globalState.update('lupinumContext.selectedTokenEstimateProfile', profile.id)
      tokenProfile = profile
      contextBuilder.setTokenEstimateProfile(profile)
      return profile
    },
  }
}

function readWorkspaceFolders(): IndexedWorkspace[] {
  return (vscode.workspace.workspaceFolders ?? []).map((folder, index) => ({
    id: String(index),
    name: folder.name,
    rootPath: folder.uri.fsPath,
  }))
}
