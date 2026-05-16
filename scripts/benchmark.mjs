import * as esbuild from 'esbuild'
import { mkdtemp, rm } from 'fs/promises'
import os from 'os'
import path from 'path'
import { pathToFileURL } from 'url'

// Benchmark-only exception: Vite+ owns the normal build/test loop, while this
// script uses esbuild to run the TypeScript benchmark entry without adding a
// second project-wide TS runner.
const tempDir = await mkdtemp(path.join(os.tmpdir(), 'lupinum-context-bundle-'))
const outfile = path.join(tempDir, 'benchmark.mjs')

try {
  await esbuild.build({
    entryPoints: ['src/bench/index.ts'],
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node22',
    outfile,
    logLevel: 'silent',
    sourcemap: false,
  })

  await import(pathToFileURL(outfile).href)
} finally {
  await rm(tempDir, { recursive: true, force: true })
}
