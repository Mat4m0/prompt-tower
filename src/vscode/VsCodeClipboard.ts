import * as vscode from 'vscode'

export class VsCodeClipboard {
  writeText(text: string): Thenable<void> {
    return vscode.env.clipboard.writeText(text)
  }
}
