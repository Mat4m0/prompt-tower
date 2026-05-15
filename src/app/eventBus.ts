import * as vscode from "vscode";

export class EventBus<T> {
  private readonly emitter = new vscode.EventEmitter<T>();
  readonly event = this.emitter.event;

  fire(value: T): void {
    this.emitter.fire(value);
  }

  dispose(): void {
    this.emitter.dispose();
  }
}

