import * as vscode from "vscode";
import { getWebviewHtml } from "../vscode/webview/webviewHtml";
import { FileTreeProvider } from "../vscode/views/FileTreeProvider";
import { SelectionFiltersProvider } from "../vscode/views/SelectionFiltersProvider";
import { registerCommands } from "./commandRegistry";
import { createServiceContainer } from "./serviceContainer";
import { MessageRouter } from "./messageRouter";
import { isWebviewMessage } from "../vscode/webview/webviewMessages";
import { WorkspaceSession } from "./workspaceSession";

const VIEW_TYPE = "promptLupinum.context";

export async function bootstrapPromptLupinum(
  context: vscode.ExtensionContext
): Promise<vscode.Disposable> {
  const services = createServiceContainer(context);
  context.subscriptions.push(services.logger);
  services.logger.info("[bootstrap] activating prompt.lupinum");
  await services.promptPresets.migrateOldPrefixHistory();
  services.fileSelection.restoreIntent(
    services.fileIndex.getSnapshot(),
    services.workspaceState.getSelectionIntent()
  );

  const disposables: vscode.Disposable[] = [];
  let panel: vscode.WebviewPanel | undefined;
  let router: MessageRouter | undefined;

  const fileTreeProvider = new FileTreeProvider(
    services.fileIndex,
    services.fileSelection
  );
  const selectionFiltersProvider = new SelectionFiltersProvider(
    services.fileSelection
  );

  const fileTree = vscode.window.createTreeView("promptLupinum.files", {
    treeDataProvider: fileTreeProvider,
    canSelectMany: true,
    showCollapseAll: true,
    manageCheckboxStateManually: true,
  });
  const filtersTree = vscode.window.createTreeView(
    "promptLupinum.selectionFilters",
    {
      treeDataProvider: selectionFiltersProvider,
      manageCheckboxStateManually: true,
    }
  );
  disposables.push(fileTree, filtersTree);

  services.fileSelection.onDidChange(() => {
    void services.workspaceState.setSelectionIntent(
      services.fileSelection.getPersistedIntent()
    );
    void router?.postState();
  });

  const showPanel = async () => {
    if (panel) {
      panel.reveal(vscode.ViewColumn.Beside);
      return;
    }
    panel = vscode.window.createWebviewPanel(
      VIEW_TYPE,
      "prompt.lupinum",
      vscode.ViewColumn.Beside,
      { enableScripts: true, retainContextWhenHidden: true }
    );
    const currentRouter = new MessageRouter(
      services,
      panel,
      services.workspace.getPrimaryWorkspaceRoot() ?? process.cwd()
    );
    router = currentRouter;
    panel.webview.html = getWebviewHtml({
      nonce: createNonce(),
      cspSource: panel.webview.cspSource,
      state: await currentRouter.createState(),
    });
    panel.webview.onDidReceiveMessage(async (message) => {
      if (!isWebviewMessage(message)) {
        return;
      }
      try {
        await currentRouter.handle(message);
      } catch (error) {
        vscode.window.showErrorMessage(String(error));
      }
    });
    panel.onDidDispose(() => {
      panel = undefined;
      router = undefined;
    });
  };

  disposables.push(
    fileTree.onDidChangeVisibility((event) => {
      if (event.visible) {
        void showPanel();
      }
    }),
    fileTree.onDidChangeCheckboxState((event) => {
      for (const [node] of event.items) {
        services.fileSelection.toggleNode(services.fileIndex.getSnapshot(), node.id);
      }
    }),
    filtersTree.onDidChangeCheckboxState((event) => {
      for (const [node] of event.items) {
        services.fileSelection.setFileKindExcluded(
          services.fileIndex.getSnapshot(),
          node.group.id,
          !node.group.excluded
        );
      }
    })
  );

  registerCommands({
    context,
    services,
    fileTreeProvider,
    selectionFiltersProvider,
    showPanel,
  });

  const session = new WorkspaceSession(context, services);
  session.start();
  void refreshIndex(services, "startup");

  return new vscode.Disposable(() => {
    for (const disposable of disposables) {
      disposable.dispose();
    }
    panel?.dispose();
  });
}

async function refreshIndex(
  services: ReturnType<typeof createServiceContainer>,
  reason: string
): Promise<void> {
  try {
    services.logger.info(`[refresh] requested: ${reason}`);
    services.fileIndex.markDirty();
    await services.fileIndex.ensureFresh();
    services.fileSelection.reconcile(services.fileIndex.getSnapshot());
    services.logger.info(`[refresh] complete: ${reason}`);
  } catch (error) {
    services.logger.error(`[refresh] failed: ${reason}`, error);
    vscode.window.showErrorMessage(`prompt.lupinum refresh failed: ${String(error)}`);
  }
}

function createNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let index = 0; index < 32; index++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
