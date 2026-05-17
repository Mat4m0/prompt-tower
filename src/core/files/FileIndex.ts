import { estimateTokenCountFromBytes } from '../tokens/TokenEstimateProfiles'
import type { TokenEstimateProfile } from '../tokens/TokenEstimateProfiles'
import { getBaseName, getDirName, getExtension, joinPath, toPosixPath } from './pathUtils'

export type IndexedNodeKind = 'workspace' | 'directory' | 'file'
export type IndexRefreshState = 'idle' | 'dirty' | 'refreshing'

export interface IndexedWorkspace {
  id: string
  name: string
  rootPath: string
}

export interface IndexedFile {
  id: string
  kind: 'file'
  workspaceId: string
  absolutePath: string
  relativePath: string
  name: string
  extension: string | null
  sizeBytes: number
  mtimeMs: number
  parentId: string
  estimatedTokenCount: number
}

export interface IndexedDirectory {
  id: string
  kind: 'directory' | 'workspace'
  workspaceId: string
  absolutePath: string
  relativePath: string
  name: string
  parentId: string | null
  childIds: readonly string[]
  estimatedTokenCount: number
}

export type IndexedNode = IndexedFile | IndexedDirectory

export interface FileIndexSnapshot {
  nodes: ReadonlyMap<string, IndexedNode>
  rootIds: readonly string[]
  files: readonly IndexedFile[]
  version: number
}

export interface FileStat {
  sizeBytes: number
  mtimeMs: number
}

export interface FileIndexHost {
  listFiles(workspace: IndexedWorkspace): Promise<string[]>
  statFile(absolutePath: string): Promise<FileStat | null>
}

export interface FileIndexLogger {
  info(message: string): void
  error(message: string, error: unknown): void
}

type Listener = (snapshot: FileIndexSnapshot) => void

export class FileIndex {
  private nodes = new Map<string, IndexedNode>()
  private rootIds: string[] = []
  private files: IndexedFile[] = []
  private listeners = new Set<Listener>()
  private state: IndexRefreshState = 'dirty'
  private dirtyVersion = 1
  private refreshedVersion = 0
  private snapshotVersion = 0
  private refreshInFlight: Promise<void> | undefined

  constructor(
    private host: FileIndexHost,
    private workspaces: readonly IndexedWorkspace[],
    private tokenProfile: TokenEstimateProfile,
    private logger?: FileIndexLogger,
  ) {
    this.initializeWorkspaceRoots()
  }

  onDidChange(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  setWorkspaces(workspaces: readonly IndexedWorkspace[]): void {
    this.workspaces = workspaces
    this.initializeWorkspaceRoots()
    this.markDirty()
  }

  setTokenEstimateProfile(profile: TokenEstimateProfile): void {
    this.tokenProfile = profile
    this.recomputeEstimates()
    this.emit()
  }

  markDirty(): void {
    this.dirtyVersion += 1
    if (this.state !== 'refreshing') {
      this.state = 'dirty'
    }
  }

  getRefreshState(): IndexRefreshState {
    return this.state
  }

  getSnapshot(): FileIndexSnapshot {
    const nodes = new Map<string, IndexedNode>()
    const files: IndexedFile[] = []

    for (const [id, node] of this.nodes) {
      const cloned = cloneIndexedNode(node)
      nodes.set(id, cloned)
      if (cloned.kind === 'file') {
        files.push(cloned)
      }
    }

    return {
      nodes,
      rootIds: [...this.rootIds],
      files,
      version: this.snapshotVersion,
    }
  }

  findNode(nodeId: string): IndexedNode | undefined {
    return this.nodes.get(nodeId)
  }

  findFileByPath(absolutePath: string): IndexedFile | undefined {
    return this.files.find((file) => file.absolutePath === absolutePath)
  }

  async ensureFresh(): Promise<void> {
    if (!this.isDirty()) {
      return
    }

    if (this.refreshInFlight) {
      await this.refreshInFlight
      return this.ensureFresh()
    }

    this.refreshInFlight = this.refreshOnce()
    try {
      await this.refreshInFlight
    } finally {
      this.refreshInFlight = undefined
    }

    if (this.isDirty()) {
      await this.ensureFresh()
    }
  }

  private isDirty(): boolean {
    return this.dirtyVersion !== this.refreshedVersion
  }

  private async refreshOnce(): Promise<void> {
    const version = this.dirtyVersion
    this.state = 'refreshing'
    const startedAt = Date.now()
    this.logger?.info(
      `[index] refresh started: ${this.workspaces.length} workspace(s), dirtyVersion=${version}`,
    )
    const nodes = new Map<string, IndexedNode>()
    const rootIds: string[] = []
    const files: IndexedFile[] = []

    for (const workspace of this.workspaces) {
      const rootId = createNodeId(workspace.id, '')
      rootIds.push(rootId)
      nodes.set(rootId, {
        id: rootId,
        kind: 'workspace',
        workspaceId: workspace.id,
        absolutePath: workspace.rootPath,
        relativePath: '',
        name: workspace.name,
        parentId: null,
        childIds: [],
        estimatedTokenCount: 0,
      })

      const workspaceStartedAt = Date.now()
      this.logger?.info(`[index] listing ${workspace.name}: ${workspace.rootPath}`)
      const paths = await this.host.listFiles(workspace)
      this.logger?.info(
        `[index] listed ${workspace.name}: ${paths.length} path(s) in ${Date.now() - workspaceStartedAt}ms`,
      )
      for (const absolutePath of paths) {
        const stat = await this.host.statFile(absolutePath)
        if (!stat) {
          continue
        }

        const relativePath = toRelativePath(workspace.rootPath, absolutePath)
        const parentId = this.ensureDirectoryNodes(workspace, relativePath, nodes)
        const file = createIndexedFile(
          workspace,
          absolutePath,
          relativePath,
          parentId,
          stat,
          this.tokenProfile,
        )
        nodes.set(file.id, file)
        files.push(file)
        appendChild(nodes, parentId, file.id)
      }
    }

    sortDirectoryChildren(nodes)
    recomputeDirectoryEstimates(nodes, rootIds)

    this.nodes = nodes
    this.rootIds = rootIds
    this.files = files
    this.snapshotVersion += 1
    this.refreshedVersion = version
    this.state = this.isDirty() ? 'dirty' : 'idle'
    this.logger?.info(
      `[index] refresh finished: ${files.length} file(s), ${nodes.size} node(s), state=${this.state}, ${Date.now() - startedAt}ms`,
    )
    this.emit()
  }

  private initializeWorkspaceRoots(): void {
    const nodes = new Map<string, IndexedNode>()
    const rootIds: string[] = []
    for (const workspace of this.workspaces) {
      const rootId = createNodeId(workspace.id, '')
      rootIds.push(rootId)
      nodes.set(rootId, {
        id: rootId,
        kind: 'workspace',
        workspaceId: workspace.id,
        absolutePath: workspace.rootPath,
        relativePath: '',
        name: workspace.name,
        parentId: null,
        childIds: [],
        estimatedTokenCount: 0,
      })
    }
    this.nodes = nodes
    this.rootIds = rootIds
    this.files = []
    this.snapshotVersion += 1
    this.emit()
  }

  private ensureDirectoryNodes(
    workspace: IndexedWorkspace,
    fileRelativePath: string,
    nodes: Map<string, IndexedNode>,
  ): string {
    const directoryPath = getDirName(fileRelativePath)
    if (!directoryPath) {
      return createNodeId(workspace.id, '')
    }

    let parentId = createNodeId(workspace.id, '')
    let currentPath = ''
    for (const segment of directoryPath.split('/')) {
      currentPath = joinPath(currentPath, segment)
      const id = createNodeId(workspace.id, currentPath)
      if (!nodes.has(id)) {
        nodes.set(id, {
          id,
          kind: 'directory',
          workspaceId: workspace.id,
          absolutePath: joinPath(workspace.rootPath, currentPath),
          relativePath: currentPath,
          name: segment,
          parentId,
          childIds: [],
          estimatedTokenCount: 0,
        })
        appendChild(nodes, parentId, id)
      }
      parentId = id
    }
    return parentId
  }

  private recomputeEstimates(): void {
    const nodes = new Map<string, IndexedNode>()
    for (const [id, node] of this.nodes) {
      if (node.kind === 'file') {
        nodes.set(id, {
          ...node,
          estimatedTokenCount: estimateTokenCountFromBytes(
            node.sizeBytes,
            this.tokenProfile,
            node.name,
          ),
        })
      } else {
        nodes.set(id, { ...node, childIds: [...node.childIds], estimatedTokenCount: 0 })
      }
    }
    recomputeDirectoryEstimates(nodes, this.rootIds)
    this.nodes = nodes
    this.files = [...nodes.values()].filter((node): node is IndexedFile => node.kind === 'file')
    this.snapshotVersion += 1
  }

  private emit(): void {
    const snapshot = this.getSnapshot()
    for (const listener of this.listeners) {
      listener(snapshot)
    }
  }
}

function cloneIndexedNode(node: IndexedNode): IndexedNode {
  return node.kind === 'file' ? { ...node } : { ...node, childIds: [...node.childIds] }
}

function createIndexedFile(
  workspace: IndexedWorkspace,
  absolutePath: string,
  relativePath: string,
  parentId: string,
  stat: FileStat,
  profile: TokenEstimateProfile,
): IndexedFile {
  const name = getBaseName(relativePath)
  return {
    id: createNodeId(workspace.id, relativePath),
    kind: 'file',
    workspaceId: workspace.id,
    absolutePath,
    relativePath,
    name,
    extension: getExtension(name),
    sizeBytes: stat.sizeBytes,
    mtimeMs: stat.mtimeMs,
    parentId,
    estimatedTokenCount: estimateTokenCountFromBytes(stat.sizeBytes, profile, name),
  }
}

export function createNodeId(workspaceId: string, relativePath: string): string {
  return `${workspaceId}:${toPosixPath(relativePath)}`
}

function toRelativePath(workspaceRoot: string, absolutePath: string): string {
  const normalizedRoot = toPosixPath(workspaceRoot).replace(/\/$/, '')
  const normalizedPath = toPosixPath(absolutePath)
  return normalizedPath.startsWith(`${normalizedRoot}/`)
    ? normalizedPath.slice(normalizedRoot.length + 1)
    : normalizedPath
}

function appendChild(nodes: Map<string, IndexedNode>, parentId: string, childId: string): void {
  const parent = nodes.get(parentId)
  if (!parent || parent.kind === 'file' || parent.childIds.includes(childId)) {
    return
  }
  ;(parent.childIds as string[]).push(childId)
}

function sortDirectoryChildren(nodes: Map<string, IndexedNode>): void {
  for (const node of nodes.values()) {
    if (node.kind === 'file') {
      continue
    }
    ;(node.childIds as string[]).sort((leftId, rightId) => {
      const left = nodes.get(leftId)!
      const right = nodes.get(rightId)!
      if (left.kind !== right.kind) {
        return left.kind === 'directory' || left.kind === 'workspace' ? -1 : 1
      }
      return left.name.localeCompare(right.name)
    })
  }
}

function recomputeDirectoryEstimates(
  nodes: Map<string, IndexedNode>,
  rootIds: readonly string[],
): void {
  const visit = (nodeId: string): number => {
    const node = nodes.get(nodeId)
    if (!node) {
      return 0
    }
    if (node.kind === 'file') {
      return node.estimatedTokenCount
    }
    const total = node.childIds.reduce((sum, childId) => sum + visit(childId), 0)
    node.estimatedTokenCount = total
    return total
  }

  for (const rootId of rootIds) {
    visit(rootId)
  }
}
