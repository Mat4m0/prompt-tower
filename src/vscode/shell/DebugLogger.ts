import * as vscode from "vscode";

export class DebugLogger {
  private readonly output = vscode.window.createOutputChannel("prompt.lupinum");

  info(message: string): void {
    this.output.appendLine(`${new Date().toISOString()} ${message}`);
  }

  error(message: string, error: unknown): void {
    this.output.appendLine(`${new Date().toISOString()} ${message}`);
    this.output.appendLine(String(error));
  }

  show(): void {
    this.output.show(true);
  }

  dispose(): void {
    this.output.dispose();
  }
}
