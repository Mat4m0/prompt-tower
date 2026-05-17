import { test } from 'vite-plus/test'
import assert from 'node:assert/strict'
import ignore from 'ignore'
import { getSelectionRefinementDefinition } from '../../core/files/FileKind'
import { normalizeIgnorePath } from '../../core/files/IgnoreRules'
import { FileIndex, type FileStat, type IndexedWorkspace } from '../../core/files/FileIndex'
import { FileSelection } from '../../core/files/FileSelection'
import { getTokenEstimateProfile } from '../../core/tokens/TokenEstimateProfiles'
import { createSelectionFixtureIndex } from '../helpers'
import { ALWAYS_IGNORE } from '../../utils/alwaysIgnore'

test('FileIndex refreshes once more when dirtied during refresh', async () => {
  const workspace: IndexedWorkspace = {
    id: 'w',
    name: 'demo',
    rootPath: '/repo',
  }
  let files = ['/repo/src/a.ts']
  let listCalls = 0
  const index = new FileIndex(
    {
      async listFiles() {
        listCalls++
        if (listCalls === 1) {
          index.markDirty()
          files = ['/repo/src/a.ts', '/repo/src/b.ts']
        }
        return files
      },
      async statFile(absolutePath: string): Promise<FileStat> {
        return { sizeBytes: absolutePath.endsWith('b.ts') ? 80 : 40, mtimeMs: 1 }
      },
    },
    [workspace],
    getTokenEstimateProfile('claude'),
  )

  await index.ensureFresh()

  assert.equal(listCalls, 2)
  assert.equal(index.getSnapshot().files.length, 2)
  assert.equal(index.getRefreshState(), 'idle')
})

test('FileIndex updates metadata and token estimates after file changes', async () => {
  const workspace: IndexedWorkspace = {
    id: 'w',
    name: 'demo',
    rootPath: '/repo',
  }
  let sizeBytes = 40
  const index = new FileIndex(
    {
      async listFiles() {
        return ['/repo/src/a.ts']
      },
      async statFile() {
        return { sizeBytes, mtimeMs: sizeBytes }
      },
    },
    [workspace],
    getTokenEstimateProfile('claude'),
  )

  await index.ensureFresh()
  const before = index.getSnapshot().files[0].estimatedTokenCount
  sizeBytes = 400
  index.markDirty()
  await index.ensureFresh()

  assert.ok(index.getSnapshot().files[0].estimatedTokenCount > before)
})

test('FileIndex snapshots do not expose mutable index internals', async () => {
  const workspace: IndexedWorkspace = {
    id: 'w',
    name: 'demo',
    rootPath: '/repo',
  }
  const index = new FileIndex(
    {
      async listFiles() {
        return ['/repo/src/a.ts']
      },
      async statFile() {
        return { sizeBytes: 40, mtimeMs: 1 }
      },
    },
    [workspace],
    getTokenEstimateProfile('claude'),
  )

  await index.ensureFresh()
  const snapshot = index.getSnapshot()
  const root = snapshot.nodes.get('w:')
  assert.ok(root && root.kind !== 'file')

  ;(snapshot.files as unknown[]).pop()
  ;(root.childIds as string[]).length = 0
  ;(snapshot.nodes as Map<string, unknown>).clear()

  const nextSnapshot = index.getSnapshot()
  assert.equal(nextSnapshot.files.length, 1)
  assert.equal(nextSnapshot.nodes.has('w:'), true)
  const nextRoot = nextSnapshot.nodes.get('w:')
  assert.ok(nextRoot && nextRoot.kind !== 'file')
  assert.deepEqual(nextRoot.childIds, ['w:src'])
})

test('FileSelection restores tests after excluded test filter is re-enabled', async () => {
  const index = await createSelectionFixtureIndex(['src/app.ts', 'src/app.test.ts'])
  const selection = new FileSelection()
  const snapshot = index.getSnapshot()
  selection.setNodeIncluded(snapshot, 'w:src', true)
  selection.setFileKindExcluded(snapshot, 'pattern:test', true)

  assert.deepEqual(
    selection.getSnapshot().selectedFiles.map((file) => file.relativePath),
    ['src/app.ts'],
  )

  selection.setFileKindExcluded(snapshot, 'pattern:test', false)

  assert.deepEqual(
    selection
      .getSnapshot()
      .selectedFiles.map((file) => file.relativePath)
      .sort(),
    ['src/app.test.ts', 'src/app.ts'],
  )
})

test('FileSelection toggling a partial parent re-includes a deselected child folder', async () => {
  const index = await createSelectionFixtureIndex(['src/sub/inner.ts', 'src/app.ts'])
  const selection = new FileSelection()
  const snap = index.getSnapshot()
  selection.setNodeIncluded(snap, 'w:src', true)
  selection.setNodeIncluded(snap, 'w:src/sub', false)
  assert.equal(selection.getSnapshot().checkboxStates.get('w:src'), 'partial')

  selection.toggleNode(snap, 'w:src')

  assert.deepEqual(
    selection
      .getSnapshot()
      .selectedFiles.map((file) => file.relativePath)
      .sort(),
    ['src/app.ts', 'src/sub/inner.ts'],
  )
})

test('FileSelection toggling a partial parent re-includes a deeply-nested deselected file', async () => {
  const index = await createSelectionFixtureIndex(['src/sub/inner.ts', 'src/app.ts'])
  const selection = new FileSelection()
  const snap = index.getSnapshot()
  selection.setNodeIncluded(snap, 'w:src', true)
  selection.setNodeIncluded(snap, 'w:src/sub/inner.ts', false)

  selection.toggleNode(snap, 'w:src')

  assert.deepEqual(
    selection
      .getSnapshot()
      .selectedFiles.map((file) => file.relativePath)
      .sort(),
    ['src/app.ts', 'src/sub/inner.ts'],
  )
})

test('FileSelection keeps explicit child excludes across filter changes', async () => {
  const index = await createSelectionFixtureIndex(['src/app.ts', 'src/app.test.ts'])
  const selection = new FileSelection()
  const snapshot = index.getSnapshot()
  selection.setNodeIncluded(snapshot, 'w:src', true)
  selection.setNodeIncluded(snapshot, 'w:src/app.ts', false)
  selection.setFileKindExcluded(snapshot, 'pattern:test', true)
  selection.setFileKindExcluded(snapshot, 'pattern:test', false)

  assert.deepEqual(
    selection.getSnapshot().selectedFiles.map((file) => file.relativePath),
    ['src/app.test.ts'],
  )
})

test('FileSelection derives new files under selected folders and filters tests', async () => {
  let index = await createSelectionFixtureIndex(['src/app.ts'])
  const selection = new FileSelection()
  selection.setNodeIncluded(index.getSnapshot(), 'w:src', true)

  index = await createSelectionFixtureIndex(['src/app.ts', 'src/new.ts', 'src/new.test.ts'])
  selection.setFileKindExcluded(index.getSnapshot(), 'pattern:test', true)
  selection.reconcile(index.getSnapshot())

  assert.deepEqual(
    selection
      .getSnapshot()
      .selectedFiles.map((file) => file.relativePath)
      .sort(),
    ['src/app.ts', 'src/new.ts'],
  )
})

test('FileSelection drops deleted selected files during reconcile', async () => {
  let index = await createSelectionFixtureIndex(['src/app.ts', 'src/old.ts'])
  const selection = new FileSelection()
  selection.setNodeIncluded(index.getSnapshot(), 'w:src/old.ts', true)

  index = await createSelectionFixtureIndex(['src/app.ts'])
  selection.reconcile(index.getSnapshot())

  assert.deepEqual(selection.getSnapshot().selectedFileIds, [])
  assert.deepEqual(selection.getPersistedIntent().includedNodeIds, [])
})

test('FileSelection folder checkbox ignores excluded file kinds', async () => {
  const index = await createSelectionFixtureIndex(['src/app.ts', 'src/app.test.ts'])
  const selection = new FileSelection()
  const snapshot = index.getSnapshot()
  selection.setNodeIncluded(snapshot, 'w:src', true)
  selection.setFileKindExcluded(snapshot, 'pattern:test', true)

  assert.equal(selection.getSnapshot().checkboxStates.get('w:src'), 'checked')
  assert.equal(selection.getSnapshot().checkboxStates.get('w:src/app.test.ts'), 'unchecked')
})

test('FileSelection persists and restores selection intent', async () => {
  const index = await createSelectionFixtureIndex(['src/app.ts', 'src/app.test.ts'])
  const original = new FileSelection()
  original.setNodeIncluded(index.getSnapshot(), 'w:src', true)
  original.setFileKindExcluded(index.getSnapshot(), 'pattern:test', true)

  const restored = new FileSelection()
  restored.restoreIntent(index.getSnapshot(), original.getPersistedIntent())

  assert.deepEqual(
    restored.getSnapshot().selectedFiles.map((file) => file.relativePath),
    ['src/app.ts'],
  )
  assert.equal(restored.getSnapshot().filterGroups.at(-1)?.excluded, true)
})

test('FileSelection can include and exclude all filter groups', async () => {
  const index = await createSelectionFixtureIndex([
    'src/app.ts',
    'src/app.test.ts',
    'src/component.vue',
  ])
  const selection = new FileSelection()
  const snapshot = index.getSnapshot()
  selection.setNodeIncluded(snapshot, 'w:src', true)

  selection.excludeAllFilters(snapshot)
  assert.equal(selection.getSnapshot().selectedFiles.length, 0)
  assert.equal(
    selection.getSnapshot().filterGroups.every((group) => group.excluded),
    true,
  )

  selection.resetFilters(snapshot)
  assert.deepEqual(
    selection
      .getSnapshot()
      .selectedFiles.map((file) => file.relativePath)
      .sort(),
    ['src/app.test.ts', 'src/app.ts', 'src/component.vue'],
  )
})

test('folder selection refinement keeps tests and declarations separate', () => {
  assert.deepEqual(getSelectionRefinementDefinition('Component.vue'), {
    id: 'extension:.vue',
    label: '.vue files',
    sortLabel: '.vue',
  })
  assert.deepEqual(getSelectionRefinementDefinition('worker.ts'), {
    id: 'extension:.ts',
    label: '.ts files',
    sortLabel: '.ts',
  })
  assert.deepEqual(getSelectionRefinementDefinition('worker.test.ts'), {
    id: 'pattern:test',
    label: 'Test files (*.test.*, *.spec.*)',
    sortLabel: 'zz-test',
  })
  assert.deepEqual(getSelectionRefinementDefinition('worker.spec.tsx'), {
    id: 'pattern:test',
    label: 'Test files (*.test.*, *.spec.*)',
    sortLabel: 'zz-test',
  })
  assert.deepEqual(getSelectionRefinementDefinition('types.d.ts'), {
    id: 'pattern:declaration',
    label: 'Declaration files (*.d.ts)',
    sortLabel: 'zz-declaration',
  })
  assert.deepEqual(getSelectionRefinementDefinition('Dockerfile'), {
    id: 'extension:(no extension)',
    label: 'No extension',
    sortLabel: '(no extension)',
  })
})

test('ignore rules combine built-ins, gitignore, contextignore, and towerignore syntax', () => {
  const matcher = ignore().add(ALWAYS_IGNORE)
  matcher.add(['generated/'])
  matcher.add(['fixtures/'])
  matcher.add(['legacy-output/'])

  assert.equal(matcher.ignores(normalizeIgnorePath('node_modules/pkg/index.js')), true)
  assert.equal(matcher.ignores(normalizeIgnorePath('generated/report.json')), true)
  assert.equal(matcher.ignores(normalizeIgnorePath('fixtures/context.xml')), true)
  assert.equal(matcher.ignores(normalizeIgnorePath('legacy-output/a.txt')), true)
  assert.equal(matcher.ignores(normalizeIgnorePath('src/app.ts')), false)
})
