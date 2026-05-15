import { test } from 'vite-plus/test'
import assert from 'node:assert/strict'
import { PromptPresetApplicationService } from '../../app/PromptPresetApplicationService'
import {
  createPromptPreset,
  duplicatePromptPreset,
  getCurrentPromptPresetVersion,
  restorePromptPresetVersion,
  savePromptPresetVersion,
  softDeletePromptPreset,
} from '../../core/prompts/PromptPresetVersioning'
import { parsePromptPresets } from '../../core/prompts/promptPresetSchema'
import { createMemoryStorage } from '../helpers'

test('PromptPreset versioning is recoverable', () => {
  const preset = createPromptPreset('Audit', 'v1', '2026-01-01T00:00:00.000Z', 'p1')
  const edited = savePromptPresetVersion(preset, 'v2', undefined, '2026-01-02T00:00:00.000Z')
  const restored = restorePromptPresetVersion(
    edited,
    preset.currentVersionId,
    '2026-01-03T00:00:00.000Z',
  )
  const duplicated = duplicatePromptPreset(restored, '2026-01-04T00:00:00.000Z', 'p2')
  const deleted = softDeletePromptPreset(restored, '2026-01-05T00:00:00.000Z')

  assert.equal(edited.versions.length, 2)
  assert.equal(getCurrentPromptPresetVersion(restored).text, 'v1')
  assert.equal(duplicated.id, 'p2')
  assert.equal(getCurrentPromptPresetVersion(duplicated).text, 'v1')
  assert.equal(deleted.deletedAt, '2026-01-05T00:00:00.000Z')
})

test('PromptPreset migration deduplicates old prefix history', async () => {
  const globalStorage = createMemoryStorage({
    'promptTower.prefixHistory': [
      { text: 'Audit' },
      { text: 'Audit' },
      { text: 'Refactor' },
      { text: '' },
    ],
  })
  const workspaceStorage = createMemoryStorage({})
  const service = new PromptPresetApplicationService(globalStorage, workspaceStorage)

  await service.migrateOldPrefixHistory()
  await service.migrateOldPrefixHistory()

  assert.deepEqual(
    service
      .listPresets()
      .map((preset) => getCurrentPromptPresetVersion(preset).text)
      .sort(),
    ['Audit', 'Refactor'],
  )
})

test('PromptPreset application service duplicates, restores, and soft deletes', async () => {
  const service = new PromptPresetApplicationService(
    createMemoryStorage({}),
    createMemoryStorage({}),
  )
  const preset = await service.createPreset('Audit', 'v1')
  const edited = await service.saveVersion(preset.id, 'v2')
  await service.restoreVersion(edited.id, preset.currentVersionId)
  const duplicated = await service.duplicatePreset(edited.id)
  await service.deletePreset(edited.id)

  assert.equal(service.getActivePresetId(), duplicated.id)
  assert.deepEqual(
    service.listPresets().map((candidate) => candidate.id),
    [duplicated.id],
  )
  assert.equal(getCurrentPromptPresetVersion(duplicated).text, 'v1')
})

test('PromptPreset schema ignores corrupted stored presets', () => {
  const valid = createPromptPreset('Audit', 'v1', '2026-01-01T00:00:00.000Z', 'valid')

  assert.deepEqual(
    parsePromptPresets([
      valid,
      { ...valid, id: 'missing-current', currentVersionId: 'missing' },
      { ...valid, id: 'bad-version', versions: [{ id: 'v1' }] },
      { ...valid, id: 'bad-deleted', deletedAt: 42 },
    ]).map((preset) => preset.id),
    ['valid'],
  )
})
