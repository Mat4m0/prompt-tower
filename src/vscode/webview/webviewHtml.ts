import type { ContextPanelState } from "./webviewMessages";
import { getWebviewScript } from "./webviewScript";
import { getWebviewStyles } from "./webviewStyles";

export function getWebviewHtml(params: {
  nonce: string;
  cspSource: string;
  state: ContextPanelState;
}): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${params.cspSource} 'unsafe-inline'; script-src 'nonce-${params.nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>prompt.lupinum</title>
  <style nonce="${params.nonce}">${getWebviewStyles()}</style>
</head>
<body>
  <div id="app">
    <h1>prompt.lupinum</h1>
    <div class="bar">
      <div class="row">
        <select id="tokenProfile" aria-label="Token profile"></select>
        <span id="tokenMetric" class="metric"></span>
      </div>
    </div>

    <div class="panel">
      <div class="row">
        <label for="presetSelect">Prefix</label>
        <select id="presetSelect"></select>
        <input id="presetName" class="name-input" placeholder="New preset name" spellcheck="false">
        <button id="createPreset" class="secondary">New</button>
        <button id="savePreset" class="secondary">Save Version</button>
        <button id="duplicatePreset" class="secondary">Duplicate</button>
        <button id="deletePreset" class="secondary danger">Delete</button>
      </div>
      <div class="row">
        <textarea id="inlinePrefix" placeholder="Write a reusable prefix or select a preset"></textarea>
      </div>
      <div id="versionRow" class="row subtle-row">
        <label for="versionSelect">Versions</label>
        <select id="versionSelect"></select>
        <button id="restoreVersion" class="secondary">Restore</button>
      </div>
    </div>

    <div class="panel control-panel">
      <div class="control-grid">
        <label class="field field-tree">Tree
          <select id="treeMode">
            <option value="selectedFilesOnly">Selected files only</option>
            <option value="fullFilesAndDirectories">Full repo</option>
            <option value="fullDirectoriesOnly">Directories only</option>
            <option value="none">None</option>
          </select>
        </label>
        <label class="field field-format">Format
          <select id="format">
            <option value="md">.md</option>
            <option value="txt">.txt</option>
          </select>
        </label>
        <label class="field field-name">Filename
          <input id="fileName" spellcheck="false">
        </label>
      </div>
      <div class="action-row">
        <div class="toggle-group">
          <label class="check"><input id="includeTimestamp" type="checkbox"> Timestamp</label>
          <label class="check"><input id="outputMode" type="checkbox"> Compact</label>
          <label class="check"><input id="copy" type="checkbox" checked> Copy after create</label>
        </div>
        <div class="button-group">
          <button id="create">Create Context</button>
          <button id="copyPreview" class="secondary">Copy Preview</button>
          <button id="save" class="secondary">Save</button>
          <button id="clear" class="ghost">Clear Selection</button>
        </div>
      </div>
    </div>

    <div class="panel">
      <label for="preview">Preview</label>
      <textarea id="preview" spellcheck="false"></textarea>
    </div>
  </div>
  <script nonce="${params.nonce}">${getWebviewScript(JSON.stringify(params.state).replace(/</g, "\\u003c"))}</script>
</body>
</html>`;
}
