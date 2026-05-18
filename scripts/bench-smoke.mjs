import { createServer } from 'vite'

const server = await createServer({
  appType: 'custom',
  configFile: false,
  root: process.cwd(),
  server: {
    middlewareMode: true,
  },
  ssr: {
    noExternal: ['ignore'],
  },
})

try {
  const { runBenchmarkCli } = await server.ssrLoadModule('/src/bench/benchmarkHarness.ts')
  await runBenchmarkCli(process.argv.slice(2), process.cwd())
} finally {
  await server.close()
}
