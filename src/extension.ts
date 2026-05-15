import * as vscode from "vscode";
import { MultiRootTreeProvider } from "./providers/MultiRootTreeProvider";
import {
  GitHubIssuesProvider,
  GitHubIssue,
} from "./providers/GitHubIssuesProvider";
import {
  GitHubPRsProvider,
  GitHubPR,
} from "./providers/GitHubPRsProvider";
import { WorkspaceManager } from "./services/WorkspaceManager";
import { FileDiscoveryService } from "./services/FileDiscoveryService";
import { TokenCountingService } from "./services/TokenCountingService";
import { IgnorePatternService } from "./services/IgnorePatternService";
import { ContextGenerationService } from "./services/ContextGenerationService";
import { estimateContextCharacters } from "./services/contextTokenEstimate";
import { PromptHistoryService, PromptType } from "./services/PromptHistoryService";
import { PromptExportService } from "./services/PromptExportService";
import { configureTokenizerCache } from "./services/tokenizer";
import { FileSnapshotService } from "./services/FileSnapshotService";
import {
  DEFAULT_TOKEN_PROFILE_ID,
  TOKEN_PROFILES,
  estimateTokensFromText,
  formatTokenCost,
  getTokenProfile,
  isTokenProfileId,
  type TokenProfile,
} from "./services/tokenProfiles";
import { FileNode } from "./models/FileNode";
import { TokenUpdatePayload, TreeSyncStatePayload } from "./models/Events";
import { GitHubConfigManager } from "./utils/githubConfig";
import { getWebviewHtml, WebviewParams } from "./extension.webview.html";

// --- Webview Panel Handling ---
let webviewPanel: vscode.WebviewPanel | undefined;
const VIEW_TYPE = "promptTowerUI";


// --- Service Instances ---
let workspaceManager: WorkspaceManager;
let ignorePatternService: IgnorePatternService;
let fileDiscoveryService: FileDiscoveryService;
let tokenCountingService: TokenCountingService;
let contextGenerationService: ContextGenerationService;
let promptHistoryService: PromptHistoryService;
let promptExportService: PromptExportService;
let multiRootProvider: MultiRootTreeProvider;
let issuesProviderInstance: GitHubIssuesProvider | undefined;
let prsProviderInstance: GitHubPRsProvider | undefined;
let mainTreeView: vscode.TreeView<FileNode>;
let statusWebview: vscode.WebviewView | undefined;
let fileSnapshotService: FileSnapshotService;
let currentTokenProfile: TokenProfile = getTokenProfile(DEFAULT_TOKEN_PROFILE_ID);

// --- Preview State ---
let isPreviewValid = false;
let isContextActionInFlight = false;
let tokenPreviewTimeout: NodeJS.Timeout | undefined;
let tokenPreviewSequence = 0;
let tokenPreviewOptions: {
  treeType:
    | "fullFilesAndDirectories"
    | "fullDirectoriesOnly"
    | "selectedFilesOnly"
    | "none";
  minify: boolean;
} = {
  treeType: "fullFilesAndDirectories",
  minify: false,
};

interface FreshContextInput {
  allRootNodes: FileNode[];
  prefix: string;
  suffix: string;
  removedSelections: string[];
}

// --- Helper Functions ---
function updateWebviewVisibilityContext() {
  const isVisible = webviewPanel !== undefined && webviewPanel.visible;
  vscode.commands.executeCommand('setContext', 'promptTower.webviewVisible', isVisible);
}

function invalidateWebviewPreview() {
  if (webviewPanel && isPreviewValid) {
    webviewPanel.webview.postMessage({ command: "invalidatePreview" });
    isPreviewValid = false;
  }
}

function createTokenUpdatePayload(
  count: number,
  isCounting: boolean = false
): TokenUpdatePayload {
  return {
    count,
    isCounting,
    profileId: currentTokenProfile.id,
    profileLabel: currentTokenProfile.label,
    estimated: true,
    cost: formatTokenCost(count, currentTokenProfile),
    inputPricePerMTok: currentTokenProfile.inputPricePerMTok,
  };
}

function postTokenUpdateForText(text: string): void {
  if (!webviewPanel) {
    return;
  }

  webviewPanel.webview.postMessage({
    command: "tokenUpdate",
    payload: createTokenUpdatePayload(
      estimateTokensFromText(text, currentTokenProfile)
    ),
  });
}

function scheduleEstimatedTokenPreviewUpdate(delayMs: number = 120): void {
  if (tokenPreviewTimeout) {
    clearTimeout(tokenPreviewTimeout);
  }

  tokenPreviewTimeout = setTimeout(() => {
    tokenPreviewTimeout = undefined;
    void updateEstimatedTokenPreview();
  }, delayMs);
}

async function updateEstimatedTokenPreview(): Promise<void> {
  if (!webviewPanel || !multiRootProvider || !contextGenerationService) {
    return;
  }

  const sequence = ++tokenPreviewSequence;
  const allRootNodes = multiRootProvider.getRootNodes();
  const checkedFiles = multiRootProvider.getCheckedFiles();
  const selectedFileBlockChars =
    multiRootProvider.getSelectedFileBlockCharacterEstimate(
      tokenPreviewOptions.minify
    );
  const projectTree = await contextGenerationService.generateProjectTreePreview(
    allRootNodes,
    {
      primaryWorkspaceRoot: workspaceManager.getPrimaryWorkspace()?.rootPath,
      treeType: tokenPreviewOptions.treeType,
    }
  );

  if (sequence !== tokenPreviewSequence || !webviewPanel) {
    return;
  }

  const githubIssueChars = Math.ceil(
    tokenCountingService.getGitHubIssueTokenCount() *
      currentTokenProfile.charsPerToken
  );
  const estimatedChars = estimateContextCharacters({
    prefix: multiRootProvider.getPromptPrefix(),
    suffix: multiRootProvider.getPromptSuffix(),
    selectedFileBlockChars,
    selectedFileCount: checkedFiles.length,
    projectTree,
    treeType: tokenPreviewOptions.treeType,
    minify: tokenPreviewOptions.minify,
    githubIssueChars,
  });

  webviewPanel.webview.postMessage({
    command: "tokenUpdate",
    payload: createTokenUpdatePayload(
      Math.ceil(estimatedChars / currentTokenProfile.charsPerToken),
      tokenCountingService.getIsCounting()
    ),
  });
}

function setSyncStatus(text: string, busy: boolean = isContextActionInFlight) {
  if (webviewPanel) {
    webviewPanel.webview.postMessage({
      command: "syncStatus",
      payload: {
        text,
        busy,
      },
    });
  }
}

function getSyncStatusText(syncState: TreeSyncStatePayload): string {
  switch (syncState.state) {
    case "dirty":
    case "refreshing":
      return "Project changed, refreshing...";
    case "idle":
      return syncState.lastRefreshAt ? "Synced just now" : "";
    default:
      return "";
  }
}

function formatRemovedSelectionsMessage(count: number): string {
  return count === 1
    ? "1 selected file was removed because it no longer exists"
    : `${count} selected files were removed because they no longer exist`;
}

async function withFreshContext<T>(
  actionLabel: string,
  operation: (context: FreshContextInput) => Promise<T>
): Promise<T> {
  if (!multiRootProvider) {
    throw new Error("Prompt Tower is not initialized.");
  }

  let finalStatusText = getSyncStatusText(multiRootProvider.getSyncState());
  isContextActionInFlight = true;
  setSyncStatus(`Refreshing before ${actionLabel}...`, true);

  try {
    const freshness = await multiRootProvider.ensureFresh();
    finalStatusText =
      freshness.removedSelections.length > 0
        ? formatRemovedSelectionsMessage(freshness.removedSelections.length)
        : "Synced just now";

    setSyncStatus(finalStatusText, true);

    return await operation({
      allRootNodes: multiRootProvider.getRootNodes(),
      prefix: multiRootProvider.getPromptPrefix(),
      suffix: multiRootProvider.getPromptSuffix(),
      removedSelections: freshness.removedSelections,
    });
  } catch (error) {
    finalStatusText = getSyncStatusText(multiRootProvider.getSyncState());
    throw error;
  } finally {
    isContextActionInFlight = false;
    setSyncStatus(finalStatusText, false);
  }
}

function resetWebviewPreview() {
  if (webviewPanel) {
    webviewPanel.webview.postMessage({ command: "resetPreview" });
  }
}

function getPrimaryWorkspaceRoot(): string {
  const primaryWorkspace = workspaceManager.getPrimaryWorkspace();
  if (!primaryWorkspace) {
    throw new Error("No workspace available for prompt export.");
  }

  return primaryWorkspace.rootPath;
}

function getNonce() {
  let text = "";
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

// --- File Preview Helper ---
async function showFilePreview(fileNode: FileNode): Promise<void> {
  try {
    const document = await vscode.workspace.openTextDocument(
      vscode.Uri.file(fileNode.absolutePath)
    );
    
    await vscode.window.showTextDocument(document, {
      viewColumn: vscode.ViewColumn.One,
      preview: true,
      preserveFocus: true
    });
  } catch (error) {
    console.error(`Failed to preview file ${fileNode.absolutePath}:`, error);
    vscode.window.showErrorMessage(`Could not preview file: ${fileNode.label}`);
  }
}

// --- Webview Content Generation ---
function getWebviewContent(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  initialPrefix: string = "",
  initialSuffix: string = "",
  initialTreeType: "fullFilesAndDirectories" | "fullDirectoriesOnly" | "selectedFilesOnly" | "none" = "fullFilesAndDirectories",
  prefixCollapsed: boolean = false,
  suffixCollapsed: boolean = true
): string {
  const nonce = getNonce();
  const exportOptions = promptExportService.getOptions();

  // Use the modular HTML generator
  const params: WebviewParams = {
    nonce,
    cspSource: webview.cspSource,
    initialPrefix,
    initialSuffix,
    initialTreeType,
    initialExportFileName: exportOptions.fileName,
    initialExportFormat: exportOptions.format,
    initialExportLocation: exportOptions.location,
    initialCustomFolderPath: exportOptions.customFolderPath,
    initialCustomFolderPathMode: exportOptions.customFolderPathMode,
    initialIncludeTimestamp: exportOptions.includeTimestamp,
    prefixCollapsed,
    suffixCollapsed,
    tokenProfiles: TOKEN_PROFILES,
    selectedTokenProfileId: currentTokenProfile.id,
  };

  return getWebviewHtml(params);
}

// --- Webview Panel Management ---
function createOrShowWebviewPanel(context: vscode.ExtensionContext) {
  const column = vscode.window.activeTextEditor
    ? vscode.window.activeTextEditor.viewColumn
    : vscode.ViewColumn.Beside;

  if (webviewPanel) {
    webviewPanel.reveal(column);
    return;
  }

  webviewPanel = vscode.window.createWebviewPanel(
    VIEW_TYPE,
    "Prompt Tower",
    column || vscode.ViewColumn.Beside,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "assets")],
    }
  );

  // Get collapse states from globalState
  const prefixCollapsed = context.globalState.get("promptTower.prefixCollapsed", false);
  const suffixCollapsed = context.globalState.get("promptTower.suffixCollapsed", true);
  const initialTreeType =
    vscode.workspace
      .getConfiguration("promptTower")
      .get<"fullFilesAndDirectories" | "fullDirectoriesOnly" | "selectedFilesOnly" | "none">(
        "outputFormat.projectTreeFormat.type",
        "fullFilesAndDirectories"
      );
  tokenPreviewOptions.treeType = initialTreeType;

  webviewPanel.webview.html = getWebviewContent(
    webviewPanel.webview,
    context.extensionUri,
    multiRootProvider ? multiRootProvider.getPromptPrefix() : "",
    multiRootProvider ? multiRootProvider.getPromptSuffix() : "",
    initialTreeType,
    prefixCollapsed,
    suffixCollapsed
  );

  // Update context for status tree visibility
  updateWebviewVisibilityContext();

  // Handle messages from webview
  webviewPanel.webview.onDidReceiveMessage(
    async (message) => {
      switch (message.command) {
        case "updatePrefix":
          if (multiRootProvider && typeof message.text === "string") {
            multiRootProvider.setPromptPrefix(message.text);
            invalidateWebviewPreview();
            scheduleEstimatedTokenPreviewUpdate();
          }
          break;

        case "updateSuffix":
          if (multiRootProvider && typeof message.text === "string") {
            multiRootProvider.setPromptSuffix(message.text);
            invalidateWebviewPreview();
            scheduleEstimatedTokenPreviewUpdate();
          }
          break;

        case "selectTokenProfile":
          if (
            multiRootProvider &&
            typeof message.profileId === "string" &&
            isTokenProfileId(message.profileId)
          ) {
            currentTokenProfile = getTokenProfile(message.profileId);
            await context.globalState.update(
              "promptTower.selectedTokenProfile",
              currentTokenProfile.id
            );
            multiRootProvider.setTokenProfile(currentTokenProfile);
            scheduleEstimatedTokenPreviewUpdate(0);
          }
          break;

        case "tokenPreviewOptionsChanged":
          tokenPreviewOptions = {
            treeType: message.options?.treeType || tokenPreviewOptions.treeType,
            minify: message.options?.minify ?? tokenPreviewOptions.minify,
          };
          scheduleEstimatedTokenPreviewUpdate();
          break;

        case "webviewReady":
          if (multiRootProvider && webviewPanel) {
            const exportOptions = promptExportService.getOptions();
            // Send initial state
            webviewPanel.webview.postMessage({
              command: "updatePrefix",
              text: multiRootProvider.getPromptPrefix(),
            });
            webviewPanel.webview.postMessage({
              command: "updateSuffix",
              text: multiRootProvider.getPromptSuffix(),
            });
            webviewPanel.webview.postMessage({
              command: "tokenUpdate",
              payload: createTokenUpdatePayload(0, tokenCountingService.getIsCounting()),
            });
            // Send initial tree visibility state
            webviewPanel.webview.postMessage({
              command: "treeVisibilityChanged",
              visible: mainTreeView.visible,
            });
            webviewPanel.webview.postMessage({
              command: "updateExportOptions",
              payload: exportOptions,
            });
            setSyncStatus(getSyncStatusText(multiRootProvider.getSyncState()));
            scheduleEstimatedTokenPreviewUpdate(0);
          }
          break;

        case "updateExportOptions":
          if (message.options && typeof message.options === "object") {
            await promptExportService.saveOptions(message.options);
          }
          break;

        case "createContext":
          if (multiRootProvider && contextGenerationService && webviewPanel) {
            try {
              const panel = webviewPanel;
              const options = message.options || {};
              const treeType = options.treeType || "fullFilesAndDirectories";
              const copyToClipboard = options.copyToClipboard ?? true;
              const minify = options.minify ?? false;
              await withFreshContext("create", async ({
                allRootNodes,
                prefix,
                suffix,
              }) => {
                const result = await contextGenerationService.generateContext(
                  allRootNodes,
                  {
                    prefix,
                    suffix,
                    treeType: treeType,
                    minify,
                  }
                );

                const primaryWorkspace = workspaceManager.getPrimaryWorkspace();
                if (primaryWorkspace && promptHistoryService) {
                  promptHistoryService.savePrompts(
                    prefix,
                    suffix,
                    primaryWorkspace.name,
                    primaryWorkspace.rootPath
                  );
                }

                if (copyToClipboard) {
                  await vscode.env.clipboard.writeText(result.contextString);
                  vscode.window.showInformationMessage(
                    "✨ Context copied to clipboard!"
                  );
                }

                panel.webview.postMessage({
                  command: "updatePreview",
                  payload: { context: result.contextString },
                });
                postTokenUpdateForText(result.contextString);
                isPreviewValid = true;
              });
            } catch (error) {
              vscode.window.showErrorMessage(
                `Error generating context: ${error}`
              );
            }
          }
          break;

        case "savePromptFile":
          if (multiRootProvider && contextGenerationService && webviewPanel) {
            try {
              const panel = webviewPanel;
              const workspaceRoot = getPrimaryWorkspaceRoot();
              const exportOptions = await promptExportService.saveOptions(
                message.options ?? {}
              );
              const exportDate = new Date();
              const timestamp =
                promptExportService.createWrapperTimestamp(exportDate);
              const outputFileName = `${exportOptions.fileName}.${exportOptions.format}`;
              await withFreshContext("save", async ({
                allRootNodes,
                prefix,
                suffix,
              }) => {
                const result = await contextGenerationService.generateContext(
                  allRootNodes,
                  {
                    prefix,
                    suffix,
                    treeType:
                      message.options?.treeType || "fullFilesAndDirectories",
                    minify: message.options?.minify ?? false,
                    outputFileName,
                    timestamp,
                  }
                );

                if (result.fileCount === 0 && !result.contextString) {
                  vscode.window.showWarningMessage(
                    "No files selected or prompt text entered to save."
                  );
                  return;
                }

                const savedFile = await promptExportService.writePromptFile(
                  workspaceRoot,
                  result.contextString,
                  exportOptions,
                  exportDate
                );

                panel.webview.postMessage({
                  command: "updatePreview",
                  payload: { context: result.contextString },
                });
                postTokenUpdateForText(result.contextString);
                panel.webview.postMessage({
                  command: "promptFileSaved",
                  payload: {
                    filePath: savedFile.absolutePath,
                    fileName: savedFile.fileName,
                  },
                });
                isPreviewValid = true;

                vscode.window.showInformationMessage(
                  `Saved prompt file: ${savedFile.fileName}`
                );
              });
            } catch (error) {
              vscode.window.showErrorMessage(
                `Error saving prompt file: ${error}`
              );
            }
          }
          break;

        case "openSavedPromptFile":
          if (typeof message.filePath === "string") {
            try {
              const document = await vscode.workspace.openTextDocument(
                vscode.Uri.file(message.filePath)
              );
              await vscode.window.showTextDocument(document, {
                preview: false,
                preserveFocus: false,
              });
            } catch (error) {
              vscode.window.showErrorMessage(
                `Could not open saved prompt file: ${error}`
              );
            }
          }
          break;

        case "revealSavedPromptFile":
          if (typeof message.filePath === "string") {
            try {
              await vscode.commands.executeCommand(
                "revealFileInOS",
                vscode.Uri.file(message.filePath)
              );
            } catch (error) {
              vscode.window.showErrorMessage(
                `Could not reveal saved prompt file: ${error}`
              );
            }
          }
          break;

        case "copySavedPromptFilePath":
          if (typeof message.filePath === "string") {
            await vscode.env.clipboard.writeText(message.filePath);
            vscode.window.showInformationMessage("Prompt file path copied.");
          }
          break;

        case "createAndCopyToClipboard":
          if (multiRootProvider && contextGenerationService) {
            try {
              await withFreshContext("copy", async ({
                allRootNodes,
                prefix,
                suffix,
              }) => {
                const result = await contextGenerationService.copyToClipboard(
                  allRootNodes,
                  {
                    prefix,
                    suffix,
                    minify: message.options?.minify ?? false,
                  }
                );

                if (webviewPanel) {
                  webviewPanel.webview.postMessage({
                    command: "updatePreview",
                    payload: { context: result.contextString },
                  });
                  postTokenUpdateForText(result.contextString);
                  isPreviewValid = true;
                }
              });
            } catch (error) {
              console.error("Error in createAndCopyToClipboard:", error);
            }
          }
          break;

        case "clearSelections":
          if (multiRootProvider) {
            multiRootProvider.clearAllSelections();
            scheduleEstimatedTokenPreviewUpdate();
          }
          break;

        case "resetAll":
          if (multiRootProvider && webviewPanel) {
            // Reset all selections (files and GitHub issues)
            multiRootProvider.resetAll();

            // Clear prompt prefix and suffix
            multiRootProvider.setPromptPrefix("");
            multiRootProvider.setPromptSuffix("");

            // Update webview with empty values
            webviewPanel.webview.postMessage({
              command: "updatePrefix",
              text: "",
            });
            webviewPanel.webview.postMessage({
              command: "updateSuffix",
              text: "",
            });

            // Clear context preview
            webviewPanel.webview.postMessage({
              command: "updatePreview",
              payload: { context: "" },
            });

            // Reset preview state
            isPreviewValid = false;
            scheduleEstimatedTokenPreviewUpdate();

            // Show confirmation
            vscode.window.showInformationMessage(
              "✨ Everything has been reset!"
            );
          }
          break;

        case "showToast":
          if (message.payload && typeof message.payload.message === "string") {
            vscode.window.showInformationMessage(message.payload.message);
          }
          break;

        case "showTree":
          // Focus the Prompt Tower tree view to make it visible
          await vscode.commands.executeCommand("workbench.view.extension.prompt-tower");
          break;

        case "toggleCollapse":
          if (message.section === "prefix" || message.section === "suffix") {
            const key = `promptTower.${message.section}Collapsed`;
            context.globalState.update(key, message.collapsed);
          }
          break;

        case "selectPrevious":
          if (promptHistoryService && webviewPanel) {
            const target = message.target as PromptType;
            const primaryWorkspace = workspaceManager.getPrimaryWorkspace();
            const workspacePath = primaryWorkspace?.rootPath || "";

            // Check if history is empty
            if (promptHistoryService.isEmpty(target)) {
              vscode.window.showInformationMessage(
                `No saved ${target === "prefix" ? "prefixes" : "suffixes"} yet. Create context with a ${target} to save it.`
              );
              break;
            }

            // Get QuickPick items
            const items = promptHistoryService.getQuickPickItems(target, workspacePath);

            // Show QuickPick
            const selected = await vscode.window.showQuickPick(items, {
              placeHolder: `Select a previous ${target}`,
              title: `${target === "prefix" ? "Prefix" : "Suffix"} History`,
            });

            // If user selected an item, update the textarea
            if (selected?.entry) {
              const command = target === "prefix" ? "updatePrefix" : "updateSuffix";
              webviewPanel.webview.postMessage({
                command,
                text: selected.entry.text,
              });
              // Also update the provider state
              if (multiRootProvider) {
                if (target === "prefix") {
                  multiRootProvider.setPromptPrefix(selected.entry.text);
                } else {
                  multiRootProvider.setPromptSuffix(selected.entry.text);
                }
              }
              invalidateWebviewPreview();
            }
          }
          break;

      }
    },
    undefined,
    context.subscriptions
  );

  // Listen for visibility changes (tab switching)
  webviewPanel.onDidChangeViewState(
    () => {
      updateWebviewVisibilityContext();
    },
    null,
    context.subscriptions
  );

  webviewPanel.onDidDispose(
    () => {
      webviewPanel = undefined;
      updateWebviewVisibilityContext();
    },
    null,
    context.subscriptions
  );
}

// --- Status Tree Webview Provider ---
class StatusTreeProvider implements vscode.WebviewViewProvider {
  resolveWebviewView(webviewView: vscode.WebviewView): void {
    statusWebview = webviewView;
    
    webviewView.webview.options = {
      enableScripts: true,
    };

    webviewView.webview.html = this.getStatusHtml(webviewView.webview);

    // Handle button clicks
    webviewView.webview.onDidReceiveMessage(message => {
      if (message.command === "openUI") {
        vscode.commands.executeCommand("promptTower.showTowerUI");
      }
    });
  }

  private getStatusHtml(webview: vscode.Webview): string {
    const nonce = getNonce();
    
    return `<!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta http-equiv="Content-Security-Policy" content="
            default-src 'none';
            style-src 'unsafe-inline';
            script-src 'nonce-${nonce}';
        ">
        <style>
            body {
                padding: 12px;
                font-family: var(--vscode-font-family);
                background: transparent;
                margin: 0;
            }
            .status-container {
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 8px;
            }
            .status-message {
                font-size: 11px;
                color: var(--vscode-descriptionForeground);
                text-align: center;
                margin-bottom: 4px;
            }
            .open-ui-btn {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                padding: 4px 12px;
                background: var(--vscode-editorWarning-background, rgba(255, 140, 0, 0.15));
                color: var(--vscode-editorWarning-foreground, #ff8c00);
                border: 1px solid var(--vscode-editorWarning-border, rgba(255, 140, 0, 0.3));
                border-radius: 4px;
                font-size: 11px;
                font-family: var(--vscode-font-family);
                cursor: pointer;
                font-weight: 500;
                text-decoration: none;
            }
            .open-ui-btn:hover {
                background: var(--vscode-editorWarning-background, rgba(255, 140, 0, 0.25));
            }
            .open-ui-btn svg {
                width: 12px;
                height: 12px;
                opacity: 0.9;
            }
        </style>
    </head>
    <body>
        <div class="status-container">
            <div class="status-message">UI panel not visible</div>
            <button id="openUIButton" class="open-ui-btn">
                <svg viewBox="0 0 16 16" fill="currentColor">
                    <path d="M1.5 1a.5.5 0 0 0-.5.5v3a.5.5 0 0 1-1 0v-3A1.5 1.5 0 0 1 1.5 0h3a.5.5 0 0 1 0 1h-3zM11 .5a.5.5 0 0 1 .5-.5h3A1.5 1.5 0 0 1 16 1.5v3a.5.5 0 0 1-1 0v-3a.5.5 0 0 0-.5-.5h-3a.5.5 0 0 1-.5-.5zM.5 11a.5.5 0 0 1 .5.5v3a.5.5 0 0 0 .5.5h3a.5.5 0 0 1 0 1h-3A1.5 1.5 0 0 1 0 14.5v-3a.5.5 0 0 1 .5-.5zm15 0a.5.5 0 0 1 .5.5v3a1.5 1.5 0 0 1-1.5 1.5h-3a.5.5 0 0 1 0-1h3a.5.5 0 0 0 .5-.5v-3a.5.5 0 0 1 .5-.5z"/>
                    <path d="M3 5.5a.5.5 0 0 1 .5-.5h9a.5.5 0 0 1 0 1h-9a.5.5 0 0 1-.5-.5zM3 8a.5.5 0 0 1 .5-.5h9a.5.5 0 0 1 0 1h-9A.5.5 0 0 1 3 8zm0 2.5a.5.5 0 0 1 .5-.5h6a.5.5 0 0 1 0 1h-6a.5.5 0 0 1-.5-.5z"/>
                </svg>
                Open UI Panel
            </button>
        </div>
        
        <script nonce="${nonce}">
            (function() {
                const vscode = acquireVsCodeApi();
                
                document.getElementById('openUIButton')?.addEventListener("click", () => {
                    vscode.postMessage({ command: "openUI" });
                });
            }());
        </script>
    </body>
    </html>`;
  }
}

// --- Extension Activation ---
export function activate(context: vscode.ExtensionContext) {
  const storedTokenProfileId = context.globalState.get<string>(
    "promptTower.selectedTokenProfile",
    DEFAULT_TOKEN_PROFILE_ID
  );
  currentTokenProfile = getTokenProfile(storedTokenProfileId);

  // Initialize services
  workspaceManager = new WorkspaceManager();
  ignorePatternService = new IgnorePatternService(context);
  fileDiscoveryService = new FileDiscoveryService(ignorePatternService);
  fileSnapshotService = new FileSnapshotService();
  configureTokenizerCache();
  tokenCountingService = new TokenCountingService(fileSnapshotService);
  contextGenerationService = new ContextGenerationService(fileSnapshotService);
  promptHistoryService = new PromptHistoryService(context);
  promptExportService = new PromptExportService(context);

  // Check if we have workspaces
  if (!workspaceManager.hasWorkspaces()) {
    vscode.window.showInformationMessage(
      "Prompt Tower: No workspace open. Tree view not available."
    );
    return;
  }

  // Initialize main tree provider
  multiRootProvider = new MultiRootTreeProvider(
    workspaceManager,
    fileDiscoveryService,
    tokenCountingService,
    ignorePatternService,
    context
  );
  multiRootProvider.setTokenProfile(currentTokenProfile);

  // Create tree view
  mainTreeView = vscode.window.createTreeView("promptTowerView", {
    treeDataProvider: multiRootProvider,
    canSelectMany: true,
    showCollapseAll: true,
    manageCheckboxStateManually: true,
  });

  // Auto-open webview when activity bar is clicked (tree view becomes visible)
  context.subscriptions.push(
    mainTreeView.onDidChangeVisibility((e) => {
      if (e.visible) {
        // Activity bar was clicked - open the webview
        createOrShowWebviewPanel(context);
      }
      
      // Notify webview about tree visibility changes
      if (webviewPanel) {
        webviewPanel.webview.postMessage({
          command: "treeVisibilityChanged",
          visible: e.visible
        });
      }
    })
  );

  // Handle checkbox clicks (checkboxes are separate from row content)
  context.subscriptions.push(
    mainTreeView.onDidChangeCheckboxState(async (evt) => {
        for (const [item, state] of evt.items) {
          if (isFileNode(item)) {
            await multiRootProvider.toggleNodeSelection(item);
          }
        }
        invalidateWebviewPreview();
        scheduleEstimatedTokenPreviewUpdate();
      })
  );

  // Row content clicks are handled via commands set on each TreeItem
  // See promptTower.toggleFileSelection command registration below

  // Initialize GitHub Issues provider
  const primaryWorkspace = workspaceManager.getPrimaryWorkspace();
  if (primaryWorkspace) {
    issuesProviderInstance = new GitHubIssuesProvider(
      context,
      primaryWorkspace.rootPath
    );
    const issuesTreeView = vscode.window.createTreeView(
      "promptTowerIssuesView",
      {
        treeDataProvider: issuesProviderInstance,
        showCollapseAll: false,
        canSelectMany: true,
        manageCheckboxStateManually: true,
      }
    );

    context.subscriptions.push(
      issuesTreeView.onDidChangeCheckboxState(async (evt) => {
        for (const [item, state] of evt.items) {
          if (item instanceof GitHubIssue && issuesProviderInstance) {
            await issuesProviderInstance.toggleIssueSelection(item);
          }
        }
        // Invalidate preview when issue selections change
        invalidateWebviewPreview();
        scheduleEstimatedTokenPreviewUpdate();
      })
    );

    context.subscriptions.push(issuesTreeView);

    // Connect the providers for context generation
    multiRootProvider.setGitHubIssuesProvider(issuesProviderInstance);
    contextGenerationService.setGitHubIssuesProvider(issuesProviderInstance);

    // Initialize GitHub PRs provider
    prsProviderInstance = new GitHubPRsProvider(
      context,
      primaryWorkspace.rootPath
    );
    const prsTreeView = vscode.window.createTreeView(
      "promptTowerPRsView",
      {
        treeDataProvider: prsProviderInstance,
        showCollapseAll: false,
        canSelectMany: true,
        manageCheckboxStateManually: true,
      }
    );

    context.subscriptions.push(
      prsTreeView.onDidChangeCheckboxState(async (evt) => {
        for (const [item, state] of evt.items) {
          if (item instanceof GitHubPR && prsProviderInstance) {
            await prsProviderInstance.togglePRSelection(item);
          }
        }
        invalidateWebviewPreview();
        scheduleEstimatedTokenPreviewUpdate();
      })
    );

    context.subscriptions.push(prsTreeView);

    // Connect PR provider for context generation
    contextGenerationService.setGitHubPRsProvider(prsProviderInstance);
  }

  // Register status tree webview provider
  const statusTreeProvider = new StatusTreeProvider();
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("promptTowerStatus", statusTreeProvider)
  );

  // Setup token counting events
  context.subscriptions.push(
    tokenCountingService.onDidChangeTokens((payload: TokenUpdatePayload) => {
      if (webviewPanel) {
        scheduleEstimatedTokenPreviewUpdate();
        invalidateWebviewPreview();
      }
    })
  );

  context.subscriptions.push(
    multiRootProvider.onDidChangeSyncState((payload: TreeSyncStatePayload) => {
      if (payload.state !== "idle") {
        invalidateWebviewPreview();
      }
      setSyncStatus(getSyncStatusText(payload));
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((document) => {
      if (document.uri.scheme !== "file") {
        return;
      }

      const node = multiRootProvider.findNodeByPath(document.uri.fsPath);
      if (node?.isChecked) {
        invalidateWebviewPreview();
        scheduleEstimatedTokenPreviewUpdate();
      }
    })
  );

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand("promptTower.showTowerUI", () => {
      createOrShowWebviewPanel(context);
    }),

    // Handle tree item clicks (whole row clickable)
    vscode.commands.registerCommand("promptTower.toggleFileSelection", async (fileNode: FileNode) => {
      await multiRootProvider.toggleNodeSelection(fileNode);
      invalidateWebviewPreview();
      scheduleEstimatedTokenPreviewUpdate();
    }),

    vscode.commands.registerCommand("promptTower.refresh", async () => {
      await multiRootProvider.refresh();
      scheduleEstimatedTokenPreviewUpdate();
    }),

    vscode.commands.registerCommand("promptTower.clearSelections", () => {
      multiRootProvider.clearAllSelections();
      scheduleEstimatedTokenPreviewUpdate();
    }),

    vscode.commands.registerCommand("promptTower.hideTreeTokenCounts", async () => {
      await vscode.workspace
        .getConfiguration("promptTower")
        .update("showTreeTokenCounts", false, vscode.ConfigurationTarget.Global);
    }),

    vscode.commands.registerCommand("promptTower.showTreeTokenCounts", async () => {
      await vscode.workspace
        .getConfiguration("promptTower")
        .update("showTreeTokenCounts", true, vscode.ConfigurationTarget.Global);
    }),

    vscode.commands.registerCommand("promptTower.toggleAllFiles", async () => {
      await multiRootProvider.toggleAllFiles();
      scheduleEstimatedTokenPreviewUpdate();
    }),

    vscode.commands.registerCommand("promptTower.copyToClipboard", async () => {
      if (contextGenerationService) {
        await withFreshContext("copy", async ({
          allRootNodes,
          prefix,
          suffix,
        }) => {
          await contextGenerationService.copyToClipboard(allRootNodes, {
            prefix,
            suffix,
          });
        });
      }
    }),

    // Also register with old name for compatibility
    vscode.commands.registerCommand(
      "promptTower.copyContextToClipboard",
      async () => {
        if (contextGenerationService) {
          await withFreshContext("copy", async ({
            allRootNodes,
            prefix,
            suffix,
          }) => {
            await contextGenerationService.copyToClipboard(allRootNodes, {
              prefix,
              suffix,
            });
          });
        }
      }
    ),

    // GitHub Issues commands
    vscode.commands.registerCommand(
      "promptTower.refreshGitHubIssues",
      async () => {
        if (issuesProviderInstance) {
          await issuesProviderInstance.reloadIssues();
        }
      }
    ),

    // GitHub PRs commands
    vscode.commands.registerCommand(
      "promptTower.refreshGitHubPRs",
      async () => {
        if (prsProviderInstance) {
          await prsProviderInstance.reloadPRs();
        }
      }
    ),

    vscode.commands.registerCommand("promptTower.addGitHubToken", async () => {
      const token = await vscode.window.showInputBox({
        title: "Add GitHub Personal Access Token",
        prompt: "Enter your GitHub PAT with 'repo' scope",
        placeHolder: "ghp_...",
        password: true,
        validateInput: (value) => {
          if (!value || value.trim().length === 0) {
            return "Token cannot be empty";
          }
          if (!value.startsWith("ghp_") && !value.startsWith("github_pat_")) {
            return "Invalid token format. GitHub tokens start with 'ghp_' or 'github_pat_'";
          }
          return null;
        },
      });

      if (token) {
        try {
          await GitHubConfigManager.storePAT(context, token);
          vscode.window.showInformationMessage(
            "GitHub token saved successfully. Refreshing..."
          );

          if (issuesProviderInstance) {
            await issuesProviderInstance.reloadIssues();
          }
          if (prsProviderInstance) {
            await prsProviderInstance.reloadPRs();
          }
        } catch (error) {
          vscode.window.showErrorMessage(
            "Failed to save GitHub token: " + (error as Error).message
          );
        }
      }
    }),

    vscode.commands.registerCommand(
      "promptTower.removeGitHubToken",
      async () => {
        const confirm = await vscode.window.showWarningMessage(
          "Remove stored GitHub token? You'll need to re-add it to access private repositories.",
          "Remove Token",
          "Cancel"
        );

        if (confirm === "Remove Token") {
          try {
            await GitHubConfigManager.removePAT(context);

            vscode.window.showInformationMessage(
              "GitHub token removed successfully. Refreshing..."
            );

            if (issuesProviderInstance) {
              await issuesProviderInstance.reloadIssues();
            }
            if (prsProviderInstance) {
              await prsProviderInstance.reloadPRs();
            }
          } catch (error) {
            vscode.window.showErrorMessage(
              "Failed to remove GitHub token: " + (error as Error).message
            );
          }
        }
      }
    ),

    vscode.commands.registerCommand("promptTower.addCurrentFile", async () => {
      const activeEditor = vscode.window.activeTextEditor;
      if (!activeEditor) {
        vscode.window.showWarningMessage(
          "No active file open to add to Prompt Tower."
        );
        return;
      }

      const filePath = activeEditor.document.uri.fsPath;

      // Wait for initialization if needed
      if (!multiRootProvider) {
        vscode.window.showWarningMessage(
          "Prompt Tower is initializing. Please try again in a moment."
        );
        return;
      }

      // Make sure the provider is fully initialized
      if (
        !multiRootProvider.getRootNodes() ||
        multiRootProvider.getRootNodes().length === 0
      ) {
        vscode.window.showWarningMessage(
          "Prompt Tower is still loading files. Please try again in a moment."
        );
        return;
      }

      // Find the file node in the tree
      const fileNode = multiRootProvider.findNodeByPath(filePath);

      if (!fileNode) {
        vscode.window.showWarningMessage(
          `File "${activeEditor.document.fileName}" not found in Prompt Tower workspace. Make sure it's not ignored by .gitignore or .towerignore.`
        );
        return;
      }

      if (fileNode.isChecked) {
        vscode.window.showInformationMessage(
          `File "${fileNode.label}" is already selected in Prompt Tower.`
        );
        return;
      }

      // Select the file using the existing selection system
      await multiRootProvider.toggleNodeSelection(fileNode);
      scheduleEstimatedTokenPreviewUpdate();

      vscode.window.showInformationMessage(
        `✅ Added "${fileNode.label}" to Prompt Tower selection.`
      );
    }),

    vscode.commands.registerCommand("promptTower.openPromptTower", async () => {
      // Focus the Prompt Tower activity bar view (shows the tree views)
      await vscode.commands.executeCommand(
        "workbench.view.extension.prompt-tower"
      );

      // Open the Prompt Tower UI panel
      createOrShowWebviewPanel(context);

      vscode.window.showInformationMessage("Opened Prompt Tower interface.");
    }),

    // Right-click file preview
    vscode.commands.registerCommand("promptTower.previewFile", async (fileNode: FileNode) => {
      await showFilePreview(fileNode);
    }),

    vscode.commands.registerCommand("promptTower.refineFolderSelection", async (fileNode: FileNode) => {
      await multiRootProvider.refineFolderSelection(fileNode);
      invalidateWebviewPreview();
      scheduleEstimatedTokenPreviewUpdate();
    })
  );

  context.subscriptions.push(mainTreeView, multiRootProvider);

  // Don't automatically show the panel - let users open it when they want
  // vscode.commands.executeCommand("promptTower.showTowerUI");
}

export function deactivate() {
  if (webviewPanel) {
    webviewPanel.dispose();
  }

  fileSnapshotService?.clear();

  // Services will be disposed via context.subscriptions
}

function isFileNode(value: unknown): value is FileNode {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    "absolutePath" in value
  );
}
