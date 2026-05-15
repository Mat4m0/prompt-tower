export function getWebviewStyles(): string {
  return `
    body {
      margin: 0;
      padding: 16px;
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      font-family: var(--vscode-font-family);
    }
    #app { max-width: 1120px; }
    h1 { margin: 0 0 14px; font-size: 24px; }
    .bar, .panel {
      border: 1px solid var(--vscode-panel-border);
      border-radius: 6px;
      padding: 12px;
      margin-bottom: 12px;
      background: var(--vscode-sideBar-background);
    }
    .row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .row + .row { margin-top: 10px; }
    select, input, textarea, button {
      font: inherit;
      color: var(--vscode-input-foreground);
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border);
      border-radius: 4px;
      padding: 5px 8px;
    }
    button {
      color: var(--vscode-button-foreground);
      background: var(--vscode-button-background);
      border-color: var(--vscode-button-background);
      cursor: pointer;
    }
    button.secondary {
      color: var(--vscode-button-secondaryForeground);
      background: var(--vscode-button-secondaryBackground);
      border-color: var(--vscode-button-secondaryBackground);
    }
    button.ghost {
      color: var(--vscode-descriptionForeground);
      background: transparent;
      border-color: transparent;
    }
    button.danger { color: var(--vscode-errorForeground); }
    button:disabled {
      opacity: 0.55;
      cursor: default;
    }
    button:hover { background: var(--vscode-button-hoverBackground); }
    label { color: var(--vscode-descriptionForeground); font-weight: 600; }
    .metric { font-weight: 700; color: var(--vscode-textLink-foreground); }
    .muted { color: var(--vscode-descriptionForeground); }
    textarea {
      width: 100%;
      box-sizing: border-box;
      min-height: 90px;
      resize: vertical;
      font-family: var(--vscode-editor-font-family);
    }
    #preview { min-height: 420px; }
    .control-panel { padding: 14px 16px; }
    .control-grid {
      display: grid;
      grid-template-columns: minmax(220px, 1.45fr) minmax(84px, 0.38fr) minmax(180px, 1fr);
      gap: 12px;
      align-items: end;
    }
    .field {
      display: grid;
      gap: 6px;
      min-width: 0;
    }
    .field select,
    .field input {
      width: 100%;
      box-sizing: border-box;
      min-height: 32px;
    }
    .action-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 14px;
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px solid var(--vscode-panel-border);
      flex-wrap: wrap;
    }
    .toggle-group,
    .button-group {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }
    .check {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      white-space: nowrap;
      font-weight: 600;
    }
    .check input { margin: 0; }
    #create { min-width: 132px; }
    .name-input { width: 180px; }
    .subtle-row {
      padding-top: 6px;
      border-top: 1px solid var(--vscode-panel-border);
    }
    .prefix-editor { display: grid; grid-template-columns: 1fr auto auto; gap: 8px; align-items: start; }
    @media (max-width: 760px) {
      .control-grid { grid-template-columns: 1fr; }
      .action-row { align-items: flex-start; }
      .button-group { width: 100%; }
      .button-group button { flex: 1 1 auto; }
      .prefix-editor { grid-template-columns: 1fr; }
    }
  `;
}
