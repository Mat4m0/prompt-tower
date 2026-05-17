import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { performance } from 'perf_hooks'
import {
  BenchmarkReport,
  BenchmarkStats,
  createComparison,
  formatNumber,
  formatSignedNumber,
  formatSignedPercent,
  readLatestReport,
  writeLatestReportFiles,
} from './reporting'
import { assembleContext } from '../core/context/ContextAssembler'
import type {
  ContextFile,
  ContextFileSnapshot,
  ContextOutputMode,
  ProjectTreeMode,
} from '../core/context/ContextFormat'
import { generateFileStructureTree } from '../core/context/ProjectTreeBuilder'

type ScaleName = 'smoke' | 'standard' | 'large'

interface BenchmarkCase {
  name: string
  description: string
  beforeEachRun?: () => Promise<void>
  run: () => Promise<void>
}

interface FixtureSet {
  rootDir: string
  allFiles: ContextFile[]
  selectedFiles: ContextFile[]
  totalBytes: number
  selectedBytes: number
  largestFileBytes: number
  deepestPathSegments: number
}

interface TreeFileEntry {
  tree: string
}

const SCALE_CONFIG: Record<
  ScaleName,
  {
    directories: number
    filesPerDirectory: number
    selectedEvery: number
    iterations: number
    nestingDepth: number
    blocksPerFile: number
    statementsPerBlock: number
  }
> = {
  smoke: {
    directories: 8,
    filesPerDirectory: 15,
    selectedEvery: 3,
    iterations: 4,
    nestingDepth: 2,
    blocksPerFile: 18,
    statementsPerBlock: 3,
  },
  standard: {
    directories: 32,
    filesPerDirectory: 48,
    selectedEvery: 4,
    iterations: 6,
    nestingDepth: 4,
    blocksPerFile: 36,
    statementsPerBlock: 5,
  },
  large: {
    directories: 48,
    filesPerDirectory: 56,
    selectedEvery: 6,
    iterations: 3,
    nestingDepth: 5,
    blocksPerFile: 52,
    statementsPerBlock: 6,
  },
}

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2))
  const scale = getScale(args)
  const jsonOutput = args.has('--json')
  const fixtureSet = await createFixtureSet(scale)

  try {
    const benchmarkCases = createBenchmarkCases(fixtureSet)
    const iterations = SCALE_CONFIG[scale].iterations
    const results: BenchmarkStats[] = []

    for (const benchmarkCase of benchmarkCases) {
      results.push(await measureBenchmark(benchmarkCase, iterations))
    }

    const fixture = {
      rootDir: fixtureSet.rootDir,
      totalFiles: fixtureSet.allFiles.length,
      selectedFiles: fixtureSet.selectedFiles.length,
      totalBytes: fixtureSet.totalBytes,
      selectedBytes: fixtureSet.selectedBytes,
      largestFileBytes: fixtureSet.largestFileBytes,
      deepestPathSegments: fixtureSet.deepestPathSegments,
    }
    const reportsRoot = path.join(process.cwd(), 'benchmarks', 'reports')
    const previousReport = await readLatestReport(reportsRoot, scale)
    const report: BenchmarkReport<ScaleName> = {
      generatedAt: new Date().toISOString(),
      scale,
      fixture,
      results,
      comparison: createComparison(results, previousReport?.results ?? []),
    }

    const reportPaths = await writeLatestReportFiles(reportsRoot, report)

    if (jsonOutput) {
      process.stdout.write(
        JSON.stringify(
          {
            ...report,
            reportPaths,
          },
          null,
          2,
        ) + '\n',
      )
      return
    }

    printResults(report, reportPaths)
  } finally {
    await fs.promises.rm(fixtureSet.rootDir, { recursive: true, force: true })
  }
}

function getScale(args: Set<string>): ScaleName {
  for (const arg of args) {
    if (!arg.startsWith('--scale=')) {
      continue
    }

    const scale = arg.slice('--scale='.length) as ScaleName
    if (scale in SCALE_CONFIG) {
      return scale
    }
    throw new Error(`Unsupported benchmark scale: ${scale}`)
  }

  return 'standard'
}

async function createFixtureSet(scale: ScaleName): Promise<FixtureSet> {
  const config = SCALE_CONFIG[scale]
  const rootDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'lupinum-context-bench-'))
  const allFiles: ContextFile[] = []
  const selectedFiles: ContextFile[] = []
  let totalBytes = 0
  let selectedBytes = 0
  let largestFileBytes = 0
  let deepestPathSegments = 0

  for (let directoryIndex = 0; directoryIndex < config.directories; directoryIndex++) {
    const nestedDir = path.join(
      rootDir,
      ...createNestedDirectorySegments(directoryIndex, config.nestingDepth),
    )
    await fs.promises.mkdir(nestedDir, { recursive: true })

    for (let fileIndex = 0; fileIndex < config.filesPerDirectory; fileIndex++) {
      const fileName = `sample-${directoryIndex.toString().padStart(2, '0')}-${fileIndex
        .toString()
        .padStart(3, '0')}.ts`
      const absolutePath = path.join(nestedDir, fileName)
      const relativePath = path.relative(rootDir, absolutePath)
      deepestPathSegments = Math.max(deepestPathSegments, relativePath.split(path.sep).length)
      const content = createFixtureFileContent(directoryIndex, fileIndex, config)
      const contentBytes = Buffer.byteLength(content, 'utf8')
      await fs.promises.writeFile(absolutePath, content, 'utf8')
      totalBytes += contentBytes
      largestFileBytes = Math.max(largestFileBytes, contentBytes)

      const entry = {
        id: absolutePath,
        absolutePath,
        relativePath,
        name: fileName,
      }
      allFiles.push(entry)

      if ((directoryIndex * config.filesPerDirectory + fileIndex) % config.selectedEvery === 0) {
        selectedFiles.push(entry)
        selectedBytes += contentBytes
      }
    }
  }

  return {
    rootDir,
    allFiles,
    selectedFiles,
    totalBytes,
    selectedBytes,
    largestFileBytes,
    deepestPathSegments,
  }
}

function createFixtureFileContent(
  directoryIndex: number,
  fileIndex: number,
  config: (typeof SCALE_CONFIG)[ScaleName],
): string {
  const repeatedSection = Array.from({ length: config.blocksPerFile }, (_, blockIndex) => {
    const statements = Array.from(
      { length: config.statementsPerBlock },
      (_, statementIndex) =>
        `  const value_${statementIndex} = "${directoryIndex}:${fileIndex}:${blockIndex}:${statementIndex}";`,
    ).join('\n')

    return [
      `export function fixture_${directoryIndex}_${fileIndex}_${blockIndex}(input: string): string {`,
      `  const label = "group-${directoryIndex}-file-${fileIndex}-block-${blockIndex}";`,
      statements,
      `  return [label, input, ${Array.from(
        { length: config.statementsPerBlock },
        (_, statementIndex) => `value_${statementIndex}`,
      ).join(', ')}].join(":");`,
      '}',
      '',
      `export const fixture_matrix_${directoryIndex}_${fileIndex}_${blockIndex} = [`,
      ...Array.from(
        { length: Math.max(2, config.statementsPerBlock / 2) },
        (_, rowIndex) =>
          `  { id: "${directoryIndex}-${fileIndex}-${blockIndex}-${rowIndex}", score: ${
            directoryIndex + fileIndex + blockIndex + rowIndex
          }, enabled: ${rowIndex % 2 === 0 ? 'true' : 'false'} },`,
      ),
      '];',
      '',
    ].join('\n')
  }).join('\n')

  return [
    `// fixture ${directoryIndex}/${fileIndex}`,
    `export const meta = { directory: ${directoryIndex}, file: ${fileIndex} };`,
    `export const fixturePath = "group-${directoryIndex}/sample-${fileIndex}";`,
    '',
    repeatedSection,
  ].join('\n')
}

function createBenchmarkCases(fixtureSet: FixtureSet): BenchmarkCase[] {
  return [
    {
      name: 'file-blocks:selected',
      description: 'Read and format selected file blocks',
      run: async () => {
        await loadSnapshots(fixtureSet.selectedFiles)
      },
    },
    {
      name: 'tree:selected',
      description: 'Generate project tree for selected files only',
      run: async () => {
        generateFileStructureTree(fixtureSet.rootDir, toTreeEntries(fixtureSet.selectedFiles))
      },
    },
    {
      name: 'tree:full',
      description: 'Generate project tree for the full repository view',
      run: async () => {
        generateFileStructureTree(fixtureSet.rootDir, toTreeEntries(fixtureSet.allFiles))
      },
    },
    {
      name: 'context:selected-tree',
      description: 'End-to-end context generation with selected-files tree',
      run: async () => {
        const projectTree = generateFileStructureTree(
          fixtureSet.rootDir,
          toTreeEntries(fixtureSet.selectedFiles),
        )
        await assembleBenchmarkContext({
          files: fixtureSet.selectedFiles,
          projectTree,
          treeMode: 'selectedFilesOnly',
          outputMode: 'readable',
        })
      },
    },
    {
      name: 'context:full-tree',
      description: 'End-to-end context generation with full repository tree',
      run: async () => {
        const projectTree = generateFileStructureTree(
          fixtureSet.rootDir,
          toTreeEntries(fixtureSet.allFiles),
        )
        await assembleBenchmarkContext({
          files: fixtureSet.selectedFiles,
          projectTree,
          treeMode: 'fullFilesAndDirectories',
          outputMode: 'readable',
        })
      },
    },
    {
      name: 'context:minified-full-tree',
      description: 'End-to-end context generation with minified wrapper output',
      run: async () => {
        const projectTree = generateFileStructureTree(
          fixtureSet.rootDir,
          toTreeEntries(fixtureSet.allFiles),
        )
        await assembleBenchmarkContext({
          files: fixtureSet.selectedFiles,
          projectTree,
          treeMode: 'fullFilesAndDirectories',
          outputMode: 'compact',
        })
      },
    },
  ]
}

function createNestedDirectorySegments(directoryIndex: number, nestingDepth: number): string[] {
  const segments = ['group-' + directoryIndex.toString().padStart(2, '0')]

  for (let depthIndex = 0; depthIndex < nestingDepth; depthIndex++) {
    segments.push(
      `layer-${depthIndex.toString().padStart(2, '0')}`,
      `bucket-${((directoryIndex + depthIndex) * 7) % 19}`,
      `feature-${(directoryIndex * (depthIndex + 3)) % 23}`,
    )
  }

  return segments
}

function toTreeEntries(fileEntries: ContextFile[]): TreeFileEntry[] {
  return fileEntries.map((fileEntry) => ({
    tree: fileEntry.relativePath.replace(/\\/g, '/'),
  }))
}

async function assembleBenchmarkContext(options: {
  files: ContextFile[]
  projectTree: string
  treeMode: ProjectTreeMode
  outputMode: ContextOutputMode
}): Promise<void> {
  const snapshots = await loadSnapshots(options.files)
  assembleContext({
    files: options.files,
    snapshots,
    prefix: '',
    projectTree: options.projectTree,
    treeMode: options.treeMode,
    outputMode: options.outputMode,
  })
}

async function measureBenchmark(
  benchmarkCase: BenchmarkCase,
  iterations: number,
): Promise<BenchmarkStats> {
  await benchmarkCase.beforeEachRun?.()
  await benchmarkCase.run()

  const samples: number[] = []
  for (let iteration = 0; iteration < iterations; iteration++) {
    await benchmarkCase.beforeEachRun?.()
    const start = performance.now()
    await benchmarkCase.run()
    samples.push(performance.now() - start)
  }

  const sortedSamples = [...samples].sort((left, right) => left - right)
  return {
    name: benchmarkCase.name,
    description: benchmarkCase.description,
    iterations,
    meanMs: average(samples),
    minMs: sortedSamples[0],
    maxMs: sortedSamples[sortedSamples.length - 1],
    p95Ms:
      sortedSamples[Math.min(sortedSamples.length - 1, Math.floor(sortedSamples.length * 0.95))],
  }
}

async function loadSnapshots(
  fileEntries: ContextFile[],
): Promise<Map<string, ContextFileSnapshot>> {
  const snapshots = new Map<string, ContextFileSnapshot>()
  await Promise.all(
    fileEntries.map(async (fileEntry) => {
      snapshots.set(fileEntry.id, {
        content: await fs.promises.readFile(fileEntry.absolutePath, 'utf8'),
      })
    }),
  )
  return snapshots
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function printResults(
  report: BenchmarkReport<ScaleName>,
  reportPaths: {
    latestJson: string
    latestMd: string
  },
): void {
  console.log(`Lupinum Context benchmark suite (${report.scale})`)
  console.log(
    `Fixture: ${report.fixture.totalFiles} total files, ${report.fixture.selectedFiles} selected files`,
  )
  console.log(
    `Bytes: ${report.fixture.totalBytes} total, ${report.fixture.selectedBytes} selected, largest file ${report.fixture.largestFileBytes}, deepest path ${report.fixture.deepestPathSegments} segments`,
  )
  console.log('')
  console.log('name                 mean ms   p95 ms   min ms   max ms   iterations')

  for (const result of report.results) {
    console.log(
      `${result.name.padEnd(20)} ${formatNumber(result.meanMs).padStart(8)} ${formatNumber(
        result.p95Ms,
      ).padStart(8)} ${formatNumber(result.minMs).padStart(8)} ${formatNumber(
        result.maxMs,
      ).padStart(8)} ${String(result.iterations).padStart(12)}`,
    )
  }

  if (report.comparison.length > 0) {
    console.log('')
    console.log('comparison vs previous latest')
    console.log('name                 mean Δms  mean Δ%  p95 Δms   p95 Δ%')
    for (const comparison of report.comparison) {
      console.log(
        `${comparison.name.padEnd(20)} ${formatSignedNumber(comparison.meanDeltaMs).padStart(
          8,
        )} ${formatSignedPercent(comparison.meanDeltaPercent).padStart(
          8,
        )} ${formatSignedNumber(comparison.p95DeltaMs).padStart(8)} ${formatSignedPercent(
          comparison.p95DeltaPercent,
        ).padStart(9)}`,
      )
    }
  }

  console.log('')
  console.log(`saved latest json: ${reportPaths.latestJson}`)
  console.log(`saved latest md:   ${reportPaths.latestMd}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
