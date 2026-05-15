# prompt.lupinum dream spec

## Purpose

`prompt.lupinum` is the focused rewrite of Prompt Tower.

The product does one job:

1. Select codebase files.
2. Optionally choose a reusable prompt prefix.
3. Generate clean AI-ready context.
4. Copy or save it.

Everything else must justify itself against that loop.

## Product Boundary

### In Scope

- Native VS Code file selection tree.
- Native selection filters for selected file kinds, such as `.ts`, `.vue`, tests, declarations.
- Fast approximate token previews for Claude, OpenAI, and Gemini.
- Clean context generation with predictable XML-like wrappers.
- Compact prompt prefix management with versions.
- Copy generated context to clipboard.
- Save generated context to a file.
- Workspace-aware ignore rules.
- Fast tests, golden output fixtures, and benchmark budgets.

### Out Of Scope

- GitHub issues.
- GitHub pull requests.
- GitHub API clients.
- Browser automation.
- AI agent orchestration.
- Vendor API token counting.
- Background worker infrastructure unless a measured bottleneck proves it is needed.
- Generic template systems that let users redefine every wrapper shape.
- Multiple custom webviews for separate tasks.
- Compatibility shims for unreleased internal code.

The default answer for scope creep is no.

## Current Prompt Tower Findings

This spec is based on the current codebase, not only the desired product.

Current source shape:

```txt
src/extension.ts                         ~1398 lines
src/providers/MultiRootTreeProvider.ts   ~1093 lines
src/providers/GitHubIssuesProvider.ts     ~429 lines
src/providers/GitHubPRsProvider.ts        ~369 lines
src/services/ContextGenerationService.ts  ~468 lines
src/services/FileDiscoveryService.ts      ~418 lines
src/test/index.ts                         ~557 lines
```

Current pressure points:

- Extension activation owns too much command, view, webview, and service wiring.
- `MultiRootTreeProvider` mixes file index, selection state, selection filters, refresh loops, token estimates, and view rendering.
- Context generation has GitHub branches even though the primary product loop is file context.
- Prompt history is useful but not a real prompt preset system.
- The webview is compact enough to keep vanilla, but its message contract should be typed and explicit.
- Selection filters exposed an important invariant: the app must preserve selection intent, not only checked files.

## External API Research Notes

The rewrite should align with the VS Code platform rather than fight it.

- VS Code Tree Views are the right primitive for sidebar file and filter lists because they conform to native VS Code style and are designed for structured sidebar data.
- VS Code UX guidance says to keep view count low, use file icons for language files, prefer existing icons, and limit custom Webview Views.
- Webviews are appropriate for custom controls and preview surfaces, but message passing should be explicit and private to the webview script.
- VS Code `workspace.findFiles` and `workspace.fs` should be preferred over raw Node filesystem calls for workspace operations because VS Code says they perform well and work outside the editor process, including remote cases.
- `ExtensionContext.globalState` is the right home for personal prompt presets, while `workspaceState` is the right home for workspace-local UI state and file selection.

References:

- VS Code Tree View API: https://code.visualstudio.com/api/extension-guides/tree-view
- VS Code Webview API: https://code.visualstudio.com/api/extension-guides/webview
- VS Code Views UX Guidelines: https://code.visualstudio.com/api/ux-guidelines/views
- VS Code API reference, workspace and Memento: https://code.visualstudio.com/api/references/vscode-api

## Architecture Goals

The codebase should be boring, fast, and hard to break.

### Hard Rules

1. Core modules must not import `vscode`.
2. VS Code classes are adapters, not owners of business logic.
3. Every durable concept has one source of truth.
4. Derived state is rebuildable and tested.
5. File selection intent is stored separately from effective selected files.
6. Generated context has golden tests.
7. UI state changes flow through typed messages or typed commands.
8. No GitHub code remains in the new product.

### Layering

```txt
VS Code shell
  adapts VS Code API, views, commands, storage, clipboard

Application services
  coordinates file index, selection, prompts, context generation, export

Pure core
  context formatting, selection math, prompt versioning, token estimates
```

The dependency direction is always down:

```txt
vscode -> app -> core
```

Core never imports from `app` or `vscode`.

## Proposed Project Tree

```txt
prompt-lupinum
+-- package.json
+-- README.md
+-- AGENTS.md
+-- dream-spec.md
+-- scripts/
|   +-- test.mjs
|   +-- benchmark.mjs
|   +-- check-fixtures.mjs
+-- benchmarks/
|   +-- reports/
+-- src/
|   +-- extension.ts
|   +-- app/
|   |   +-- bootstrap.ts
|   |   +-- commandRegistry.ts
|   |   +-- eventBus.ts
|   |   +-- messageRouter.ts
|   |   +-- serviceContainer.ts
|   |   +-- workspaceSession.ts
|   +-- core/
|   |   +-- context/
|   |   |   +-- ContextAssembler.ts
|   |   |   +-- ContextFormat.ts
|   |   |   +-- FileBlockFormatter.ts
|   |   |   +-- ProjectTreeBuilder.ts
|   |   |   +-- contextFixtures.ts
|   |   +-- files/
|   |   |   +-- FileIndex.ts
|   |   |   +-- FileSelection.ts
|   |   |   +-- FileSnapshotStore.ts
|   |   |   +-- IgnoreRules.ts
|   |   |   +-- pathUtils.ts
|   |   +-- prompts/
|   |   |   +-- PromptPresetStore.ts
|   |   |   +-- PromptPresetTypes.ts
|   |   |   +-- PromptPresetVersioning.ts
|   |   |   +-- promptPresetSchema.ts
|   |   +-- tokens/
|   |   |   +-- TokenEstimator.ts
|   |   |   +-- TokenProfiles.ts
|   |   |   +-- TokenSelectionState.ts
|   |   +-- export/
|   |   |   +-- ExportOptions.ts
|   |   |   +-- PromptFileWriter.ts
|   |   +-- shared/
|   |       +-- Clock.ts
|   |       +-- DisposableStore.ts
|   |       +-- Result.ts
|   |       +-- assertNever.ts
|   +-- vscode/
|   |   +-- VsCodeClipboard.ts
|   |   +-- VsCodeFileSystem.ts
|   |   +-- VsCodeStorage.ts
|   |   +-- VsCodeWorkspace.ts
|   |   +-- views/
|   |   |   +-- FileTreeProvider.ts
|   |   |   +-- SelectionFiltersProvider.ts
|   |   |   +-- ContextWebviewProvider.ts
|   |   +-- webview/
|   |       +-- webviewHtml.ts
|   |       +-- webviewMessages.ts
|   |       +-- webviewScript.ts
|   |       +-- webviewStyles.ts
|   +-- test/
|       +-- core/
|       +-- fixtures/
|       +-- integration/
|       +-- helpers/
```

`extension.ts` should stay tiny:

```ts
export function activate(context: vscode.ExtensionContext) {
  const app = bootstrapPromptLupinum(context)
  context.subscriptions.push(app)
}

export function deactivate() {}
```

Target: under 80 lines.

## Domain Model

### Indexed Files

```ts
export interface IndexedFile {
  id: FileId
  absolutePath: string
  relativePath: string
  workspaceId: WorkspaceId
  name: string
  extension: string | null
  sizeBytes: number
  mtimeMs: number
  kind: FileKind
}

export type FileKind =
  | { type: 'extension'; extension: string | null }
  | { type: 'test' }
  | { type: 'declaration' }
```

`kind` is computed once by core file classification logic. Selection filters consume it. UI does not re-classify paths.

### Selection Intent

This is the most important correction from the current iteration.

Do not store selected files as the only source of truth. Store user intent.

```ts
export interface SelectionIntent {
  includeNodeIds: readonly FileTreeNodeId[]
  excludeNodeIds: readonly FileTreeNodeId[]
  excludedFileKindIds: readonly FileKindId[]
}
```

Effective selected files are derived:

```txt
effectiveSelectedFiles =
  descendants(includeNodeIds)
  - descendants(excludeNodeIds)
  - filesMatching(excludedFileKindIds)
```

Why this matters:

- If the user selects `src/`, then excludes tests, test files disappear from context.
- If the user enables tests again, tests under `src/` come back automatically.
- If files are added under a selected folder, they become selected unless filtered out.
- If filters change, selection can be rebuilt without losing intent.

Tree checkbox state is derived from effective selection and filter rules. The tree view never owns selection truth.

### Selection Filters

```ts
export interface SelectionFilterGroup {
  id: FileKindId
  label: string
  iconHint: 'file' | 'test' | 'type' | 'other'
  selectedFiles: number
  selectedTokenEstimate: number
  excludedFiles: number
  excludedTokenEstimate: number
  excluded: boolean
}
```

Rules:

- Only show groups relevant to current selection intent or currently excluded groups.
- Included groups show approximate selected token count.
- Excluded groups stay visible and show approximate excluded token count.
- Re-enabling a group rebuilds effective selection from intent.

### Context Build Request

```ts
export interface ContextBuildRequest {
  files: readonly IndexedFile[]
  snapshots: ReadonlyMap<FileId, FileSnapshot>
  prefix: string
  suffix?: string
  treeMode: ProjectTreeMode
  outputMode: 'readable' | 'compact'
  tokenProfileId: TokenProfileId
  createdAt: string
}

export interface ContextBuildResult {
  text: string
  fileCount: number
  characterCount: number
  estimatedTokens: number
  warnings: readonly ContextWarning[]
}
```

The builder receives data and returns a string. It does not read files, touch clipboard, read VS Code settings, or write output.

## File Index

`FileIndex` owns the indexed file list and file tree shape.

Responsibilities:

- Scan workspace folders.
- Apply built-in ignores, `.gitignore`, `.contextignore`, and legacy `.towerignore`.
- Track file metadata: path, size, mtime.
- Emit `indexChanged`.
- Support `ensureFresh()` before copy/save.

Non-responsibilities:

- It does not store selected state.
- It does not render VS Code tree items.
- It does not generate context.
- It does not tokenize.

Recommended interface:

```ts
export interface FileIndex {
  getSnapshot(): FileIndexSnapshot
  ensureFresh(): Promise<FileIndexSnapshot>
  markDirty(reason: FileIndexDirtyReason): void
}
```

Refresh loop:

```txt
file event
  -> mark dirty(version++)
  -> debounce 250ms
  -> refresh if idle
  -> if version changed during refresh, refresh once more
  -> idle
```

No overlapping refreshes.

## Ignore Rules

Use `.contextignore` as the new product file.

Supported sources:

```txt
built-in ignores
.gitignore
.contextignore
.towerignore legacy fallback
```

Precedence:

```txt
built-in ignores
then .gitignore when enabled
then .contextignore
then .towerignore
```

Built-in ignores must be categorized and tested:

```txt
dependencies: node_modules, vendor, .pnpm-store
build outputs: dist, build, out, coverage
generated: .next, .nuxt, .turbo, .cache
vcs: .git, .svn
binary/media: images, archives, fonts, videos
```

The fastest token counter is the one never called.

## Token Architecture

The token system should be estimate-first.

### Profiles

Only expose:

```txt
Claude
OpenAI
Gemini
```

Each profile has content-aware ratios:

```ts
export interface TokenProfile {
  id: 'claude' | 'openai' | 'gemini'
  label: string
  inputPricePerMTok: number
  ratios: {
    sourceCharsPerToken: number
    numericCharsPerToken: number
    proseCharsPerToken: number
  }
}
```

Current calibration learning:

- Numeric-heavy `.dat` files behave very differently from source.
- Gemini source around `3.44 chars/token` matched the lupinum-shape source copy test better than the numeric ratio.
- Gemini numeric around `1.12 chars/token` matched the clipper numeric bench sample better.
- Flat chars-per-token per vendor is not good enough.

### Estimation Rules

Tree labels:

```txt
estimate from bytes + file kind
```

Preview before creation:

```txt
estimate selected file wrappers + selected bytes + prefix + suffix + selected tree mode
```

After context creation:

```txt
estimate the actual generated context string
```

No stale exact count should survive profile or context-shape changes.

### Exact Token Counting

Do not make exact token counting part of the product promise in v1.

If a local tokenizer is kept later, it must be behind a single interface and must not create a second UI truth:

```ts
export interface TokenCounter {
  estimateText(text: string, profileId: TokenProfileId): TokenEstimate
  estimateFile(file: IndexedFile, profileId: TokenProfileId): TokenEstimate
}
```

## Context Generation

Use one canonical format.

Readable:

```xml
<context>
<project_tree>
src/
  index.ts
</project_tree>
<project_files>
<file name="index.ts" path="/src/index.ts">
console.log("hello");
</file>
</project_files>
</context>
```

Compact:

```xml
<context><project_tree>src/
  index.ts</project_tree><project_files><file path="/src/index.ts">console.log("hello");</file></project_files></context>
```

Rules:

- No GitHub placeholders.
- No user-editable wrapper template in v1.
- No global string replacement over arbitrary output.
- Build strings from explicit fields.
- Escape XML attribute values.
- Do not mutate file content.
- Missing files become warnings, not silent omissions.

Project tree modes:

```ts
export type ProjectTreeMode =
  | 'none'
  | 'selectedFilesOnly'
  | 'fullFilesAndDirectories'
  | 'fullDirectoriesOnly'
```

Every mode gets golden tests.

## Prompt Presets

Prompt prefix management is a core feature.

Replace prompt history with versioned prompt presets.

```ts
export interface PromptPreset {
  id: PromptPresetId
  name: string
  description?: string
  kind: 'prefix'
  currentVersionId: PromptPresetVersionId
  createdAt: string
  updatedAt: string
  deletedAt?: string
  versions: readonly PromptPresetVersion[]
}

export interface PromptPresetVersion {
  id: PromptPresetVersionId
  text: string
  note?: string
  createdAt: string
  checksum: string
}
```

Storage:

```txt
globalState:
  prompt.lupinum.promptPresets

workspaceState:
  prompt.lupinum.activePromptPresetId
  prompt.lupinum.inlinePrefixText
  prompt.lupinum.treeMode
  prompt.lupinum.outputMode
  prompt.lupinum.tokenProfileId
  prompt.lupinum.selectionIntent
```

Behavior:

- Create preset creates version 1.
- Save edit creates a new version.
- Restore old version creates a new current version copied from that old text.
- Duplicate creates a new preset with version 1.
- Delete is soft delete.
- No silent overwrite.

Migration from old prompt history:

- Read old `promptTower.prefixHistory`.
- Offer import once.
- Create presets named from the first line or `Imported Prefix N`.
- Preserve original timestamp in version note.
- Mark migration complete in global state.

## Prompt Manager UI

Keep the main UI compact.

Main panel:

```txt
prompt.lupinum
Claude | ~42k tokens | ~$0.63 input

Prefix  [Audit Prefix            v] [Edit]
Tree    [Selected files only      v] [ ] Compact
Output  [Create Context] [Copy] [Save]
Status  Synced just now

Preview
...
```

Prefix dropdown:

```txt
None
Inline prefix
Audit Prefix
Refactor Prefix
Security Review Prefix
Create New...
Manage Prefixes...
```

Prompt manager should be one webview drawer or inline panel, not a second editor tab.

Manager layout:

```txt
Prompt Prefixes

[New Prefix]

Audit Prefix
Security Review
Refactor Plan

Name
[Audit Prefix]

Current Text
[textarea]

Versions
v5 current today
v4 yesterday
v3 Apr 12

[Save New Version] [Restore Version] [Duplicate] [Delete]
```

UI rules:

- No large dashboard cards.
- No marketing copy.
- Use native Tree Views for file and filter lists.
- Use file icons for file-kind rows where VS Code can provide them.
- Main webview should contain only controls, prompt manager, and preview.
- All primary actions are visible without scrolling on normal desktop heights.

## VS Code UI Structure

Use a hybrid model:

```txt
Activity bar container: prompt.lupinum

Views:
  Files              native TreeView
  Selection Filters  native TreeView
  Context            one WebviewView
```

No GitHub views.

No separate status webview.

No extra panels unless the user explicitly opens an expanded preview.

## Webview Contract

The webview should use typed messages.

```ts
export type WebviewToExtensionMessage =
  | { type: 'context.create' }
  | { type: 'context.copyPreview' }
  | { type: 'context.savePreview' }
  | { type: 'prefix.setInlineText'; text: string }
  | { type: 'prefix.selectPreset'; presetId: string | null }
  | { type: 'prefix.createPreset'; name: string; text: string }
  | { type: 'prefix.saveVersion'; presetId: string; text: string; note?: string }
  | { type: 'prefix.restoreVersion'; presetId: string; versionId: string }
  | { type: 'prefix.deletePreset'; presetId: string }
  | { type: 'ui.setOptions'; options: Partial<ContextUiOptions> }

export type ExtensionToWebviewMessage =
  | { type: 'state.changed'; state: ContextPanelState }
  | { type: 'context.previewUpdated'; preview: ContextPreviewState }
  | { type: 'toast'; level: 'info' | 'warning' | 'error'; message: string }
```

No loose `command` strings.

The message router owns validation and dispatch. Handlers call application services, not providers directly.

## Application Services

### WorkspaceSession

Coordinates one VS Code window session.

Owns:

- File index lifecycle.
- Selection intent.
- Active token profile.
- Active prompt preset and inline prefix.
- Preview invalidation.
- Copy/save orchestration.

Does not render UI.

### ContextApplicationService

Methods:

```ts
createPreview(): Promise<ContextBuildResult>
copyContext(): Promise<ContextBuildResult>
saveContext(options: ExportOptions): Promise<SavedPromptFile>
```

Before build:

```txt
await fileIndex.ensureFresh()
load selected file snapshots
assemble request
build context
estimate tokens from actual text
```

### PromptPresetApplicationService

Methods:

```ts
listPresets()
createPreset(input)
saveNewVersion(input)
restoreVersion(input)
duplicatePreset(input)
softDeletePreset(id)
```

All version behavior is pure core. VS Code storage only persists snapshots.

## Export

Default save path:

```txt
.prompt-lupinum/prompts/
```

Export options:

```ts
export interface ExportOptions {
  baseName: string
  format: 'md' | 'txt'
  location: 'promptLupinum' | 'workspaceRoot' | 'customFolder'
  customFolderPath?: string
  includeTimestamp: boolean
}
```

Rules:

- File name sanitation is pure and tested.
- Timestamp format is stable.
- Custom relative path must stay inside workspace.
- Absolute custom path must be explicit.
- Save must use `vscode.workspace.fs` through `VsCodeFileSystem`.

## Events

Use a small event bus in `app`, not ad hoc calls everywhere.

```ts
export type AppEvent =
  | { type: 'fileIndex.changed'; snapshot: FileIndexSnapshot }
  | { type: 'selection.changed'; snapshot: EffectiveSelectionSnapshot }
  | { type: 'tokens.changed'; snapshot: TokenSummary }
  | { type: 'promptPresets.changed' }
  | { type: 'preview.invalidated'; reason: PreviewInvalidationReason }
  | { type: 'preview.updated'; preview: ContextPreviewState }
```

Events update views. They do not contain business rules.

## Deletion List From Prompt Tower

For the new product, remove completely:

```txt
src/api/GitHubApiClient.ts
src/models/GitHubContext.ts
src/providers/GitHubIssuesProvider.ts
src/providers/GitHubPRsProvider.ts
src/services/githubContextFormatter.ts
src/utils/githubConfig.ts
docs/github-integration.md
```

Remove concepts:

```txt
githubIssues
githubPRs
GitHub token commands
GitHub issue tree
GitHub PR tree
GitHub formatter placeholders
GitHub token counting branches
GitHub docs and README marketing
```

Remove package contributions:

```txt
promptTowerPRsView
promptTowerIssuesView
promptTower.addGitHubToken
promptTower.removeGitHubToken
promptTower.refreshGitHubIssues
promptTower.refreshGitHubPRs
```

Hard delete. No compatibility layer.

## Tests

Use `node:test` for core and app tests.

### Core Unit Tests

```txt
FileSelection
  parent include + test filter exclude + re-enable restores tests
  parent include + explicit child exclude keeps child out
  new file under included folder becomes selected
  deleted file disappears without corrupting intent

TokenEstimator
  source profile ratios
  numeric profile ratios
  generated context string estimate
  cost formatting

ContextAssembler
  readable output
  compact output
  all project tree modes
  XML attribute escaping
  missing file warnings

PromptPresetStore
  create
  save version
  restore version
  duplicate
  soft delete
  list excludes deleted
  checksum changes only when text changes

Export
  filename sanitation
  timestamp formatting
  custom path validation
```

### Golden Tests

Golden files live in:

```txt
src/test/fixtures/context/
```

Example:

```txt
basic-readable.input.json
basic-readable.expected.xml
basic-compact.input.json
basic-compact.expected.xml
tree-selected-files.expected.xml
tree-full-directories.expected.xml
```

Any generated context change must be intentional and reviewed.

### Storage Migration Tests

Use fake storage adapters:

```txt
old prefix history -> prompt presets
old selected token profile -> new profile id
old .towerignore support remains as legacy input
```

### VS Code Integration Smoke Tests

Keep these few and valuable:

```txt
extension activates
file tree view registers
selection filters view registers
context webview registers
copy command completes on small fixture workspace
```

### Benchmark Budgets

Budgets should protect interaction speed, not force tokenizer precision.

```txt
file index smoke fixture p95 < 50ms
selection toggle p95 < 1ms
filter toggle p95 < 2ms
context generation standard fixture p95 < 50ms
context generation large selected fixture p95 < 100ms
prompt preset list/save p95 < 2ms
```

Full workspace scans depend on disk and remote environments, so benchmark them separately and report rather than failing CI too aggressively.

## Build And Quality Gates

Required commands:

```txt
npm run check-types
npm run lint
npm test
npm run benchmark:smoke
```

Before release:

```txt
npm run validate
npm run package
```

No e2e by default unless a UI or VS Code integration change requires it.

## Migration Plan

### Phase 0: New Identity

- Rename package, commands, storage keys, view ids, and output folder to `prompt.lupinum`.
- Keep no old Prompt Tower command aliases unless explicitly needed for marketplace transition.

### Phase 1: Delete GitHub

- Remove all GitHub files, commands, views, docs, storage, and context placeholders.
- Make tests pass.
- Confirm generated context no longer contains GitHub branches.

### Phase 2: Extract Pure Core

- Move context formatting, file tree building, token profiles, token estimation, export filename logic, and selection math into `src/core`.
- Add golden tests before changing output behavior.
- `core` must compile without `vscode`.

### Phase 3: Replace Selection Model

- Introduce `SelectionIntent`.
- Make effective selection derived.
- Rebuild file tree checkbox state from intent.
- Cover filter restore behavior with tests.

### Phase 4: Prompt Presets

- Add prompt preset store and versioning.
- Add migration from prompt history.
- Add compact prompt manager UI.
- Remove old prompt history UI and service.

### Phase 5: Slim VS Code Shell

- Create service container.
- Split command registry.
- Split message router.
- Shrink `extension.ts`.
- Providers render state only.

### Phase 6: Final Product Polish

- Tighten main webview layout.
- Verify native icons in tree/filter views.
- Add empty states.
- Add benchmark budgets.
- Package and run manual smoke test in a real workspace.

## Acceptance Criteria

The rewrite is successful when:

- `extension.ts` is under 80 lines.
- No file under `src/core` imports `vscode`.
- No GitHub source files or package contributions remain.
- Selecting a parent folder, excluding tests, then re-enabling tests restores those tests.
- Prompt presets support create, save version, restore version, duplicate, and soft delete.
- Context generation has golden tests for readable, compact, and all tree modes.
- The main UI fits the core workflow without scrolling on a normal desktop viewport.
- Token previews update immediately on selection, filter, prefix, tree mode, compact mode, and profile changes.
- Copy/save call `ensureFresh()` before building context.
- `npm run check-types`, `npm run lint`, `npm test`, and smoke benchmarks pass.

## Final Recommendation

Build `prompt.lupinum` as a focused rewrite, not as more layers on Prompt Tower.

The key architectural decision is this:

```txt
Selection intent is canonical.
Effective selected files are derived.
Tree UI is a rendering.
Context output is pure.
VS Code is an adapter.
```

That one decision prevents most of the state bugs we already saw, keeps the app fast, and makes future features straightforward.
