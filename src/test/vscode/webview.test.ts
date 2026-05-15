import { test } from 'vite-plus/test'
import assert from 'node:assert/strict'
import { normalizePromptExportOptions } from '../../core/export/ExportOptions'
import { getWebviewHtml } from '../../vscode/webview/webviewHtml'
import { isWebviewMessage } from '../../vscode/webview/webviewMessages'
import { getWebviewScript } from '../../vscode/webview/webviewScript'

test('webview message guard rejects unknown and malformed messages', () => {
  assert.equal(isWebviewMessage({ type: 'ready' }), true)
  assert.equal(isWebviewMessage({ type: 'unknown.command' }), false)
  assert.equal(isWebviewMessage({ type: 'context.copyPreview', text: 'preview' }), true)
  assert.equal(isWebviewMessage({ type: 'context.copyPreview' }), false)
  assert.equal(
    isWebviewMessage({
      type: 'tokenSummary.setProfiles',
      profileIds: ['openai', 'gemini'],
    }),
    true,
  )
  assert.equal(
    isWebviewMessage({
      type: 'prefix.restoreVersion',
      presetId: 'p1',
      versionId: 'v1',
    }),
    true,
  )
  assert.equal(isWebviewMessage({ type: 'prefix.restoreVersion', presetId: 'p1' }), false)
})

test('webview script only references rendered element ids', () => {
  const html = getWebviewHtml({
    nonce: 'test',
    cspSource: 'vscode-resource:',
    state: {
      tokenProfiles: [
        { id: 'claude', label: 'Claude' },
        { id: 'openai', label: 'OpenAI' },
        { id: 'gemini', label: 'Gemini' },
      ],
      visibleTokenProfileIds: ['claude', 'openai', 'gemini'],
      tokenSummaries: [],
      promptPresets: [],
      activePresetId: null,
      inlinePrefix: '',
      treeMode: 'selectedFilesOnly',
      outputMode: 'readable',
      exportOptions: normalizePromptExportOptions({}),
      selectionSummary: { selectedFiles: 0, selectedTokens: 0 },
      syncStatus: 'idle',
    },
  })
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]))
  const script = getWebviewScript('{}')
  const referencedIds = new Set([...script.matchAll(/\$\("([^"]+)"\)/g)].map((match) => match[1]))

  for (const id of referencedIds) {
    assert.ok(ids.has(id), `missing webview element id: ${id}`)
  }
})
