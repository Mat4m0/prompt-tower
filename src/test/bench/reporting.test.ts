import { test } from 'vite-plus/test'
import assert from 'node:assert/strict'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import {
  readLatestReport,
  renderMarkdownReport,
  writeLatestReportFiles,
  type BenchmarkReport,
} from '../../bench/reporting'
import { fileExists } from '../helpers'

test('benchmark reporting writes latest files only', async () => {
  const reportsRoot = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), 'prompt-lupinum-report-test-'),
  )

  try {
    const report: BenchmarkReport<'smoke'> = {
      generatedAt: '2026-01-01T00:00:00.000Z',
      scale: 'smoke',
      fixture: {
        rootDir: '/tmp/fixture',
        totalFiles: 10,
        selectedFiles: 3,
        totalBytes: 1000,
        selectedBytes: 300,
        largestFileBytes: 200,
        deepestPathSegments: 5,
      },
      results: [
        {
          name: 'tokens:full',
          description: 'full token benchmark',
          iterations: 3,
          meanMs: 1,
          minMs: 1,
          maxMs: 1,
          p95Ms: 1,
        },
      ],
      comparison: [],
    }

    const paths = await writeLatestReportFiles(reportsRoot, report)
    const latestReport = await readLatestReport(reportsRoot, 'smoke')
    const markdown = renderMarkdownReport(report)

    assert.ok(await fileExists(paths.latestJson))
    assert.ok(await fileExists(paths.latestMd))
    assert.equal(latestReport?.scale, 'smoke')
    assert.match(markdown, /prompt\.lupinum benchmark report/)
    assert.match(markdown, /Fixture bytes:/)
    assert.equal(await fileExists(path.join(reportsRoot, 'history')), false)
  } finally {
    await fs.promises.rm(reportsRoot, { recursive: true, force: true })
  }
})
