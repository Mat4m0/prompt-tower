import * as vscode from "vscode";
import { FileIndex } from "../core/files/FileIndex";
import { FileSelection } from "../core/files/FileSelection";
import { getTokenProfile, type TokenProfile } from "../core/tokens/TokenProfiles";
import { VsCodeClipboard } from "../vscode/VsCodeClipboard";
import { VsCodeFileSystem } from "../vscode/VsCodeFileSystem";
import { VsCodeStorage } from "../vscode/VsCodeStorage";
import { VsCodeWorkspace } from "../vscode/VsCodeWorkspace";
import { ContextApplicationService } from "./ContextApplicationService";
import { DebugLogger } from "./DebugLogger";
import { PromptPresetApplicationService } from "./PromptPresetApplicationService";
import { WorkspaceStateService } from "./WorkspaceStateService";

export interface ServiceContainer {
  workspace: VsCodeWorkspace;
  fileSystem: VsCodeFileSystem;
  fileIndex: FileIndex;
  fileSelection: FileSelection;
  contextService: ContextApplicationService;
  promptPresets: PromptPresetApplicationService;
  workspaceState: WorkspaceStateService;
  logger: DebugLogger;
  getTokenProfile(): TokenProfile;
  setTokenProfile(profileId: string): Promise<TokenProfile>;
}

export function createServiceContainer(
  context: vscode.ExtensionContext
): ServiceContainer {
  const workspace = new VsCodeWorkspace();
  const logger = new DebugLogger();
  const fileSystem = new VsCodeFileSystem(logger);
  const clipboard = new VsCodeClipboard();
  let tokenProfile = getTokenProfile(
    context.globalState.get<string>("promptLupinum.selectedTokenProfile", "claude")
  );
  const fileIndex = new FileIndex(
    fileSystem,
    workspace.getWorkspaces(),
    tokenProfile,
    logger
  );
  const fileSelection = new FileSelection();
  const contextService = new ContextApplicationService(
    fileIndex,
    fileSelection,
    fileSystem,
    clipboard,
    tokenProfile
  );
  const workspaceStorage = new VsCodeStorage(context.workspaceState);
  const promptPresets = new PromptPresetApplicationService(
    new VsCodeStorage(context.globalState),
    workspaceStorage
  );
  const workspaceState = new WorkspaceStateService(workspaceStorage);

  return {
    workspace,
    fileSystem,
    fileIndex,
    fileSelection,
    contextService,
    promptPresets,
    workspaceState,
    logger,
    getTokenProfile(): TokenProfile {
      return tokenProfile;
    },
    async setTokenProfile(profileId: string): Promise<TokenProfile> {
      const profile = getTokenProfile(profileId);
      await context.globalState.update("promptLupinum.selectedTokenProfile", profile.id);
      tokenProfile = profile;
      contextService.setTokenProfile(profile);
      return profile;
    },
  };
}
