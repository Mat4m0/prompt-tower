import { getWebviewStyles } from "./extension.webview.css";

export interface WebviewParams {
  nonce: string;
  cspSource: string;
  initialPrefix: string;
  initialSuffix: string;
  initialTreeType:
    | "fullFilesAndDirectories"
    | "fullDirectoriesOnly"
    | "selectedFilesOnly"
    | "none";
  initialExportFileName: string;
  initialExportFormat: "md" | "txt";
  initialExportLocation: "prompttower" | "workspaceRoot" | "customFolder";
  initialCustomFolderPath: string;
  initialCustomFolderPathMode: "relative" | "absolute";
  initialIncludeTimestamp: boolean;
  prefixCollapsed: boolean;
  suffixCollapsed: boolean;
}

export function getWebviewHtml(params: WebviewParams): string {
  const styles = getWebviewStyles();

  return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta http-equiv="Content-Security-Policy" content="
                default-src 'none';
                style-src ${params.cspSource} 'unsafe-inline';
                script-src 'nonce-${params.nonce}';
            ">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Prompt Tower UI</title>
            <style nonce="${params.nonce}">${styles}</style>
        </head>
        <body>
            <div id="app">
              <div id="header-bar">
                <h1>Prompt Tower</h1>
                <button id="showTreeButton" class="tree-toggle-btn" style="display: none;">
                  <svg viewBox="0 0 16 16" fill="currentColor">
                    <path d="M1.5 1a.5.5 0 0 0-.5.5v3a.5.5 0 0 1-1 0v-3A1.5 1.5 0 0 1 1.5 0h3a.5.5 0 0 1 0 1h-3zM11 .5a.5.5 0 0 1 .5-.5h3A1.5 1.5 0 0 1 16 1.5v3a.5.5 0 0 1-1 0v-3a.5.5 0 0 0-.5-.5h-3a.5.5 0 0 1-.5-.5zM.5 11a.5.5 0 0 1 .5.5v3a.5.5 0 0 0 .5.5h3a.5.5 0 0 1 0 1h-3A1.5 1.5 0 0 1 0 14.5v-3a.5.5 0 0 1 .5-.5zm15 0a.5.5 0 0 1 .5.5v3a1.5 1.5 0 0 1-1.5 1.5h-3a.5.5 0 0 1 0-1h3a.5.5 0 0 0 .5-.5v-3a.5.5 0 0 1 .5-.5z"/>
                    <path d="M3 5.5a.5.5 0 0 1 .5-.5h9a.5.5 0 0 1 0 1h-9a.5.5 0 0 1-.5-.5zM3 8a.5.5 0 0 1 .5-.5h9a.5.5 0 0 1 0 1h-9A.5.5 0 0 1 3 8zm0 2.5a.5.5 0 0 1 .5-.5h6a.5.5 0 0 1 0 1h-6a.5.5 0 0 1-.5-.5z"/>
                  </svg>
                  Open File Selector
                </button>
              </div>

              <div id="token-info">
                  <span>Selected Tokens:</span>
                  <span id="token-count">0</span>
                  <div id="spinner" class="spinner"></div>
                  <span id="token-status"></span>
              </div>

              <div class="toolbar-row">
                  <button id="clearButton">Clear Selected</button>
                  <button id="resetAllButton">Reset All</button>
              </div>

              <div id="prompt-prefix-container" class="textarea-container collapsible${params.prefixCollapsed ? " collapsed" : ""}">
                <div class="section-header" data-toggle="prefix">
                  <span class="collapse-icon">▶</span>
                  <label for="prompt-prefix">Prompt Prefix</label>
                </div>
                <div class="section-content">
                  <textarea id="prompt-prefix">${params.initialPrefix}</textarea>
                  <a class="select-previous-link" data-target="prefix">Select Previous...</a>
                </div>
              </div>

              <div id="prompt-suffix-container" class="textarea-container collapsible${params.suffixCollapsed ? " collapsed" : ""}">
                <div class="section-header" data-toggle="suffix">
                  <span class="collapse-icon">▶</span>
                  <label for="prompt-suffix">Prompt Suffix</label>
                </div>
                <div class="section-content">
                  <textarea id="prompt-suffix">${params.initialSuffix}</textarea>
                  <a class="select-previous-link" data-target="suffix">Select Previous...</a>
                </div>
              </div>

              <div class="action-groups">
                <div class="action-group">
                  <div class="action-buttons">
                    <button id="createContextButton">Create Context</button>
                  </div>
                  <div class="action-options">
                    <label class="checkbox-container">
                      <input type="checkbox" id="copyToClipboardCheckbox" checked>
                      <span class="checkmark"></span>
                      Copy to clipboard
                    </label>
                    <div class="tree-type-selector">
                      <label for="treeTypeSelect">Tree:</label>
                      <select id="treeTypeSelect">
                        <option value="selectedFilesOnly"${params.initialTreeType === "selectedFilesOnly" ? " selected" : ""}>Selected files only</option>
                        <option value="fullFilesAndDirectories"${params.initialTreeType === "fullFilesAndDirectories" ? " selected" : ""}>Full repo</option>
                        <option value="fullDirectoriesOnly"${params.initialTreeType === "fullDirectoriesOnly" ? " selected" : ""}>Directories only</option>
                        <option value="none"${params.initialTreeType === "none" ? " selected" : ""}>None</option>
                      </select>
                    </div>
                    <label class="checkbox-container">
                      <input type="checkbox" id="minifyCheckbox">
                      <span class="checkmark"></span>
                      Minify output
                    </label>
                    <label class="checkbox-container disabled">
                      <input type="checkbox" id="removeCommentsCheckbox" disabled>
                      <span class="checkmark"></span>
                      Remove comments
                      <span class="feature-badge">Soon</span>
                    </label>
                  </div>
                  <div class="sync-status-row">
                    <span id="sync-status"></span>
                  </div>
                </div>

                <div class="action-group">
                  <div class="action-buttons">
                    <button id="savePromptFileButton">Save Prompt File</button>
                  </div>
                  <div class="export-options-grid">
                    <label class="export-field">
                      <span>Filename</span>
                      <input type="text" id="exportFileName" value="${params.initialExportFileName}" spellcheck="false">
                    </label>
                    <label class="export-field">
                      <span>Format</span>
                      <select id="exportFormatSelect">
                        <option value="md"${params.initialExportFormat === "md" ? " selected" : ""}>.md</option>
                        <option value="txt"${params.initialExportFormat === "txt" ? " selected" : ""}>.txt</option>
                      </select>
                    </label>
                    <label class="export-field">
                      <span>Location</span>
                      <select id="exportLocationSelect">
                        <option value="prompttower"${params.initialExportLocation === "prompttower" ? " selected" : ""}>.prompttower/prompts</option>
                        <option value="workspaceRoot"${params.initialExportLocation === "workspaceRoot" ? " selected" : ""}>Project root</option>
                        <option value="customFolder"${params.initialExportLocation === "customFolder" ? " selected" : ""}>Custom folder</option>
                      </select>
                    </label>
                    <label class="checkbox-container export-checkbox">
                      <input type="checkbox" id="exportTimestampCheckbox"${params.initialIncludeTimestamp ? " checked" : ""}>
                      <span class="checkmark"></span>
                      Append timestamp
                    </label>
                  </div>
                  <label id="customExportPathField" class="export-field custom-export-path-field${params.initialExportLocation === "customFolder" ? "" : " hidden"}">
                    <span>Path type</span>
                    <select id="customExportPathModeSelect">
                      <option value="relative"${params.initialCustomFolderPathMode === "relative" ? " selected" : ""}>Relative</option>
                      <option value="absolute"${params.initialCustomFolderPathMode === "absolute" ? " selected" : ""}>Absolute</option>
                    </select>
                    <span>Custom folder</span>
                    <input
                      type="text"
                      id="customExportPathInput"
                      value="${params.initialCustomFolderPath}"
                      placeholder="${params.initialCustomFolderPathMode === "absolute" ? "/Users/me/prompts" : "prompts/chat-exports"}"
                      spellcheck="false"
                    >
                    <small id="customExportPathHelp" class="export-help-text">${params.initialCustomFolderPathMode === "absolute" ? "Uses the absolute filesystem path as entered." : "Relative to the project root."}</small>
                  </label>
                  <div class="export-status-row">
                    <span id="export-status">Saves the generated prompt as a real file.</span>
                    <div id="export-actions" class="export-actions hidden">
                      <a id="openSavedPromptFile">Open</a>
                      <a id="revealSavedPromptFile">Reveal</a>
                      <a id="copySavedPromptFilePath">Copy Path</a>
                    </div>
                  </div>
                </div>
              </div>

              <div id="preview-container">
                  <label for="context-preview">Context Preview
                  <a id="copy-preview-content" class="copy-preview-content">Copy</a>
                  <a id="expand-preview" class="expand-preview">Expand</a>
                  </label>
                  <span id="preview-status"></span>
                  <textarea id="context-preview"></textarea>
              </div>
            </div>

            <script nonce="${params.nonce}">
                (function() {
                    const vscode = acquireVsCodeApi();

                    const tokenCountElement = document.getElementById('token-count');
                    const tokenStatusElement = document.getElementById('token-status');
                    const spinnerElement = document.getElementById('spinner');
                    const prefixTextArea = document.getElementById('prompt-prefix');
                    const suffixTextArea = document.getElementById('prompt-suffix');
                    const previewTextArea = document.getElementById('context-preview');
                    const previewContainer = document.getElementById('preview-container');
                    const previewStatusElement = document.getElementById('preview-status');
                    const syncStatusElement = document.getElementById('sync-status');
                    const createContextButton = document.getElementById('createContextButton');
                    const copyToClipboardCheckbox = document.getElementById('copyToClipboardCheckbox');
                    const treeTypeSelect = document.getElementById('treeTypeSelect');
                    const minifyCheckbox = document.getElementById('minifyCheckbox');
                    const removeCommentsCheckbox = document.getElementById('removeCommentsCheckbox');
                    const savePromptFileButton = document.getElementById('savePromptFileButton');
                    const exportFileNameInput = document.getElementById('exportFileName');
                    const exportFormatSelect = document.getElementById('exportFormatSelect');
                    const exportLocationSelect = document.getElementById('exportLocationSelect');
                    const customExportPathField = document.getElementById('customExportPathField');
                    const customExportPathModeSelect = document.getElementById('customExportPathModeSelect');
                    const customExportPathInput = document.getElementById('customExportPathInput');
                    const customExportPathHelp = document.getElementById('customExportPathHelp');
                    const exportTimestampCheckbox = document.getElementById('exportTimestampCheckbox');
                    const exportStatusElement = document.getElementById('export-status');
                    const exportActionsElement = document.getElementById('export-actions');
                    let lastSavedPromptFilePath = '';

                    function setActionButtonsBusy(isBusy) {
                        [createContextButton, savePromptFileButton]
                            .filter(Boolean)
                            .forEach((button) => {
                                button.disabled = isBusy;
                            });
                    }

                    function getExportOptions() {
                        return {
                            fileName: exportFileNameInput?.value || 'prompt',
                            format: exportFormatSelect?.value || 'md',
                            location: exportLocationSelect?.value || 'prompttower',
                            customFolderPath: customExportPathInput?.value ?? '',
                            customFolderPathMode: customExportPathModeSelect?.value || 'relative',
                            includeTimestamp: exportTimestampCheckbox?.checked ?? true
                        };
                    }

                    function updateCustomFolderPathModeUi() {
                        const isAbsolute = customExportPathModeSelect?.value === 'absolute';
                        if (customExportPathInput) {
                            customExportPathInput.placeholder = isAbsolute ? '/Users/me/prompts' : 'prompts/chat-exports';
                        }
                        if (customExportPathHelp) {
                            customExportPathHelp.textContent = isAbsolute
                                ? 'Uses the absolute filesystem path as entered.'
                                : 'Relative to the project root.';
                        }
                    }

                    function updateCustomFolderVisibility() {
                        const showCustomFolder = exportLocationSelect?.value === 'customFolder';
                        customExportPathField?.classList.toggle('hidden', !showCustomFolder);
                        updateCustomFolderPathModeUi();
                    }

                    function syncExportOptions() {
                        updateCustomFolderVisibility();
                        vscode.postMessage({
                            command: 'updateExportOptions',
                            options: getExportOptions()
                        });
                    }

                    window.addEventListener('message', event => {
                        const message = event.data;
                        switch (message.command) {
                            case 'tokenUpdate':
                                if (message.payload && tokenCountElement && tokenStatusElement && spinnerElement) {
                                    const { count, isCounting } = message.payload;
                                    tokenCountElement.textContent = count.toLocaleString();
                                    if (isCounting) {
                                        tokenStatusElement.textContent = '(Calculating...)';
                                        spinnerElement.classList.add('visible');
                                    } else {
                                        tokenStatusElement.textContent = '';
                                        spinnerElement.classList.remove('visible');
                                    }
                                }
                                break;
                            case 'updatePrefix':
                                if (prefixTextArea && typeof message.text === 'string') {
                                    prefixTextArea.value = message.text;
                                }
                                break;
                            case 'updateSuffix':
                                if (suffixTextArea && typeof message.text === 'string') {
                                    suffixTextArea.value = message.text;
                                }
                                break;
                            case 'updatePreview':
                                if (message.payload && previewTextArea) {
                                    previewTextArea.value = message.payload.context;
                                    if (previewContainer && previewStatusElement) {
                                        previewContainer.classList.remove('invalidated');
                                        previewStatusElement.textContent = '';
                                    }
                                }
                                break;
                            case 'updateExportOptions':
                                if (message.payload) {
                                    if (exportFileNameInput && typeof message.payload.fileName === 'string') {
                                        exportFileNameInput.value = message.payload.fileName;
                                    }
                                    if (exportFormatSelect && typeof message.payload.format === 'string') {
                                        exportFormatSelect.value = message.payload.format;
                                    }
                                    if (exportLocationSelect && typeof message.payload.location === 'string') {
                                        exportLocationSelect.value = message.payload.location;
                                    }
                                    if (customExportPathInput && typeof message.payload.customFolderPath === 'string') {
                                        customExportPathInput.value = message.payload.customFolderPath;
                                    }
                                    if (customExportPathModeSelect && typeof message.payload.customFolderPathMode === 'string') {
                                        customExportPathModeSelect.value = message.payload.customFolderPathMode;
                                    }
                                    if (exportTimestampCheckbox && typeof message.payload.includeTimestamp === 'boolean') {
                                        exportTimestampCheckbox.checked = message.payload.includeTimestamp;
                                    }
                                    updateCustomFolderVisibility();
                                }
                                break;
                            case 'promptFileSaved':
                                if (message.payload && typeof message.payload.filePath === 'string') {
                                    lastSavedPromptFilePath = message.payload.filePath;
                                    if (exportStatusElement) {
                                        exportStatusElement.textContent = 'Saved ' + message.payload.fileName;
                                    }
                                    exportActionsElement?.classList.remove('hidden');
                                }
                                break;
                            case 'treeVisibilityChanged':
                                const showTreeBtn = document.getElementById('showTreeButton');
                                if (showTreeBtn) {
                                    showTreeBtn.style.display = message.visible ? 'none' : 'inline-flex';
                                }
                                break;
                            case 'invalidatePreview':
                                if (previewContainer && previewStatusElement) {
                                    previewContainer.classList.add('invalidated');
                                    previewStatusElement.textContent = '⚠️ Context may be out of sync. Click "Create Context" to update.';
                                }
                                break;
                            case 'syncStatus':
                                if (message.payload) {
                                    if (syncStatusElement) {
                                        syncStatusElement.textContent = message.payload.text || '';
                                    }
                                    setActionButtonsBusy(message.payload.busy === true);
                                }
                                break;
                        }
                    });

                    prefixTextArea?.addEventListener('input', (e) => {
                        vscode.postMessage({ command: 'updatePrefix', text: e.target.value });
                    });

                    suffixTextArea?.addEventListener('input', (e) => {
                        vscode.postMessage({ command: 'updateSuffix', text: e.target.value });
                    });

                    exportFileNameInput?.addEventListener('input', syncExportOptions);
                    exportFormatSelect?.addEventListener('change', syncExportOptions);
                    exportLocationSelect?.addEventListener('change', syncExportOptions);
                    customExportPathModeSelect?.addEventListener('change', syncExportOptions);
                    customExportPathInput?.addEventListener('input', syncExportOptions);
                    exportTimestampCheckbox?.addEventListener('change', syncExportOptions);

                    createContextButton?.addEventListener('click', () => {
                        if (createContextButton.disabled) {
                            return;
                        }

                        vscode.postMessage({ command: 'showToast', payload: { message: 'Generating context...' } });

                        if (previewContainer) {
                            previewContainer.classList.add('cyber-generating');
                            setTimeout(() => {
                                previewContainer.classList.remove('cyber-generating');
                            }, 750);
                        }

                        vscode.postMessage({
                            command: 'createContext',
                            options: {
                                treeType: treeTypeSelect?.value || 'fullFilesAndDirectories',
                                copyToClipboard: copyToClipboardCheckbox?.checked ?? true,
                                minify: minifyCheckbox?.checked ?? false,
                                removeComments: removeCommentsCheckbox?.checked ?? false
                            }
                        });
                    });

                    savePromptFileButton?.addEventListener('click', () => {
                        if (savePromptFileButton.disabled) {
                            return;
                        }

                        if (previewContainer) {
                            previewContainer.classList.add('cyber-generating');
                            setTimeout(() => {
                                previewContainer.classList.remove('cyber-generating');
                            }, 750);
                        }

                        if (exportStatusElement) {
                            exportStatusElement.textContent = 'Saving prompt file...';
                        }

                        vscode.postMessage({
                            command: 'savePromptFile',
                            options: {
                                ...getExportOptions(),
                                treeType: treeTypeSelect?.value || 'fullFilesAndDirectories',
                                minify: minifyCheckbox?.checked ?? false
                            }
                        });
                    });

                    document.getElementById('clearButton')?.addEventListener('click', () => {
                        vscode.postMessage({ command: 'clearSelections' });
                    });

                    document.getElementById('resetAllButton')?.addEventListener('click', () => {
                        vscode.postMessage({ command: 'resetAll' });
                    });

                    document.getElementById('showTreeButton')?.addEventListener('click', () => {
                        vscode.postMessage({ command: 'showTree' });
                    });

                    document.getElementById('copy-preview-content')?.addEventListener('click', () => {
                        if (previewTextArea) {
                            previewTextArea.select();
                            document.execCommand('copy');
                            vscode.postMessage({ command: 'showToast', payload: { message: 'Context copied to clipboard.' } });
                        }
                    });

                    document.getElementById('expand-preview')?.addEventListener('click', () => {
                        if (previewContainer) {
                            const expandButton = document.getElementById('expand-preview');
                            previewContainer.classList.toggle('expanded');

                            if (previewContainer.classList.contains('expanded')) {
                                if (expandButton) expandButton.textContent = 'Collapse';
                                setTimeout(() => {
                                    window.scrollBy({
                                      top: 492,
                                      behavior: 'smooth'
                                    });
                                }, 300);
                            } else {
                                if (expandButton) expandButton.textContent = 'Expand';
                                window.scrollTo({
                                  top: 0,
                                  behavior: 'smooth'
                                });
                            }
                        }
                    });

                    document.querySelectorAll('.section-header').forEach(header => {
                        header.addEventListener('click', () => {
                            const section = header.getAttribute('data-toggle');
                            const container = header.closest('.textarea-container');
                            if (container && section) {
                                container.classList.toggle('collapsed');
                                vscode.postMessage({
                                    command: 'toggleCollapse',
                                    section: section,
                                    collapsed: container.classList.contains('collapsed')
                                });
                            }
                        });
                    });

                    document.querySelectorAll('.select-previous-link').forEach(link => {
                        link.addEventListener('click', (e) => {
                            e.preventDefault();
                            const target = e.target.getAttribute('data-target');
                            vscode.postMessage({
                                command: 'selectPrevious',
                                target: target
                            });
                        });
                    });

                    document.getElementById('openSavedPromptFile')?.addEventListener('click', () => {
                        if (!lastSavedPromptFilePath) {
                            return;
                        }
                        vscode.postMessage({
                            command: 'openSavedPromptFile',
                            filePath: lastSavedPromptFilePath
                        });
                    });

                    document.getElementById('revealSavedPromptFile')?.addEventListener('click', () => {
                        if (!lastSavedPromptFilePath) {
                            return;
                        }
                        vscode.postMessage({
                            command: 'revealSavedPromptFile',
                            filePath: lastSavedPromptFilePath
                        });
                    });

                    document.getElementById('copySavedPromptFilePath')?.addEventListener('click', () => {
                        if (!lastSavedPromptFilePath) {
                            return;
                        }
                        vscode.postMessage({
                            command: 'copySavedPromptFilePath',
                            filePath: lastSavedPromptFilePath
                        });
                    });

                    vscode.postMessage({ command: 'webviewReady' });
                    updateCustomFolderVisibility();
                }());
            </script>
        </body>
        </html>`;
}
