export function getWebviewStyles(): string {
  return `
        body {
            padding: 1em;
            color: var(--vscode-editor-foreground);
            background-color: var(--vscode-editor-background);
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            line-height: 1.4;
            box-sizing: border-box;
        }
        #app {
          display: flex;
          flex-direction: column;
          min-height: 100vh;
        }
        #header-bar {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 0.8em;
            border-bottom: 1px solid var(--vscode-separator-foreground);
            padding-bottom: 0.3em;
        }
        h1 {
            margin: 0;
            font-size: 1.5em;
        }
        .tree-toggle-btn {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 4px 14px;
            background: var(--vscode-editorWarning-background, rgba(255, 140, 0, 0.15));
            color: var(--vscode-editorWarning-foreground, #ff8c00);
            border: 1px solid var(--vscode-editorWarning-border, rgba(255, 140, 0, 0.3));
            border-radius: 4px;
            font-size: 11px;
            font-family: var(--vscode-font-family);
            cursor: pointer;
            font-weight: 500;
        }
        .tree-toggle-btn:hover {
            background: var(--vscode-editorWarning-background, rgba(255, 140, 0, 0.25));
        }
        .tree-toggle-btn svg {
            width: 14px;
            height: 14px;
            opacity: 0.9;
        }
        #token-info {
            margin-bottom: 1em;
            padding: 10px 12px;
            border: 1px solid var(--vscode-editorWidget-border, #ccc);
            border-radius: 4px;
            background-color: var(--vscode-editorWidget-background, #f0f0f0);
            display: flex;
            align-items: center;
            gap: 8px;
            flex-shrink: 0;
        }
	        #token-count {
	            font-weight: bold;
	            font-size: 1.1em;
	            color: var(--vscode-charts-blue);
	        }
	        #token-cost {
	            color: var(--vscode-descriptionForeground, #777);
	            font-size: 0.95em;
	        }
	        #tokenProfileSelect {
	            background: var(--vscode-dropdown-background);
	            color: var(--vscode-dropdown-foreground);
	            border: 1px solid var(--vscode-dropdown-border);
	            border-radius: 3px;
	            padding: 3px 6px;
	            font-size: 0.95em;
	            cursor: pointer;
	            max-width: 220px;
	        }
	        #token-status {
	            font-style: italic;
	            color: var(--vscode-descriptionForeground, #777);
            flex-grow: 1;
        }
        .spinner {
            display: inline-block;
            width: 1em;
            height: 1em;
            border: 2px solid currentColor;
            border-right-color: transparent;
            border-radius: 50%;
            animation: spinner-border .75s linear infinite;
            vertical-align: middle;
            opacity: 0;
            transition: opacity 0.2s ease-in-out;
            margin-left: 5px;
        }
        .spinner.visible {
            opacity: 1;
        }
        @keyframes spinner-border {
            to { transform: rotate(360deg); }
        }
        button {
             color: var(--vscode-button-foreground);
             background-color: var(--vscode-button-background);
             border: 1px solid var(--vscode-button-border, transparent);
             padding: 5px 10px;
             cursor: pointer;
             border-radius: 2px;
        }
        button:hover {
             background-color: var(--vscode-button-hoverBackground);
        }
        .toolbar-row {
            margin-bottom: 1em;
        }
        .action-groups {
            display: flex;
            flex-direction: row;
            gap: 16px;
            margin-bottom: 20px;
        }
        .action-group {
            display: flex;
            flex-direction: column;
            gap: 12px;
            padding: 16px;
            background: var(--vscode-editorWidget-background);
            border: 1px solid var(--vscode-editorWidget-border);
            border-radius: 8px;
            flex: 1;
        }
        .action-buttons {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .action-options {
            display: flex;
            align-items: center;
            gap: 12px;
            font-size: 0.9em;
            color: var(--vscode-descriptionForeground);
            flex-wrap: wrap;
        }
        .checkbox-container {
            display: flex;
            align-items: center;
            gap: 6px;
            cursor: pointer;
            margin: 0;
            white-space: nowrap;
        }
        .checkbox-container input[type="checkbox"] {
            margin: 0;
            width: 16px;
            height: 16px;
            cursor: pointer;
        }
        .checkbox-container.disabled {
            opacity: 0.6;
            cursor: not-allowed;
        }
        .checkbox-container.disabled input {
            cursor: not-allowed;
        }
        .tree-type-selector {
            display: flex;
            align-items: center;
            gap: 6px;
            white-space: nowrap;
        }
        .tree-type-selector label {
            margin: 0;
            font-weight: normal;
            color: var(--vscode-descriptionForeground);
        }
        .tree-type-selector select {
            background: var(--vscode-dropdown-background);
            color: var(--vscode-dropdown-foreground);
            border: 1px solid var(--vscode-dropdown-border);
            border-radius: 3px;
            padding: 3px 6px;
            font-size: 0.9em;
            cursor: pointer;
        }
        .feature-badge {
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            padding: 2px 6px;
            border-radius: 10px;
            font-size: 0.75em;
            font-weight: 500;
            margin-left: 4px;
        }
        .export-options-grid {
            display: grid;
            grid-template-columns: minmax(0, 2fr) minmax(120px, 0.8fr);
            gap: 12px;
            align-items: end;
        }
        .export-field {
            display: flex;
            flex-direction: column;
            gap: 6px;
            margin: 0;
            font-weight: normal;
            min-width: 0;
        }
        .export-field span {
            color: var(--vscode-descriptionForeground);
            font-size: 0.9em;
            font-weight: 500;
        }
        .custom-export-path-field {
            margin-top: -4px;
        }
        .export-field input,
        .export-field select {
            width: 100%;
            box-sizing: border-box;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
            padding: 6px 8px;
            font-size: 0.95em;
        }
        .export-help-text {
            color: var(--vscode-descriptionForeground);
            font-size: 0.85em;
        }
        .export-checkbox {
            align-self: center;
            min-height: 32px;
        }
        .export-status-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            flex-wrap: wrap;
            color: var(--vscode-descriptionForeground);
            font-size: 0.9em;
        }
        .export-actions {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .hidden {
            display: none !important;
        }
        textarea {
          width: 100%;
          box-sizing: border-box;
          padding: 8px;
          font-family: var(--vscode-font-family);
          font-size: var(--vscode-font-size);
          color: var(--vscode-input-foreground);
          background-color: var(--vscode-input-background);
          border: 1px solid var(--vscode-input-border);
          border-radius: 2px;
          min-height: 80px;
          resize: vertical;
        }
        .textarea-container {
          margin-bottom: 20px;
          display: flex;
          flex-direction: column;
        }
        label {
          margin-bottom: 0.4em;
          font-weight: bold;
          color: var(--vscode-descriptionForeground);
        }
        .textarea-container.collapsible .section-header {
          display: flex;
          align-items: center;
          cursor: pointer;
          padding: 8px 0;
          user-select: none;
        }
        .textarea-container.collapsible .section-header:hover {
          opacity: 0.8;
        }
        .textarea-container.collapsible .section-header label {
          cursor: pointer;
          margin-bottom: 0;
        }
        .collapse-icon {
          margin-right: 8px;
          font-size: 0.8em;
          transition: transform 0.2s ease;
          display: inline-block;
        }
        .textarea-container.collapsible:not(.collapsed) .collapse-icon {
          transform: rotate(90deg);
        }
        .textarea-container.collapsible .section-content {
          max-height: 500px;
          overflow: hidden;
          transition: max-height 0.3s ease, opacity 0.2s ease;
          position: relative;
        }
        .textarea-container.collapsible.collapsed .section-content {
          max-height: 0;
          opacity: 0;
          pointer-events: none;
        }
        .select-previous-link {
          display: block;
          text-align: right;
          margin-top: 4px;
          font-size: 0.85em !important;
          color: var(--vscode-textLink-foreground);
          cursor: pointer;
        }
        .select-previous-link:hover {
          color: var(--vscode-textLink-activeForeground);
        }
        .sync-status-row {
          margin-top: 10px;
          min-height: 1.2em;
        }
        #sync-status {
          font-size: 0.9em;
          color: var(--vscode-descriptionForeground);
        }
        #preview-container {
            display: flex;
            flex-direction: column;
            flex-grow: 1;
            min-height: 0;
            border-top: 1px solid var(--vscode-separator-foreground);
            padding-top: 1em;
        }
        a {
          cursor: pointer !important;
          margin-left: 5px !important;
          font-size: 0.9em !important;
          font-weight: 300 !important;
        }
        #preview-status {
          font-size: 0.9em;
          color: var(--vscode-descriptionForeground);
          min-height: 1.2em;
        }
        #context-preview {
            flex-grow: 1;
            height: 256px;
            min-height: 100px;
            border: 1px solid var(--vscode-input-border);
            background-color: var(--vscode-editorWidget-background);
            color: var(--vscode-input-foreground);
            overflow-y: auto;
            white-space: pre-wrap;
            word-wrap: break-word;
            font-family: var(--vscode-editor-font-family, monospace);
            transition: height 0.3s ease-in-out;
        }
        #preview-container.expanded #context-preview {
          height: 748px;
        }
        #preview-container.invalidated #context-preview,
        #preview-container.invalidated #context-preview:focus,
        #preview-container.invalidated #context-preview:hover,
        #preview-container.invalidated #context-preview:active {
          border: 1px solid var(--vscode-inputValidation-warningForeground, orange) !important;
          border-color: var(--vscode-inputValidation-warningForeground, orange) !important;
        }
        #preview-container.invalidated #preview-status {
            color: var(--vscode-inputValidation-warningForeground, orange);
        }
        #preview-container.cyber-generating #context-preview {
            background: linear-gradient(
                90deg,
                var(--vscode-input-background) 0%,
                var(--vscode-input-background) 20%,
                var(--vscode-charts-blue) 40%,
                var(--vscode-charts-green) 50%,
                var(--vscode-charts-blue) 60%,
                var(--vscode-input-background) 80%,
                var(--vscode-input-background) 100%
            );
            background-size: 200% 100%;
            animation: shimmer-bg 4s;
            box-shadow: 0 0 20px rgba(var(--vscode-charts-blue), 0.2);
            opacity: 0.45;
        }
        #preview-container.cyber-generating #context-preview::selection {
            background: rgba(255, 255, 255, 0.3);
        }
        @keyframes shimmer-bg {
           0% {
               background-position: 200% 0;
               box-shadow: 0 0 5px rgba(var(--vscode-charts-blue), 0.05);
           }
           25% {
               background-position: 100% 0;
               box-shadow: 0 0 10px rgba(var(--vscode-charts-blue), 0.1);
           }
           50% {
               background-position: 0% 0;
               box-shadow: 0 0 15px rgba(var(--vscode-charts-blue), 0.15);
           }
           75% {
               background-position: -100% 0;
               box-shadow: 0 0 10px rgba(var(--vscode-charts-blue), 0.1);
           }
           100% {
               background-position: -200% 0;
               box-shadow: 0 0 5px rgba(var(--vscode-charts-blue), 0.05);
           }
       }
       @media (max-width: 900px) {
           .action-groups {
               flex-direction: column;
           }
           .export-options-grid {
               grid-template-columns: 1fr;
           }
       }
    `;
}
