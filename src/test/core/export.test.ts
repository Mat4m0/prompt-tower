import { test } from 'vite-plus/test'
import assert from 'node:assert/strict'
import * as path from 'path'
import {
  normalizePromptExportOptions,
  type PromptExportOptions,
} from '../../core/export/ExportOptions'
import { buildPromptExportTarget, createWrapperTimestamp } from '../../core/export/PromptFileWriter'

test('prompt export core normalizes names, formats, and timestamps', () => {
  const date = new Date(2026, 4, 15, 20, 55, 7)
  const options = normalizePromptExportOptions({
    fileName: ' ../Audit: Run?.md ',
    format: 'txt',
    includeTimestamp: true,
  })
  const target = buildPromptExportTarget('/workspace/project', options, date)

  assert.equal(options.fileName, 'Audit-Run')
  assert.equal(options.format, 'txt')
  assert.equal(options.location, 'promptFolder')
  assert.equal(target.fileName, 'Audit-Run-2026-05-15_20-55-07.txt')
  assert.equal(target.directoryPath, path.join('/workspace/project', '.prompt-lupinum', 'prompts'))
  assert.equal(createWrapperTimestamp(date), date.toISOString())
})

test('prompt export core maps legacy prompttower location to prompt folder', () => {
  const options = normalizePromptExportOptions({
    location: 'prompttower',
  } as unknown as Partial<PromptExportOptions>)

  assert.equal(options.location, 'promptFolder')
})

test('prompt export core supports timestamp-free markdown at workspace root', () => {
  const options = normalizePromptExportOptions({
    fileName: 'prompt.txt',
    format: 'md',
    location: 'workspaceRoot',
    includeTimestamp: false,
  })
  const target = buildPromptExportTarget(
    '/workspace/project',
    options,
    new Date(2026, 4, 15, 20, 55, 7),
  )

  assert.equal(target.directoryPath, '/workspace/project')
  assert.equal(target.fileName, 'prompt.md')
  assert.equal(target.absolutePath, path.join('/workspace/project', 'prompt.md'))
})

test('prompt export core rejects relative custom folders outside workspace', () => {
  const options: PromptExportOptions = normalizePromptExportOptions({
    location: 'customFolder',
    customFolderPath: '../outside',
    customFolderPathMode: 'relative',
  })

  assert.throws(
    () => buildPromptExportTarget('/workspace/project', options),
    /Custom folder must stay inside the workspace root/,
  )
})

test('prompt export core requires absolute paths in absolute custom mode', () => {
  const options: PromptExportOptions = normalizePromptExportOptions({
    location: 'customFolder',
    customFolderPath: 'relative/path',
    customFolderPathMode: 'absolute',
  })

  assert.throws(
    () => buildPromptExportTarget('/workspace/project', options),
    /Absolute custom folder path must be absolute/,
  )
})
