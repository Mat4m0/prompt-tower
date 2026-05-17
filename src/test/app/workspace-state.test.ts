import { test } from 'vite-plus/test'
import assert from 'node:assert/strict'
import { WorkspaceStateService } from '../../app/WorkspaceStateService'
import { createMemoryStorage } from '../helpers'

test('WorkspaceState persists selection, context options, and export options', async () => {
  const storage = createMemoryStorage({})
  const state = new WorkspaceStateService(storage)
  await state.setSelectionIntent({
    includedNodeIds: ['w:src'],
    excludedNodeIds: [],
    excludedFileKindIds: ['pattern:test'],
  })
  await state.setTreeMode('fullDirectoriesOnly')
  await state.setOutputMode('compact')
  await state.setExportOptions({
    fileName: 'Audit',
    format: 'txt',
  })
  await state.setEstimateSummaryProfileIds(['claude', 'gemini'])

  assert.deepEqual(state.getSelectionIntent()?.includedNodeIds, ['w:src'])
  assert.equal(state.getTreeMode(), 'fullDirectoriesOnly')
  assert.equal(state.getOutputMode(), 'compact')
  assert.equal(state.getExportOptions().fileName, 'Audit')
  assert.equal(state.getExportOptions().format, 'txt')
  assert.deepEqual(state.getEstimateSummaryProfileIds(), ['claude', 'gemini'])
})
