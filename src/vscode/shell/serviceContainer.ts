import * as vscode from 'vscode'
import { ContextApplicationService } from '../../app/ContextApplicationService'
import { PromptPresetApplicationService } from '../../app/PromptPresetApplicationService'
import { WorkspaceStateService } from '../../app/WorkspaceStateService'
import { FileIndex, type IndexedWorkspace } from '../../core/files/FileIndex'
import { FileSelection } from '../../core/files/FileSelection'
import { GitSelection } from '../../core/git/GitSelection'
import type { GitCommitDiff } from '../../core/git/GitTypes'
import {
  getTokenEstimateProfile,
  type TokenEstimateProfile,
} from '../../core/tokens/TokenEstimateProfiles'
import { VsCodeFileSystem } from '../VsCodeFileSystem'
import { VsCodeGit } from '../VsCodeGit'
import { DebugLogger } from './DebugLogger'

export interface ServiceContainer {
  getWorkspaces(): IndexedWorkspace[]
  getPrimaryWorkspaceRoot(): string | undefined
  fileSystem: VsCodeFileSystem
  gitHost: VsCodeGit
  fileIndex: FileIndex
  fileSelection: FileSelection
  gitSelection: GitSelection
  contextService: ContextApplicationService
  promptPresets: PromptPresetApplicationService
  workspaceState: WorkspaceStateService
  logger: DebugLogger
  getTokenEstimateProfile(): TokenEstimateProfile
  setTokenEstimateProfile(profileId: string): Promise<TokenEstimateProfile>
}

export function createServiceContainer(context: vscode.ExtensionContext): ServiceContainer {
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
  const contextService = new ContextApplicationService(
    fileIndex,
    fileSelection,
    fileSystem,
    (text) => vscode.env.clipboard.writeText(text),
    tokenProfile,
    () => readSelectedGitDiffs(gitHost, gitSelection),
  )
  const promptPresets = new PromptPresetApplicationService(
    context.globalState,
    context.workspaceState,
  )
  const workspaceState = new WorkspaceStateService(context.workspaceState)

  return {
    getWorkspaces,
    getPrimaryWorkspaceRoot,
    fileSystem,
    gitHost,
    fileIndex,
    fileSelection,
    gitSelection,
    contextService,
    promptPresets,
    workspaceState,
    logger,
    getTokenEstimateProfile(): TokenEstimateProfile {
      return tokenProfile
    },
    async setTokenEstimateProfile(profileId: string): Promise<TokenEstimateProfile> {
      const profile = getTokenEstimateProfile(profileId)
      await context.globalState.update('lupinumContext.selectedTokenEstimateProfile', profile.id)
      tokenProfile = profile
      contextService.setTokenEstimateProfile(profile)
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

function readSelectedGitDiffs(
  gitHost: VsCodeGit,
  gitSelection: GitSelection,
): Promise<readonly GitCommitDiff[]> {
  return Promise.all(
    gitSelection.getSnapshot().selectedCommits.map((commit) => gitHost.readCommitDiff(commit)),
  )
}
