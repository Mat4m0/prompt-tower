import { test } from 'vite-plus/test'
import assert from 'node:assert/strict'
import { assembleContext } from '../../core/context/ContextAssembler'
import { estimateContextCharacters } from '../../core/context/ContextEstimate'
import { FileIndex, type IndexedWorkspace } from '../../core/files/FileIndex'
import { FileSelection } from '../../core/files/FileSelection'
import { getTokenProfile } from '../../core/tokens/TokenProfiles'
import { ContextApplicationService } from '../../app/ContextApplicationService'
import { readFixture } from '../helpers'

const CONTEXT_FIXTURE_TREE = 'demo\n└─ src/\n   └─ example.ts'
const CONTEXT_FIXTURE_FILE = {
  id: 'example',
  absolutePath: '/workspace/demo/src/example.ts',
  relativePath: 'src/example.ts',
  name: 'example.ts',
}
const CONTEXT_FIXTURE_SNAPSHOTS = new Map([
  ['example', { content: '\nexport const value = 1;\n\n' }],
])

test('context token estimate includes tree modes and minified wrapper shape', () => {
  const base = {
    prefix: '',
    suffix: '',
    selectedFileBlockChars: 100,
    selectedFileCount: 1,
    projectTree: 'clipper2-ts\n└─ bench/',
  }

  const fullTreeChars = estimateContextCharacters({
    ...base,
    treeType: 'fullFilesAndDirectories',
    minify: false,
  })
  const selectedTreeChars = estimateContextCharacters({
    ...base,
    treeType: 'selectedFilesOnly',
    minify: false,
  })
  const directoriesOnlyChars = estimateContextCharacters({
    ...base,
    treeType: 'fullDirectoriesOnly',
    minify: false,
  })
  const noTreeChars = estimateContextCharacters({
    ...base,
    treeType: 'none',
    minify: false,
  })
  const minifiedChars = estimateContextCharacters({
    ...base,
    treeType: 'fullFilesAndDirectories',
    minify: true,
  })

  assert.ok(fullTreeChars > noTreeChars)
  assert.equal(selectedTreeChars, fullTreeChars)
  assert.equal(directoriesOnlyChars, fullTreeChars)
  assert.ok(minifiedChars < fullTreeChars)
})

test('ContextAssembler matches readable golden fixture', async () => {
  const result = assembleContext({
    files: [CONTEXT_FIXTURE_FILE],
    snapshots: CONTEXT_FIXTURE_SNAPSHOTS,
    prefix: 'Audit prefix',
    suffix: 'Review carefully.',
    projectTree: CONTEXT_FIXTURE_TREE,
    treeMode: 'selectedFilesOnly',
    outputMode: 'readable',
  })

  assert.equal(result.text, await readFixture('context/basic-readable.expected.xml'))
  assert.equal(result.fileCount, 1)
  assert.equal(result.warnings.length, 0)
})

test('ContextAssembler matches compact golden fixture', async () => {
  const result = assembleContext({
    files: [CONTEXT_FIXTURE_FILE],
    snapshots: CONTEXT_FIXTURE_SNAPSHOTS,
    prefix: '',
    projectTree: CONTEXT_FIXTURE_TREE,
    treeMode: 'fullFilesAndDirectories',
    outputMode: 'compact',
  })

  assert.equal(result.text, await readFixture('context/basic-compact.expected.xml'))
})

test('ContextAssembler omits tree when tree mode is none', async () => {
  const result = assembleContext({
    files: [CONTEXT_FIXTURE_FILE],
    snapshots: CONTEXT_FIXTURE_SNAPSHOTS,
    prefix: '',
    projectTree: CONTEXT_FIXTURE_TREE,
    treeMode: 'none',
    outputMode: 'readable',
  })

  assert.equal(result.text, await readFixture('context/tree-none.expected.xml'))
})

test('ContextAssembler emits tree-only output when no files are selected', async () => {
  const result = assembleContext({
    files: [],
    snapshots: new Map(),
    prefix: '',
    projectTree: CONTEXT_FIXTURE_TREE,
    treeMode: 'fullDirectoriesOnly',
    outputMode: 'readable',
  })

  assert.equal(result.text, await readFixture('context/tree-only.expected.xml'))
})

test('ContextAssembler reports missing file snapshots', async () => {
  const result = assembleContext({
    files: [CONTEXT_FIXTURE_FILE],
    snapshots: new Map(),
    prefix: '',
    projectTree: '',
    treeMode: 'none',
    outputMode: 'readable',
  })

  assert.equal(result.text, await readFixture('context/missing-file-warning.expected.xml'))
  assert.deepEqual(result.warnings, [
    {
      type: 'missingFile',
      fileId: 'example',
      path: 'src/example.ts',
    },
  ])
})

test('ContextApplicationService prefixes multi-root tree paths', async () => {
  const workspaces: IndexedWorkspace[] = [
    { id: 'front', name: 'frontend', rootPath: '/repo/frontend' },
    { id: 'back', name: 'backend', rootPath: '/repo/backend' },
  ]
  const paths = ['/repo/frontend/src/index.ts', '/repo/backend/src/index.ts']
  const index = new FileIndex(
    {
      async listFiles(workspace) {
        return paths.filter((filePath) => filePath.startsWith(workspace.rootPath))
      },
      async statFile(absolutePath) {
        return { sizeBytes: absolutePath.length, mtimeMs: 1 }
      },
    },
    workspaces,
    getTokenProfile('claude'),
  )
  await index.ensureFresh()
  const selection = new FileSelection()
  selection.setNodeIncluded(index.getSnapshot(), 'front:', true)
  selection.setNodeIncluded(index.getSnapshot(), 'back:', true)
  const service = new ContextApplicationService(
    index,
    selection,
    {
      async readText(absolutePath) {
        return absolutePath
      },
      async writeText() {},
    },
    {
      async writeText() {},
    },
    getTokenProfile('claude'),
  )

  const output = await service.buildContext({
    prefix: '',
    treeMode: 'selectedFilesOnly',
    outputMode: 'readable',
  })

  assert.match(output.text, /workspace\n/)
  assert.match(output.text, /frontend\/\n.*src\/\n.*index\.ts/s)
  assert.match(output.text, /backend\/\n.*src\/\n.*index\.ts/s)
})
