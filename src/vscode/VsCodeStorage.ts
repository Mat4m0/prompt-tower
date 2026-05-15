import * as vscode from "vscode";

export class VsCodeStorage {
  constructor(private memento: vscode.Memento) {}

  get<T>(key: string, fallback: T): T {
    return this.memento.get<T>(key, fallback);
  }

  update(key: string, value: unknown): Thenable<void> {
    return this.memento.update(key, value);
  }
}

