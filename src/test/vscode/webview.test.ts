import { test } from 'vite-plus/test'
import assert from 'node:assert/strict'
import { normalizePromptExportOptions } from '../../core/export/ExportOptions'
import { getWebviewHtml } from '../../vscode/webview/webviewHost'
import { isWebviewMessage } from '../../shared/messages'
import type { ContextPanelState } from '../../shared/messages'

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

test('webview message guard accepts every variant', () => {
  const variants = [
    { type: 'ready' },
    { type: 'selection.clear' },
    { type: 'tokenSummary.setProfiles', profileIds: ['openai'] },
    { type: 'prefix.inlineChanged', text: 'hello' },
    { type: 'prefix.selectPreset', presetId: 'p1' },
    { type: 'prefix.selectPreset', presetId: null },
    { type: 'prefix.createPreset', name: 'new', text: 'body' },
    { type: 'prefix.saveVersion', presetId: 'p1', text: 'body' },
    { type: 'prefix.restoreVersion', presetId: 'p1', versionId: 'v1' },
    { type: 'prefix.duplicatePreset', presetId: 'p1' },
    { type: 'prefix.deletePreset', presetId: 'p1' },
    {
      type: 'context.optionsChanged',
      treeMode: 'selectedFilesOnly',
      outputMode: 'readable',
    },
    {
      type: 'export.optionsChanged',
      options: normalizePromptExportOptions({}),
    },
    {
      type: 'context.create',
      copy: true,
      treeMode: 'selectedFilesOnly',
      outputMode: 'readable',
    },
    { type: 'context.copyPreview', text: 'preview' },
    {
      type: 'context.save',
      options: normalizePromptExportOptions({}),
      treeMode: 'fullFilesAndDirectories',
      outputMode: 'compact',
    },
  ]
  for (const variant of variants) {
    assert.equal(isWebviewMessage(variant), true, `should accept ${variant.type}`)
  }
})

test('webview host html includes CSP, nonce, initial state, and Vue bundle script tag', () => {
  const state: ContextPanelState = {
    tokenProfiles: [
      { id: 'claude', label: 'Claude' },
      { id: 'openai', label: 'OpenAI' },
      { id: 'gemini', label: 'Gemini' },
    ],
    visibleTokenProfileIds: ['claude', 'openai', 'gemini'],
    tokenSummaries: [],
    promptPresets: [],
    activePresetId: null,
    inlinePrefix: '<script>evil</script>',
    treeMode: 'selectedFilesOnly',
    outputMode: 'readable',
    exportOptions: normalizePromptExportOptions({}),
  }

  const html = getWebviewHtml({
    scriptUri: 'vscode-resource://ext/dist/webview/main.js',
    styleUri: 'vscode-resource://ext/dist/webview/main.css',
    cspSource: 'vscode-resource:',
    nonce: 'TEST_NONCE_123',
    state,
  })

  assert.ok(html.includes('<!DOCTYPE html>'), 'has doctype')
  assert.ok(html.includes('Content-Security-Policy'), 'has CSP header')
  assert.ok(html.includes('nonce-TEST_NONCE_123'), 'CSP references nonce')
  assert.ok(html.includes('nonce="TEST_NONCE_123"'), 'inline scripts carry nonce')
  assert.ok(html.includes('<div id="app"></div>'), 'has Vue mount node')
  assert.ok(html.includes('type="module"'), 'webview script is ES module')
  assert.ok(html.includes('main.js'), 'references compiled main.js')
  assert.ok(html.includes('main.css'), 'references compiled main.css')
  assert.ok(html.includes('window.__INITIAL_STATE__'), 'injects initial state')
  assert.ok(!html.includes('<script>evil</script>'), 'escapes raw <script> from injected state')
  assert.ok(html.includes('\\u003cscript>evil\\u003c/script>'), 'state JSON escapes < to \\u003c')
})
