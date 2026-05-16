import * as vscode from 'vscode'
import { FileIndex } from '../../core/files/FileIndex'
import { FileSelection } from '../../core/files/FileSelection'
import { GitSelection } from '../../core/git/GitSelection'
import { getTokenProfile, type TokenProfile } from '../../core/tokens/TokenProfiles'
import { VsCodeClipboard } from '../VsCodeClipboard'
import { VsCodeFileSystem } from '../VsCodeFileSystem'
import { VsCodeGit } from '../VsCodeGit'
import { VsCodeStorage } from '../VsCodeStorage'
import { VsCodeWorkspace } from '../VsCodeWorkspace'
import { ContextApplicationService } from '../../app/ContextApplicationService'
import { GitApplicationService } from '../../app/GitApplicationService'
import { DebugLogger } from './DebugLogger'
import { PromptPresetApplicationService } from '../../app/PromptPresetApplicationService'
import { WorkspaceStateService } from '../../app/WorkspaceStateService'

export interface ServiceContainer {
  workspace: VsCodeWorkspace
  fileSystem: VsCodeFileSystem
  fileIndex: FileIndex
  fileSelection: FileSelection
  gitSelection: GitSelection
  gitService: GitApplicationService
  contextService: ContextApplicationService
  promptPresets: PromptPresetApplicationService
  workspaceState: WorkspaceStateService
  logger: DebugLogger
  getTokenProfile(): TokenProfile
  setTokenProfile(profileId: string): Promise<TokenProfile>
}

export function createServiceContainer(context: vscode.ExtensionContext): ServiceContainer {
  const workspace = new VsCodeWorkspace()
  const logger = new DebugLogger()
  const fileSystem = new VsCodeFileSystem(logger)
  const gitHost = new VsCodeGit(logger)
  const clipboard = new VsCodeClipboard()
  let tokenProfile = getTokenProfile(
    context.globalState.get<string>('lupinumContext.selectedTokenProfile', 'claude'),
  )
  const fileIndex = new FileIndex(fileSystem, workspace.getWorkspaces(), tokenProfile, logger)
  const fileSelection = new FileSelection()
  const gitSelection = new GitSelection()
  const gitService = new GitApplicationService(gitHost, workspace, gitSelection)
  const contextService = new ContextApplicationService(
    fileIndex,
    fileSelection,
    fileSystem,
    clipboard,
    tokenProfile,
    gitService,
  )
  const workspaceStorage = new VsCodeStorage(context.workspaceState)
  const promptPresets = new PromptPresetApplicationService(
    new VsCodeStorage(context.globalState),
    workspaceStorage,
  )
  const workspaceState = new WorkspaceStateService(workspaceStorage)

  return {
    workspace,
    fileSystem,
    fileIndex,
    fileSelection,
    gitSelection,
    gitService,
    contextService,
    promptPresets,
    workspaceState,
    logger,
    getTokenProfile(): TokenProfile {
      return tokenProfile
    },
    async setTokenProfile(profileId: string): Promise<TokenProfile> {
      const profile = getTokenProfile(profileId)
      await context.globalState.update('lupinumContext.selectedTokenProfile', profile.id)
      tokenProfile = profile
      contextService.setTokenProfile(profile)
      return profile
    },
  }
}
