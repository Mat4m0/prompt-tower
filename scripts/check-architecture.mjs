import { readdir, readFile, stat } from 'fs/promises'
import path from 'path'

const rootDir = process.cwd()
const coreDir = path.join(rootDir, 'src', 'core')
const appDir = path.join(rootDir, 'src', 'app')
const sharedDir = path.join(rootDir, 'src', 'shared')
const webviewDir = path.join(rootDir, 'src', 'webview')

const failures = []

if (await exists(coreDir)) {
  const files = await listFiles(coreDir)
  for (const file of files) {
    if (!/\.[cm]?tsx?$/.test(file)) {
      continue
    }

    const source = await readFile(file, 'utf8')
    const relativePath = path.relative(rootDir, file)

    if (hasImportFrom(source, 'vscode')) {
      failures.push(`${relativePath} imports vscode`)
    }

    if (hasImportPathMatching(source, /['"][.]{1,2}\/(?:.*\/)?vscode(?:\/|['"])/)) {
      failures.push(`${relativePath} imports from the VS Code adapter layer`)
    }

    if (hasImportPathMatching(source, /['"][.]{1,2}\/(?:.*\/)?app(?:\/|['"])/)) {
      failures.push(`${relativePath} imports from the app layer`)
    }
  }
}

if (await exists(appDir)) {
  const files = await listFiles(appDir)
  for (const file of files) {
    if (!/\.[cm]?tsx?$/.test(file)) {
      continue
    }

    const source = await readFile(file, 'utf8')
    const relativePath = path.relative(rootDir, file)

    if (hasImportFrom(source, 'vscode')) {
      failures.push(`${relativePath} imports vscode`)
    }

    if (hasImportPathMatching(source, /['"][.]{1,2}\/(?:.*\/)?vscode(?:\/|['"])/)) {
      failures.push(`${relativePath} imports from the VS Code adapter layer`)
    }
  }
}

if (await exists(sharedDir)) {
  const files = await listFiles(sharedDir)
  for (const file of files) {
    if (!/\.[cm]?tsx?$/.test(file)) {
      continue
    }

    const source = await readFile(file, 'utf8')
    const relativePath = path.relative(rootDir, file)

    if (hasImportFrom(source, 'vscode')) {
      failures.push(`${relativePath} imports vscode`)
    }

    if (hasImportPathMatching(source, /['"][.]{1,2}\/(?:.*\/)?vscode(?:\/|['"])/)) {
      failures.push(`${relativePath} imports from the VS Code adapter layer`)
    }

    if (hasImportPathMatching(source, /['"][.]{1,2}\/(?:.*\/)?app(?:\/|['"])/)) {
      failures.push(`${relativePath} imports from the app layer`)
    }
  }
}

if (await exists(webviewDir)) {
  const files = await listFiles(webviewDir)
  for (const file of files) {
    if (!/\.(?:[cm]?tsx?|vue)$/.test(file)) {
      continue
    }

    const source = await readFile(file, 'utf8')
    const relativePath = path.relative(rootDir, file)

    if (hasImportFrom(source, 'vscode')) {
      failures.push(`${relativePath} imports vscode`)
    }

    if (hasImportPathMatching(source, /['"][.]{1,2}\/(?:.*\/)?vscode(?:\/|['"])/)) {
      failures.push(`${relativePath} imports from the VS Code adapter layer`)
    }

    if (hasImportPathMatching(source, /['"][.]{1,2}\/(?:.*\/)?app(?:\/|['"])/)) {
      failures.push(`${relativePath} imports from the app layer`)
    }
  }
}

if (failures.length > 0) {
  console.error('Architecture checks failed:')
  for (const failure of failures) {
    console.error(`- ${failure}`)
  }
  process.exitCode = 1
} else {
  console.log('Architecture checks passed.')
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

function hasImportPathMatching(source, pattern) {
  const importExportPattern = /(?:import|export)\s+(?:[^'"]+\s+from\s+)?['"][^'"]+['"]/g
  const dynamicImportPattern = /import\(\s*['"][^'"]+['"]\s*\)/g
  return (
    [...source.matchAll(importExportPattern)].some((match) => pattern.test(match[0])) ||
    [...source.matchAll(dynamicImportPattern)].some((match) => pattern.test(match[0]))
  )
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
