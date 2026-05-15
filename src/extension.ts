import * as vscode from "vscode";
import { bootstrapPromptLupinum } from "./app/bootstrap";

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const app = await bootstrapPromptLupinum(context);
  context.subscriptions.push(app);
}

export function deactivate(): void {}
