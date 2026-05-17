import { readdir, readFile, stat } from 'fs/promises'
import path from 'path'

const rootDir = process.cwd()
const coreDir = path.join(rootDir, 'src', 'core')
const failures = []

if (await exists(coreDir)) {
  for (const file of await listFiles(coreDir)) {
    if (!/\.[cm]?tsx?$/.test(file)) {
      continue
    }

    const source = await readFile(file, 'utf8')
    if (hasImportFrom(source, 'vscode')) {
      failures.push(`${path.relative(rootDir, file)} imports vscode`)
    }
  }
}

if (failures.length > 0) {
  console.error('Core boundary check failed:')
  for (const failure of failures) {
    console.error(`- ${failure}`)
  }
  process.exitCode = 1
} else {
  console.log('Core boundary check passed.')
}

async function exists(targetPath) {
  try {
    await stat(targetPath)
    return true
  } catch {
    return false
  }
}

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await listFiles(entryPath)))
    } else if (entry.isFile()) {
      files.push(entryPath)
    }
  }

  return files
}

function hasImportFrom(source, moduleName) {
  return new RegExp(
    `(?:import|export)\\s+(?:[^'"]+\\s+from\\s+)?['"]${escapeRegExp(moduleName)}['"]`,
  ).test(source)
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
