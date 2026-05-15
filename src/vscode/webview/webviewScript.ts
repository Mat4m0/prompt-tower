export function getWebviewScript(initialStateJson: string): string {
  return `
    const vscode = acquireVsCodeApi();
    let state = ${initialStateJson};

    const $ = (id) => document.getElementById(id);
    const post = (message) => vscode.postMessage(message);

    function render(next) {
      state = next;
      renderTokenSummary();
      $("presetSelect").innerHTML = '<option value="">Inline prefix</option>' + state.promptPresets.map(p => '<option value="' + p.id + '"' + (p.id === state.activePresetId ? ' selected' : '') + '>' + escapeHtml(p.name) + '</option>').join('');
      $("inlinePrefix").value = state.inlinePrefix || '';
      renderVersions();
      $("treeMode").value = state.treeMode;
      $("outputMode").checked = state.outputMode === 'compact';
      $("fileName").value = state.exportOptions.fileName;
      $("format").value = state.exportOptions.format;
      $("includeTimestamp").checked = state.exportOptions.includeTimestamp;
    }

    function currentTreeMode() { return $("treeMode").value; }
    function currentOutputMode() { return $("outputMode").checked ? "compact" : "readable"; }
    function formatCompactNumber(value) {
      if (value >= 1000000) return (Math.round(value / 10000) / 100).toLocaleString() + "M";
      if (value >= 1000) return Math.round(value / 1000).toLocaleString() + "k";
      return value.toLocaleString();
    }
    function renderTokenSummary() {
      $("tokenSummary").innerHTML = state.tokenSummaries.map(summary =>
        '<span class="token-chip"><span class="token-label">' + escapeHtml(summary.label) + '</span><span class="token-value">~' + formatCompactNumber(summary.tokens) + '</span></span>'
      ).join('');
      $("tokenProfileChecks").innerHTML = state.tokenProfiles.map(profile => {
        const checked = state.visibleTokenProfileIds.includes(profile.id) ? ' checked' : '';
        return '<label class="popover-check"><input type="checkbox" value="' + profile.id + '"' + checked + '> ' + escapeHtml(profile.label) + '</label>';
      }).join('');
      Array.from($("tokenProfileChecks").querySelectorAll("input")).forEach(input => {
        input.addEventListener("change", () => {
          const enabled = Array.from($("tokenProfileChecks").querySelectorAll("input"))
            .filter(item => item.checked)
            .map(item => item.value);
          post({ type: "tokenSummary.setProfiles", profileIds: enabled });
        });
      });
    }
    function exportOptions() {
      return {
        fileName: $("fileName").value || "prompt",
        format: $("format").value || "md",
        location: "promptFolder",
        customFolderPath: "prompts",
        customFolderPathMode: "relative",
        includeTimestamp: $("includeTimestamp").checked
      };
    }

    function activePreset() {
      return state.promptPresets.find(p => p.id === state.activePresetId) || null;
    }

    function renderVersions() {
      const preset = activePreset();
      $("savePreset").disabled = !preset;
      $("duplicatePreset").disabled = !preset;
      $("deletePreset").disabled = !preset;
      $("restoreVersion").disabled = !preset;
      $("versionRow").style.display = preset ? "flex" : "none";
      if (!preset) {
        $("versionSelect").innerHTML = "";
        return;
      }
      $("versionSelect").innerHTML = preset.versions
        .slice()
        .reverse()
        .map(v => '<option value="' + v.id + '"' + (v.current ? ' selected' : '') + '>' + versionLabel(v) + '</option>')
        .join('');
    }

    function versionLabel(version) {
      const date = new Date(version.createdAt);
      const label = Number.isNaN(date.valueOf()) ? version.createdAt : date.toLocaleString();
      return escapeHtml((version.current ? 'current · ' : '') + label);
    }

    function escapeHtml(value) {
      return String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
    }

    $("tokenSettings").addEventListener("click", () => {
      $("tokenSettingsPopover").hidden = !$("tokenSettingsPopover").hidden;
    });
    window.addEventListener("click", event => {
      if (!$("tokenSettingsPopover").hidden && !$("tokenSettingsPopover").contains(event.target) && event.target !== $("tokenSettings")) {
        $("tokenSettingsPopover").hidden = true;
      }
    });
    $("presetSelect").addEventListener("change", () => post({ type: "prefix.selectPreset", presetId: $("presetSelect").value || null }));
    $("inlinePrefix").addEventListener("input", () => post({ type: "prefix.inlineChanged", text: $("inlinePrefix").value }));
    $("createPreset").addEventListener("click", () => {
      const name = $("presetName").value.trim();
      if (name) {
        post({ type: "prefix.createPreset", name, text: $("inlinePrefix").value });
        $("presetName").value = "";
      }
    });
    $("savePreset").addEventListener("click", () => {
      if (state.activePresetId) post({ type: "prefix.saveVersion", presetId: state.activePresetId, text: $("inlinePrefix").value });
    });
    $("restoreVersion").addEventListener("click", () => {
      if (state.activePresetId && $("versionSelect").value) {
        post({ type: "prefix.restoreVersion", presetId: state.activePresetId, versionId: $("versionSelect").value });
      }
    });
    $("duplicatePreset").addEventListener("click", () => {
      if (state.activePresetId) post({ type: "prefix.duplicatePreset", presetId: state.activePresetId });
    });
    $("deletePreset").addEventListener("click", () => {
      if (state.activePresetId && confirm("Delete this prefix preset?")) {
        post({ type: "prefix.deletePreset", presetId: state.activePresetId });
      }
    });
    $("treeMode").addEventListener("change", () => post({ type: "context.optionsChanged", treeMode: currentTreeMode(), outputMode: currentOutputMode() }));
    $("outputMode").addEventListener("change", () => post({ type: "context.optionsChanged", treeMode: currentTreeMode(), outputMode: currentOutputMode() }));
    $("fileName").addEventListener("input", () => post({ type: "export.optionsChanged", options: exportOptions() }));
    $("format").addEventListener("change", () => post({ type: "export.optionsChanged", options: exportOptions() }));
    $("includeTimestamp").addEventListener("change", () => post({ type: "export.optionsChanged", options: exportOptions() }));
    $("create").addEventListener("click", () => post({ type: "context.create", copy: $("copy").checked, treeMode: currentTreeMode(), outputMode: currentOutputMode() }));
    $("copyPreview").addEventListener("click", () => post({ type: "context.copyPreview", text: $("preview").value }));
    $("save").addEventListener("click", () => post({ type: "context.save", options: exportOptions(), treeMode: currentTreeMode(), outputMode: currentOutputMode() }));
    $("clear").addEventListener("click", () => post({ type: "selection.clear" }));

    window.addEventListener("message", event => {
      const message = event.data;
      if (message.type === "state.changed") render(message.state);
      if (message.type === "context.previewUpdated") $("preview").value = message.text;
    });

    render(state);
    post({ type: "ready" });
  `
}
