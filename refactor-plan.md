# prompt.lupinum refactor plan

This plan turns `dream-spec.md` into an executable refactor path.

The goal is not to preserve Prompt Tower internals. The goal is to arrive at the focused `prompt.lupinum` architecture with the smallest safe sequence of hard cutovers.

## Principles For The Refactor

1. Delete before moving code.
2. Keep each phase shippable.
3. Add tests before changing behavior that affects generated output or selection invariants.
4. Do not add compatibility layers unless a marketplace transition explicitly requires them.
5. Do not keep old and new implementations side by side after a phase passes.
6. Make `src/core` pure. No `vscode` imports.
7. Keep `extension.ts` shrinking every phase after Phase 1.

## Target End State

Required final shape:

```txt
src/
+-- extension.ts
+-- app/
+-- core/
+-- vscode/
+-- test/
```

Required final invariants:

- `src/core/**` has no `vscode` imports.
- No GitHub files, commands, views, docs, storage keys, or context placeholders remain.
- Selection intent is canonical; effective selected files are derived.
- Context generation is pure and covered by golden tests.
- Prompt prefixes are versioned presets, not history snippets.
- Main UI is compact: prompt preset, tree mode, compact mode, token profile, create/copy/save, preview.
- Sidebar uses native Tree Views for files and selection filters.
- Copy/save runs `ensureFresh()` before building context.

## Phase 0: Baseline And Guardrails

Purpose: create a safe starting line before destructive refactors.

### Tasks

- Add this plan and keep `dream-spec.md`.
- Capture current behavior with tests for the parts we are keeping:
  - token profile estimates
  - file kind classification
  - selection filter behavior
  - context wrapper output
  - export filename formatting
- Add a simple architecture test script:
  - fail if `src/core/**` imports `vscode`
  - later fail if GitHub symbols reappear
- Add `npm run test:architecture` and include it in `npm run validate`.

### Files

- Add `scripts/check-architecture.mjs`.
- Update `package.json`.
- Extend `src/test/index.ts` only as needed, or split tests into `src/test/core`.

### Acceptance

- `npm run check-types`
- `npm run lint`
- `npm test`
- `npm run test:architecture`
- `npm run validate`

### Stop Point

No product behavior changed. We can safely start deletion.

## Phase 1: Delete GitHub Completely

Purpose: remove the largest unrelated feature before architecture extraction.

### Delete Files

```txt
src/api/GitHubApiClient.ts
src/models/GitHubContext.ts
src/providers/GitHubIssuesProvider.ts
src/providers/GitHubPRsProvider.ts
src/services/githubContextFormatter.ts
src/utils/githubConfig.ts
docs/github-integration.md
```

### Remove Package Contributions

- `promptTowerPRsView`
- `promptTowerIssuesView`
- `promptTower.addGitHubToken`
- `promptTower.removeGitHubToken`
- `promptTower.refreshGitHubIssues`
- `promptTower.refreshGitHubPRs`
- GitHub view title menus
- GitHub command palette entries

### Remove Code Concepts

- `githubIssues`
- `githubPRs`
- GitHub providers in `extension.ts`
- GitHub context source interfaces
- GitHub sections in wrapper templates
- GitHub tests and fixtures
- GitHub token storage calls

### Context Generation Change

Hard-cut wrapper format to:

```xml
<context>
{treeBlock}<project_files>
{blocks}
</project_files>
</context>
```

No `{githubIssues}` or `{githubPRs}` placeholders.

### Acceptance

- `rg -i "github|pullrequest|issue" src package.json README.md docs` returns only allowed repository metadata or changelog references.
- `npm run validate`
- Manual smoke:
  - select files
  - create context
  - copy
  - save

### Stop Point

Prompt Tower still works as a file context tool, but GitHub is gone.

## Phase 2: Establish Pure Core Skeleton

Purpose: create the destination modules without changing UI behavior yet.

### Create Folders

```txt
src/core/context
src/core/files
src/core/prompts
src/core/tokens
src/core/export
src/core/shared
src/app
src/vscode
src/vscode/views
src/vscode/webview
```

### Move Pure Code First

Move and rename:

```txt
src/services/contextGenerationCore.ts -> src/core/context/FileBlockFormatter.ts
src/utils/fileTree.ts                 -> src/core/context/ProjectTreeBuilder.ts
src/services/contextTokenEstimate.ts  -> src/core/context/ContextEstimate.ts
src/services/tokenProfiles.ts         -> src/core/tokens/TokenProfiles.ts
src/utils/treeTokens.ts               -> src/core/tokens/TokenEstimator.ts
src/services/selectionRefinement.ts   -> src/core/files/FileKind.ts
src/services/TokenSelectionState.ts   -> src/core/tokens/TokenSelectionState.ts
```

Keep imports compiling with direct updates. Do not create re-export shims.

### Add Core Boundary Test

`scripts/check-architecture.mjs` must assert:

```txt
src/core files do not import "vscode"
src/core files do not import "../vscode"
src/core files do not import "../app"
```

### Acceptance

- `npm run validate`
- Architecture test passes.
- No behavior change expected.

### Stop Point

Core folder exists and is pure for the first extracted modules.

## Phase 3: Extract Context Assembly

Purpose: make context generation pure and testable.

### Create Core Types

```txt
src/core/context/ContextFormat.ts
src/core/context/ContextAssembler.ts
```

Types:

```ts
ContextBuildRequest
ContextBuildResult
ProjectTreeMode
ContextWarning
FileSnapshot
```

### Hard-Cut Behavior

- Remove custom user wrapper templates from v1 core path.
- Keep only readable and compact modes.
- Build context from explicit fields.
- Escape XML attributes.
- Preserve file content exactly.
- Missing snapshots produce warnings.

### Golden Fixtures

Create:

```txt
src/test/fixtures/context/basic-readable.expected.xml
src/test/fixtures/context/basic-compact.expected.xml
src/test/fixtures/context/tree-none.expected.xml
src/test/fixtures/context/tree-selected-files.expected.xml
src/test/fixtures/context/tree-full-directories.expected.xml
src/test/fixtures/context/missing-file-warning.expected.xml
```

### Adapter Update

`ContextGenerationService` becomes temporary adapter:

- reads VS Code file nodes
- loads snapshots
- calls `ContextAssembler`
- returns result

This adapter is deleted later when `WorkspaceSession` owns the flow.

### Acceptance

- Golden tests pass.
- `npm run validate`
- Generated context no longer depends on package configuration templates.

### Stop Point

Context output is pure and protected.

## Phase 4: Extract Export Core

Purpose: move file naming and save-path rules out of VS Code service code.

### Create

```txt
src/core/export/ExportOptions.ts
src/core/export/PromptFileWriter.ts
```

Core owns:

- filename sanitation
- timestamp suffix
- format normalization
- relative path validation
- save target calculation

VS Code adapter owns:

- directory creation
- file write through `vscode.workspace.fs`

### Update Defaults

New default folder:

```txt
.prompt-lupinum/prompts/
```

### Tests

- timestamp on/off
- invalid filename chars
- `.md` and `.txt`
- relative custom path cannot escape workspace
- absolute path requires absolute mode

### Acceptance

- `PromptExportService` shrinks to a VS Code adapter or is renamed into `src/vscode`.
- `npm run validate`

### Stop Point

Saving behavior is stable and pure rules are tested.

## Phase 5: Introduce FileIndex

Purpose: separate file discovery and metadata from tree rendering.

### Create

```txt
src/core/files/FileIndex.ts
src/core/files/IgnoreRules.ts
src/core/files/pathUtils.ts
src/vscode/VsCodeWorkspace.ts
src/vscode/VsCodeFileSystem.ts
```

### FileIndex Responsibilities

- Build `IndexedFile[]`.
- Build file tree data model independent of VS Code.
- Store file metadata.
- Apply ignore rules.
- Expose `ensureFresh()`.
- Emit index snapshot changes.

### Ignore Rules

Support:

```txt
built-in ignores
.gitignore
.contextignore
.towerignore legacy fallback
```

### Temporary Bridge

`MultiRootTreeProvider` may consume `FileIndexSnapshot` temporarily, but must no longer discover files itself after this phase.

### Tests

- ignore precedence
- `.contextignore`
- `.towerignore` fallback
- metadata update on changed file
- refresh loop runs once more if dirtied during refresh
- no overlapping refreshes

### Acceptance

- `FileDiscoveryService` is deleted or reduced to a VS Code adapter with no domain state.
- `MultiRootTreeProvider` loses discovery logic.
- `npm run validate`

### Stop Point

File indexing is a separate service.

## Phase 6: Replace Selection With SelectionIntent

Purpose: fix selection state at the foundation.

### Create

```txt
src/core/files/FileSelection.ts
```

### Core Model

```ts
SelectionIntent
EffectiveSelectionSnapshot
SelectionFilterGroup
```

Canonical state:

```txt
includeNodeIds
excludeNodeIds
excludedFileKindIds
```

Derived state:

```txt
effective selected file ids
tree checkbox states
filter group token totals
preview token estimate
```

### Required Behavior

- Selecting a folder selects descendants.
- Excluding tests removes test files.
- Re-enabling tests restores tests under selected folders.
- Explicitly unchecking a child keeps that child excluded even if parent stays included.
- New files under selected folders are included unless filtered out.
- Deleted files disappear without corrupting intent.

### Provider Update

- Replace `MultiRootTreeProvider` with `src/vscode/views/FileTreeProvider.ts`.
- Provider renders `FileIndexSnapshot + FileSelectionSnapshot`.
- Provider does not own selection rules.

### Tests

These are mandatory and should be core unit tests:

```txt
parent include + tests excluded + tests enabled restores tests
parent include + explicit child exclude + filter change keeps child out
new test file under selected folder stays out while tests excluded
new source file under selected folder is selected
deleted selected file is removed from effective selection
folder checkbox ignores excluded file kinds when deriving checked state
```

### Acceptance

- `MultiRootTreeProvider.ts` is deleted.
- `SelectionFiltersProvider` consumes core filter groups.
- `npm run validate`
- Manual smoke on a real workspace.

### Stop Point

The most important state model is correct.

## Phase 7: Prompt Presets

Purpose: replace prompt history with a real versioned preset system.

### Create

```txt
src/core/prompts/PromptPresetTypes.ts
src/core/prompts/PromptPresetVersioning.ts
src/core/prompts/PromptPresetStore.ts
src/core/prompts/promptPresetSchema.ts
src/app/PromptPresetApplicationService.ts
```

### Delete

```txt
src/services/PromptHistoryService.ts
```

### Storage

Use global storage:

```txt
prompt.lupinum.promptPresets
prompt.lupinum.promptPresetMigrationComplete
```

Use workspace storage:

```txt
prompt.lupinum.activePromptPresetId
prompt.lupinum.inlinePrefixText
```

### Operations

- create preset
- save new version
- restore version
- duplicate preset
- soft delete preset
- list active presets
- list deleted presets only if manager asks

### Migration

- Read old `promptTower.prefixHistory`.
- Offer import once in UI or command.
- Create one preset per unique text.
- Do not migrate suffix history unless product scope changes.

### Tests

- create creates v1
- edit creates v2 and changes current version
- restore old version creates new current version
- duplicate creates separate ids
- delete hides from normal list
- checksum is stable
- migration deduplicates old history

### Acceptance

- Main webview can select a preset.
- Prompt manager can create/edit/restore/delete.
- Old history service is gone.
- `npm run validate`

### Stop Point

Prompt management is a first-class feature.

## Phase 8: App Service Layer

Purpose: centralize orchestration outside providers and webview handlers.

### Create

```txt
src/app/bootstrap.ts
src/app/serviceContainer.ts
src/app/commandRegistry.ts
src/app/messageRouter.ts
src/app/eventBus.ts
src/app/workspaceSession.ts
src/app/ContextApplicationService.ts
```

### Move Responsibilities

From `extension.ts` into app:

- command registration
- webview message routing
- preview invalidation
- copy/save orchestration
- state broadcasts to views
- storage key reads/writes

### Service Container

Owns construction of:

- file index
- file selection
- prompt preset service
- context app service
- VS Code adapters
- providers
- webview provider

### Acceptance

- `extension.ts` only calls `bootstrapPromptLupinum(context)`.
- `extension.ts` under 80 lines.
- `npm run validate`

### Stop Point

The shell is clean. Adding commands no longer requires editing a giant activation file.

## Phase 9: Typed Webview And Compact UI

Purpose: simplify the main UI and make message flow safe.

### Split Webview Files

```txt
src/vscode/webview/webviewHtml.ts
src/vscode/webview/webviewStyles.ts
src/vscode/webview/webviewScript.ts
src/vscode/webview/webviewMessages.ts
```

Delete:

```txt
src/extension.webview.html.ts
src/extension.webview.css.ts
```

### Typed Messages

Implement `WebviewToExtensionMessage` and `ExtensionToWebviewMessage`.

No `message.command`.

### Compact Main Layout

Required controls:

```txt
Token profile + estimate
Prefix dropdown + Edit
Tree mode
Compact toggle
Create Context
Copy
Save
Preview
```

Remove:

- dashboard-like cards
- duplicate status webview
- old prefix/suffix history controls
- old reset flows that clear unrelated state silently

### Prompt Manager

Use inline drawer or compact manager section inside the same webview.

### Acceptance

- Main workflow is visible without scrolling on normal desktop.
- Webview message router is exhaustively typed.
- `npm run validate`
- Manual screenshot review in VS Code.

### Stop Point

UI matches the product loop.

## Phase 10: Rename Product Identity

Purpose: complete the hard cut to `prompt.lupinum`.

### Package Rename

Update:

- `name`
- `displayName`
- `description`
- categories and keywords
- command ids
- view ids
- configuration keys
- storage keys
- output folder
- README
- changelog heading
- icon if needed

### Suggested IDs

```txt
promptLupinum.files
promptLupinum.selectionFilters
promptLupinum.context
promptLupinum.copyContext
promptLupinum.createContext
promptLupinum.saveContext
promptLupinum.clearSelection
promptLupinum.resetSelectionFilters
promptLupinum.addCurrentFile
```

### Storage Migration

Do only required user data migration:

- prompt presets from old prefix history
- maybe token profile choice
- maybe export options

Do not migrate old GitHub state.

### Acceptance

- `rg "promptTower|Prompt Tower|prompt-tower" src package.json README.md` returns only deliberate migration references.
- `npm run validate`
- package and install locally.

### Stop Point

The product is now `prompt.lupinum`.

## Phase 11: Benchmark And Release Hardening

Purpose: make the new codebase fast by contract.

### Benchmarks

Add budgets:

```txt
selection toggle p95 < 1ms
filter toggle p95 < 2ms
context generation standard p95 < 50ms
context generation large selected p95 < 100ms
prompt preset save/list p95 < 2ms
```

Index scan budgets should be reported but not initially strict for remote filesystem variance.

### Release Smoke

Manual:

- install local VSIX
- open small repo
- open large repo
- select parent folder
- exclude tests
- re-enable tests
- create context
- copy
- save
- create prompt preset
- edit prompt preset
- restore old preset version
- reload VS Code and confirm state persists

### Acceptance

- `npm run validate`
- `npm run benchmark:smoke`
- local VSIX installed
- manual smoke done

## Suggested PR / Commit Slices

Use these as review boundaries:

1. `docs: add prompt.lupinum refactor plan`
2. `test: add architecture guardrails`
3. `refactor: remove github integration`
4. `refactor: extract pure token and tree core`
5. `refactor: extract pure context assembler`
6. `refactor: extract export rules`
7. `refactor: introduce file index`
8. `refactor: replace selection state with intent`
9. `feat: add versioned prompt presets`
10. `refactor: introduce app service layer`
11. `refactor: type webview message contract`
12. `ui: compact context panel`
13. `refactor: rename product to prompt.lupinum`
14. `test: add benchmark budgets and release smoke`

## Work Tracking Checklist

```txt
[x] Phase 0 guardrails
[x] Phase 1 delete GitHub
[x] Phase 2 pure core skeleton
[x] Phase 3 context assembler
[x] Phase 4 export core
[x] Phase 5 file index
[x] Phase 6 selection intent
[x] Phase 7 prompt presets
[x] Phase 8 app service layer
[x] Phase 9 typed compact webview
[x] Phase 10 product rename
[x] Phase 11 hardening
```

## Current Status

The refactor has reached the `prompt.lupinum` target architecture. Future work should be treated as focused hardening or product iteration, not as a continuation of the old Prompt Tower migration.

The remaining guardrails are maintained in `AGENTS.md`, `dream-spec.md`, `scripts/check-architecture.mjs`, and the golden tests under `src/test/fixtures/context`.

## Biggest Risks

### Selection Intent Migration

Risk: trying to preserve the old checked-node model while introducing intent.

Decision: hard cut. The old tree provider dies in Phase 6.

### Context Output Drift

Risk: output changes accidentally during extraction.

Decision: golden tests before major context refactor.

### UI Scope Creep

Risk: prompt manager becomes a large dashboard.

Decision: one compact webview, native sidebar views, no extra panels.

### Storage Compatibility

Risk: migration code keeps old concepts alive.

Decision: migrate only prompt history and basic UI state. Delete GitHub state.

### Refactor Size

Risk: doing app layer, file index, selection, webview, and prompt presets in one pass.

Decision: do not combine phases. Each phase has a stop point and validation.

## Definition Of Done

The refactor is complete when:

- The final architecture matches `dream-spec.md`.
- Every phase acceptance criterion has passed.
- `extension.ts` is under 80 lines.
- GitHub integration is fully deleted.
- Core has no `vscode` dependency.
- The selection restore behavior is covered by core tests.
- Prompt presets are versioned and recoverable.
- Generated context is covered by golden fixtures.
- The local VSIX passes manual smoke in a real workspace.
