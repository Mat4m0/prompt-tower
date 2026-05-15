import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { assembleContext } from "../core/context/ContextAssembler";
import {
  readLatestReport,
  renderMarkdownReport,
  writeLatestReportFiles,
  type BenchmarkReport,
} from "../bench/reporting";
import {
  estimateTokenCountFromBytes,
  formatTreeTokenCount,
  recomputeTreeTokenCounts,
  updateLeafTreeTokenCounts,
  type TreeTokenNode,
} from "../core/tokens/TokenEstimator";
import {
  estimateTokensFromText,
  formatTokenCost,
  getTokenProfile,
} from "../core/tokens/TokenProfiles";
import { estimateContextCharacters } from "../core/context/ContextEstimate";
import { getSelectionRefinementDefinition } from "../core/files/FileKind";
import { FileIndex, type FileStat, type IndexedWorkspace } from "../core/files/FileIndex";
import { FileSelection } from "../core/files/FileSelection";
import {
  normalizePromptExportOptions,
  type PromptExportOptions,
} from "../core/export/ExportOptions";
import {
  buildPromptExportTarget,
  createWrapperTimestamp,
} from "../core/export/PromptFileWriter";
import { isRelativePathIgnored } from "../core/files/IgnoreRules";
import {
  createPromptPreset,
  duplicatePromptPreset,
  getCurrentPromptPresetVersion,
  restorePromptPresetVersion,
  savePromptPresetVersion,
  softDeletePromptPreset,
} from "../core/prompts/PromptPresetVersioning";
import { PromptPresetApplicationService } from "../app/PromptPresetApplicationService";
import { WorkspaceStateService } from "../app/WorkspaceStateService";
import { isWebviewMessage } from "../vscode/webview/webviewMessages";

const FIXTURE_ROOT = path.join(process.cwd(), "src", "test", "fixtures");

interface TestTreeTokenNode extends TreeTokenNode<TestTreeTokenNode> {
  name: string;
}

const CONTEXT_FIXTURE_TREE = "demo\n└─ src/\n   └─ example.ts";
const CONTEXT_FIXTURE_FILE = {
  id: "example",
  absolutePath: "/workspace/demo/src/example.ts",
  relativePath: "src/example.ts",
  name: "example.ts",
};
const CONTEXT_FIXTURE_SNAPSHOTS = new Map([
  ["example", { content: "\nexport const value = 1;\n\n" }],
]);

function createTokenNode(
  name: string,
  estimatedTokenCount: number,
  exactTokenCount?: number
): TestTreeTokenNode {
  return {
    name,
    estimatedTokenCount,
    exactTokenCount,
    displayTokenCount: 0,
    tokenCountStatus: "estimated",
  };
}

test("tree token helpers estimate and format compact labels", () => {
  assert.equal(estimateTokenCountFromBytes(0), 0);
  assert.equal(estimateTokenCountFromBytes(1), 1);
  assert.equal(estimateTokenCountFromBytes(16), 5);
  assert.equal(
    estimateTokenCountFromBytes(1_272_939, getTokenProfile("claude"), "shape.ts"),
    326_395
  );
  assert.equal(
    estimateTokenCountFromBytes(1_272_939, getTokenProfile("openai"), "shape.ts"),
    305_262
  );
  assert.equal(
    estimateTokenCountFromBytes(67_469, getTokenProfile("gemini"), "shape.dat"),
    60_241
  );
  assert.equal(
    estimateTokenCountFromBytes(1_272_939, getTokenProfile("gemini"), "shape.ts"),
    370_041
  );
  assert.equal(formatTreeTokenCount(842, "estimated"), "~842");
  assert.equal(formatTreeTokenCount(842, "exact"), "842");
  assert.equal(formatTreeTokenCount(1800, "estimated"), "~1.8k");
  assert.equal(formatTreeTokenCount(1200000, "estimated"), "~1.2m");
});

test("token profiles estimate calibrated sample counts and input costs", () => {
  const numericText = "1234.5678 -9012.3456\n".repeat(3_300).slice(0, 67_469);
  const lupinumSourceContextChars = "x".repeat(1_272_939);

  assert.equal(
    estimateTokensFromText(numericText, getTokenProfile("claude")),
    40_401
  );
  assert.equal(
    estimateTokensFromText(numericText, getTokenProfile("openai")),
    37_693
  );
  assert.equal(
    estimateTokensFromText(numericText, getTokenProfile("gemini")),
    60_241
  );
  assert.equal(
    estimateTokensFromText(lupinumSourceContextChars, getTokenProfile("claude")),
    326_395
  );
  assert.equal(
    estimateTokensFromText(lupinumSourceContextChars, getTokenProfile("openai")),
    305_262
  );
  assert.equal(
    estimateTokensFromText(lupinumSourceContextChars, getTokenProfile("gemini")),
    370_041
  );

  assert.equal(formatTokenCost(40_406, getTokenProfile("claude")), "$0.6061");
  assert.equal(formatTokenCost(370_041, getTokenProfile("gemini")), "$0.1110");
});

test("context token estimate includes tree modes and minified wrapper shape", () => {
  const base = {
    prefix: "",
    suffix: "",
    selectedFileBlockChars: 100,
    selectedFileCount: 1,
    projectTree: "clipper2-ts\n└─ bench/",
  };

  const fullTreeChars = estimateContextCharacters({
    ...base,
    treeType: "fullFilesAndDirectories",
    minify: false,
  });
  const selectedTreeChars = estimateContextCharacters({
    ...base,
    treeType: "selectedFilesOnly",
    minify: false,
  });
  const directoriesOnlyChars = estimateContextCharacters({
    ...base,
    treeType: "fullDirectoriesOnly",
    minify: false,
  });
  const noTreeChars = estimateContextCharacters({
    ...base,
    treeType: "none",
    minify: false,
  });
  const minifiedChars = estimateContextCharacters({
    ...base,
    treeType: "fullFilesAndDirectories",
    minify: true,
  });

  assert.ok(fullTreeChars > noTreeChars);
  assert.equal(selectedTreeChars, fullTreeChars);
  assert.equal(directoriesOnlyChars, fullTreeChars);
  assert.ok(minifiedChars < fullTreeChars);
});

test("prompt export core normalizes names, formats, and timestamps", () => {
  const date = new Date(2026, 4, 15, 20, 55, 7);
  const options = normalizePromptExportOptions({
    fileName: " ../Audit: Run?.md ",
    format: "txt",
    includeTimestamp: true,
  });
  const target = buildPromptExportTarget("/workspace/project", options, date);

  assert.equal(options.fileName, "Audit-Run");
  assert.equal(options.format, "txt");
  assert.equal(options.location, "promptFolder");
  assert.equal(target.fileName, "Audit-Run-2026-05-15_20-55-07.txt");
  assert.equal(
    target.directoryPath,
    path.join("/workspace/project", ".prompt-lupinum", "prompts")
  );
  assert.equal(createWrapperTimestamp(date), date.toISOString());
});

test("prompt export core maps legacy prompttower location to prompt folder", () => {
  const options = normalizePromptExportOptions({
    location: "prompttower",
  } as unknown as Partial<PromptExportOptions>);

  assert.equal(options.location, "promptFolder");
});

test("prompt export core supports timestamp-free markdown at workspace root", () => {
  const options = normalizePromptExportOptions({
    fileName: "prompt.txt",
    format: "md",
    location: "workspaceRoot",
    includeTimestamp: false,
  });
  const target = buildPromptExportTarget(
    "/workspace/project",
    options,
    new Date(2026, 4, 15, 20, 55, 7)
  );

  assert.equal(target.directoryPath, "/workspace/project");
  assert.equal(target.fileName, "prompt.md");
  assert.equal(target.absolutePath, path.join("/workspace/project", "prompt.md"));
});

test("prompt export core rejects relative custom folders outside workspace", () => {
  const options: PromptExportOptions = normalizePromptExportOptions({
    location: "customFolder",
    customFolderPath: "../outside",
    customFolderPathMode: "relative",
  });

  assert.throws(
    () => buildPromptExportTarget("/workspace/project", options),
    /Custom folder must stay inside the workspace root/
  );
});

test("prompt export core requires absolute paths in absolute custom mode", () => {
  const options: PromptExportOptions = normalizePromptExportOptions({
    location: "customFolder",
    customFolderPath: "relative/path",
    customFolderPathMode: "absolute",
  });

  assert.throws(
    () => buildPromptExportTarget("/workspace/project", options),
    /Absolute custom folder path must be absolute/
  );
});

test("ignore rules include .contextignore before legacy .towerignore", () => {
  const groups = {
    builtin: ["node_modules/"],
    gitignore: ["dist/"],
    contextignore: ["fixtures/", "*.snap"],
    towerignore: ["legacy/"],
    manual: [],
  };

  assert.equal(isRelativePathIgnored("node_modules/pkg/index.js", groups), true);
  assert.equal(isRelativePathIgnored("dist/index.js", groups), true);
  assert.equal(isRelativePathIgnored("fixtures/demo.ts", groups), true);
  assert.equal(isRelativePathIgnored("src/output.snap", groups), true);
  assert.equal(isRelativePathIgnored("legacy/old.ts", groups), true);
  assert.equal(isRelativePathIgnored("src/index.ts", groups), false);
});

test("FileIndex refreshes once more when dirtied during refresh", async () => {
  const workspace: IndexedWorkspace = {
    id: "w",
    name: "demo",
    rootPath: "/repo",
  };
  let files = ["/repo/src/a.ts"];
  let listCalls = 0;
  const index = new FileIndex(
    {
      async listFiles() {
        listCalls++;
        if (listCalls === 1) {
          index.markDirty();
          files = ["/repo/src/a.ts", "/repo/src/b.ts"];
        }
        return files;
      },
      async statFile(absolutePath: string): Promise<FileStat> {
        return { sizeBytes: absolutePath.endsWith("b.ts") ? 80 : 40, mtimeMs: 1 };
      },
    },
    [workspace],
    getTokenProfile("claude")
  );

  await index.ensureFresh();

  assert.equal(listCalls, 2);
  assert.equal(index.getSnapshot().files.length, 2);
  assert.equal(index.getRefreshState(), "idle");
});

test("FileIndex updates metadata and token estimates after file changes", async () => {
  const workspace: IndexedWorkspace = {
    id: "w",
    name: "demo",
    rootPath: "/repo",
  };
  let sizeBytes = 40;
  const index = new FileIndex(
    {
      async listFiles() {
        return ["/repo/src/a.ts"];
      },
      async statFile() {
        return { sizeBytes, mtimeMs: sizeBytes };
      },
    },
    [workspace],
    getTokenProfile("claude")
  );

  await index.ensureFresh();
  const before = index.getSnapshot().files[0].estimatedTokens;
  sizeBytes = 400;
  index.markDirty();
  await index.ensureFresh();

  assert.ok(index.getSnapshot().files[0].estimatedTokens > before);
});

test("FileSelection restores tests after excluded test filter is re-enabled", async () => {
  const index = await createSelectionFixtureIndex([
    "src/app.ts",
    "src/app.test.ts",
  ]);
  const selection = new FileSelection();
  const snapshot = index.getSnapshot();
  selection.setNodeIncluded(snapshot, "w:src", true);
  selection.setFileKindExcluded(snapshot, "pattern:test", true);

  assert.deepEqual(
    selection.getSnapshot().selectedFiles.map((file) => file.relativePath),
    ["src/app.ts"]
  );

  selection.setFileKindExcluded(snapshot, "pattern:test", false);

  assert.deepEqual(
    selection.getSnapshot().selectedFiles.map((file) => file.relativePath).sort(),
    ["src/app.test.ts", "src/app.ts"]
  );
});

test("FileSelection keeps explicit child excludes across filter changes", async () => {
  const index = await createSelectionFixtureIndex([
    "src/app.ts",
    "src/app.test.ts",
  ]);
  const selection = new FileSelection();
  const snapshot = index.getSnapshot();
  selection.setNodeIncluded(snapshot, "w:src", true);
  selection.setNodeIncluded(snapshot, "w:src/app.ts", false);
  selection.setFileKindExcluded(snapshot, "pattern:test", true);
  selection.setFileKindExcluded(snapshot, "pattern:test", false);

  assert.deepEqual(
    selection.getSnapshot().selectedFiles.map((file) => file.relativePath),
    ["src/app.test.ts"]
  );
});

test("FileSelection derives new files under selected folders and filters tests", async () => {
  let index = await createSelectionFixtureIndex(["src/app.ts"]);
  const selection = new FileSelection();
  selection.setNodeIncluded(index.getSnapshot(), "w:src", true);

  index = await createSelectionFixtureIndex([
    "src/app.ts",
    "src/new.ts",
    "src/new.test.ts",
  ]);
  selection.setFileKindExcluded(index.getSnapshot(), "pattern:test", true);
  selection.reconcile(index.getSnapshot());

  assert.deepEqual(
    selection.getSnapshot().selectedFiles.map((file) => file.relativePath).sort(),
    ["src/app.ts", "src/new.ts"]
  );
});

test("FileSelection drops deleted selected files during reconcile", async () => {
  let index = await createSelectionFixtureIndex(["src/app.ts", "src/old.ts"]);
  const selection = new FileSelection();
  selection.setNodeIncluded(index.getSnapshot(), "w:src/old.ts", true);

  index = await createSelectionFixtureIndex(["src/app.ts"]);
  selection.reconcile(index.getSnapshot());

  assert.deepEqual(selection.getSnapshot().selectedFileIds, []);
  assert.deepEqual(selection.getPersistedIntent().includedNodeIds, []);
});

test("FileSelection folder checkbox ignores excluded file kinds", async () => {
  const index = await createSelectionFixtureIndex([
    "src/app.ts",
    "src/app.test.ts",
  ]);
  const selection = new FileSelection();
  const snapshot = index.getSnapshot();
  selection.setNodeIncluded(snapshot, "w:src", true);
  selection.setFileKindExcluded(snapshot, "pattern:test", true);

  assert.equal(selection.getSnapshot().checkboxStates.get("w:src"), "checked");
  assert.equal(
    selection.getSnapshot().checkboxStates.get("w:src/app.test.ts"),
    "unchecked"
  );
});

test("FileSelection persists and restores selection intent", async () => {
  const index = await createSelectionFixtureIndex([
    "src/app.ts",
    "src/app.test.ts",
  ]);
  const original = new FileSelection();
  original.setNodeIncluded(index.getSnapshot(), "w:src", true);
  original.setFileKindExcluded(index.getSnapshot(), "pattern:test", true);

  const restored = new FileSelection();
  restored.restoreIntent(index.getSnapshot(), original.getPersistedIntent());

  assert.deepEqual(
    restored.getSnapshot().selectedFiles.map((file) => file.relativePath),
    ["src/app.ts"]
  );
  assert.equal(restored.getSnapshot().filterGroups.at(-1)?.excluded, true);
});

test("FileSelection can include and exclude all filter groups", async () => {
  const index = await createSelectionFixtureIndex([
    "src/app.ts",
    "src/app.test.ts",
    "src/component.vue",
  ]);
  const selection = new FileSelection();
  const snapshot = index.getSnapshot();
  selection.setNodeIncluded(snapshot, "w:src", true);

  selection.excludeAllFilters(snapshot);
  assert.equal(selection.getSnapshot().selectedFiles.length, 0);
  assert.equal(
    selection.getSnapshot().filterGroups.every((group) => group.excluded),
    true
  );

  selection.resetFilters(snapshot);
  assert.deepEqual(
    selection.getSnapshot().selectedFiles.map((file) => file.relativePath).sort(),
    ["src/app.test.ts", "src/app.ts", "src/component.vue"]
  );
});

test("PromptPreset versioning is recoverable", () => {
  const preset = createPromptPreset("Audit", "v1", "2026-01-01T00:00:00.000Z", "p1");
  const edited = savePromptPresetVersion(preset, "v2", undefined, "2026-01-02T00:00:00.000Z");
  const restored = restorePromptPresetVersion(
    edited,
    preset.currentVersionId,
    "2026-01-03T00:00:00.000Z"
  );
  const duplicated = duplicatePromptPreset(restored, "2026-01-04T00:00:00.000Z", "p2");
  const deleted = softDeletePromptPreset(restored, "2026-01-05T00:00:00.000Z");

  assert.equal(edited.versions.length, 2);
  assert.equal(getCurrentPromptPresetVersion(restored).text, "v1");
  assert.equal(duplicated.id, "p2");
  assert.equal(getCurrentPromptPresetVersion(duplicated).text, "v1");
  assert.equal(deleted.deletedAt, "2026-01-05T00:00:00.000Z");
});

test("PromptPreset migration deduplicates old prefix history", async () => {
  const globalStorage = createMemoryStorage({
    "promptTower.prefixHistory": [
      { text: "Audit" },
      { text: "Audit" },
      { text: "Refactor" },
      { text: "" },
    ],
  });
  const workspaceStorage = createMemoryStorage({});
  const service = new PromptPresetApplicationService(
    globalStorage,
    workspaceStorage
  );

  await service.migrateOldPrefixHistory();
  await service.migrateOldPrefixHistory();

  assert.deepEqual(
    service.listPresets().map((preset) => getCurrentPromptPresetVersion(preset).text).sort(),
    ["Audit", "Refactor"]
  );
});

test("PromptPreset application service duplicates, restores, and soft deletes", async () => {
  const service = new PromptPresetApplicationService(
    createMemoryStorage({}),
    createMemoryStorage({})
  );
  const preset = await service.createPreset("Audit", "v1");
  const edited = await service.saveVersion(preset.id, "v2");
  await service.restoreVersion(edited.id, preset.currentVersionId);
  const duplicated = await service.duplicatePreset(edited.id);
  await service.deletePreset(edited.id);

  assert.equal(service.getActivePresetId(), duplicated.id);
  assert.deepEqual(
    service.listPresets().map((candidate) => candidate.id),
    [duplicated.id]
  );
  assert.equal(getCurrentPromptPresetVersion(duplicated).text, "v1");
});

test("WorkspaceState persists selection, context options, and export options", async () => {
  const storage = createMemoryStorage({});
  const state = new WorkspaceStateService(storage);
  await state.setSelectionIntent({
    includedNodeIds: ["w:src"],
    excludedNodeIds: [],
    excludedFileKindIds: ["pattern:test"],
  });
  await state.setTreeMode("fullDirectoriesOnly");
  await state.setOutputMode("compact");
  await state.setExportOptions({
    fileName: "Audit",
    format: "txt",
    location: "workspaceRoot",
  });
  await state.setTokenSummaryProfileIds(["claude", "gemini"]);

  assert.deepEqual(state.getSelectionIntent()?.includedNodeIds, ["w:src"]);
  assert.equal(state.getTreeMode(), "fullDirectoriesOnly");
  assert.equal(state.getOutputMode(), "compact");
  assert.equal(state.getExportOptions().fileName, "Audit");
  assert.equal(state.getExportOptions().format, "txt");
  assert.equal(state.getExportOptions().location, "workspaceRoot");
  assert.deepEqual(state.getTokenSummaryProfileIds(), ["claude", "gemini"]);
});

test("webview message guard rejects unknown and malformed messages", () => {
  assert.equal(isWebviewMessage({ type: "ready" }), true);
  assert.equal(isWebviewMessage({ type: "unknown.command" }), false);
  assert.equal(
    isWebviewMessage({ type: "context.copyPreview", text: "preview" }),
    true
  );
  assert.equal(isWebviewMessage({ type: "context.copyPreview" }), false);
  assert.equal(
    isWebviewMessage({
      type: "tokenSummary.setProfiles",
      profileIds: ["openai", "gemini"],
    }),
    true
  );
  assert.equal(
    isWebviewMessage({
      type: "prefix.restoreVersion",
      presetId: "p1",
      versionId: "v1",
    }),
    true
  );
  assert.equal(
    isWebviewMessage({ type: "prefix.restoreVersion", presetId: "p1" }),
    false
  );
});

test("ContextAssembler matches readable golden fixture", async () => {
  const result = assembleContext({
    files: [CONTEXT_FIXTURE_FILE],
    snapshots: CONTEXT_FIXTURE_SNAPSHOTS,
    prefix: "Audit prefix",
    suffix: "Review carefully.",
    projectTree: CONTEXT_FIXTURE_TREE,
    treeMode: "selectedFilesOnly",
    outputMode: "readable",
  });

  assert.equal(
    result.text,
    await readFixture("context/basic-readable.expected.xml")
  );
  assert.equal(result.fileCount, 1);
  assert.equal(result.warnings.length, 0);
});

test("ContextAssembler matches compact golden fixture", async () => {
  const result = assembleContext({
    files: [CONTEXT_FIXTURE_FILE],
    snapshots: CONTEXT_FIXTURE_SNAPSHOTS,
    prefix: "",
    projectTree: CONTEXT_FIXTURE_TREE,
    treeMode: "fullFilesAndDirectories",
    outputMode: "compact",
  });

  assert.equal(
    result.text,
    await readFixture("context/basic-compact.expected.xml")
  );
});

test("ContextAssembler omits tree when tree mode is none", async () => {
  const result = assembleContext({
    files: [CONTEXT_FIXTURE_FILE],
    snapshots: CONTEXT_FIXTURE_SNAPSHOTS,
    prefix: "",
    projectTree: CONTEXT_FIXTURE_TREE,
    treeMode: "none",
    outputMode: "readable",
  });

  assert.equal(result.text, await readFixture("context/tree-none.expected.xml"));
});

test("ContextAssembler emits tree-only output when no files are selected", async () => {
  const result = assembleContext({
    files: [],
    snapshots: new Map(),
    prefix: "",
    projectTree: CONTEXT_FIXTURE_TREE,
    treeMode: "fullDirectoriesOnly",
    outputMode: "readable",
  });

  assert.equal(result.text, await readFixture("context/tree-only.expected.xml"));
});

test("ContextAssembler reports missing file snapshots", async () => {
  const result = assembleContext({
    files: [CONTEXT_FIXTURE_FILE],
    snapshots: new Map(),
    prefix: "",
    projectTree: "",
    treeMode: "none",
    outputMode: "readable",
  });

  assert.equal(
    result.text,
    await readFixture("context/missing-file-warning.expected.xml")
  );
  assert.deepEqual(result.warnings, [
    {
      type: "missingFile",
      fileId: "example",
      path: "src/example.ts",
    },
  ]);
});

test("folder selection refinement keeps tests and declarations separate", () => {
  assert.deepEqual(getSelectionRefinementDefinition("Component.vue"), {
    id: "extension:.vue",
    label: ".vue files",
    sortLabel: ".vue",
  });
  assert.deepEqual(getSelectionRefinementDefinition("worker.ts"), {
    id: "extension:.ts",
    label: ".ts files",
    sortLabel: ".ts",
  });
  assert.deepEqual(getSelectionRefinementDefinition("worker.test.ts"), {
    id: "pattern:test",
    label: "Test files (*.test.*, *.spec.*)",
    sortLabel: "zz-test",
  });
  assert.deepEqual(getSelectionRefinementDefinition("worker.spec.tsx"), {
    id: "pattern:test",
    label: "Test files (*.test.*, *.spec.*)",
    sortLabel: "zz-test",
  });
  assert.deepEqual(getSelectionRefinementDefinition("types.d.ts"), {
    id: "pattern:declaration",
    label: "Declaration files (*.d.ts)",
    sortLabel: "zz-declaration",
  });
  assert.deepEqual(getSelectionRefinementDefinition("Dockerfile"), {
    id: "extension:(no extension)",
    label: "No extension",
    sortLabel: "(no extension)",
  });
});

test("tree token aggregation sums nested folders and marks mixed counts estimated", () => {
  const exactFile = createTokenNode("exact.ts", 40, 25);
  const estimatedFile = createTokenNode("estimated.ts", 80);
  const folder: TestTreeTokenNode = {
    name: "src",
    estimatedTokenCount: 0,
    displayTokenCount: 0,
    tokenCountStatus: "estimated",
    children: [exactFile, estimatedFile],
  };
  const root: TestTreeTokenNode = {
    name: "root",
    estimatedTokenCount: 0,
    displayTokenCount: 0,
    tokenCountStatus: "estimated",
    children: [folder],
  };
  exactFile.parent = folder;
  estimatedFile.parent = folder;
  folder.parent = root;

  recomputeTreeTokenCounts(root);

  assert.equal(folder.estimatedTokenCount, 120);
  assert.equal(folder.displayTokenCount, 105);
  assert.equal(folder.tokenCountStatus, "estimated");
  assert.equal(root.displayTokenCount, 105);
  assert.equal(root.tokenCountStatus, "estimated");
});

test("tree token exact replacement updates ancestor totals by delta", () => {
  const file = createTokenNode("file.ts", 100);
  const folder: TestTreeTokenNode = {
    name: "src",
    estimatedTokenCount: 0,
    displayTokenCount: 0,
    tokenCountStatus: "estimated",
    children: [file],
  };
  file.parent = folder;
  recomputeTreeTokenCounts(folder);

  updateLeafTreeTokenCounts(file, { exactTokenCount: 70 });

  assert.equal(file.displayTokenCount, 70);
  assert.equal(file.tokenCountStatus, "exact");
  assert.equal(folder.estimatedTokenCount, 100);
  assert.equal(folder.displayTokenCount, 70);
  assert.equal(folder.tokenCountStatus, "exact");

  updateLeafTreeTokenCounts(file, {
    estimatedTokenCount: 120,
    exactTokenCount: undefined,
  });

  assert.equal(file.displayTokenCount, 120);
  assert.equal(file.tokenCountStatus, "estimated");
  assert.equal(folder.estimatedTokenCount, 120);
  assert.equal(folder.displayTokenCount, 120);
  assert.equal(folder.tokenCountStatus, "estimated");
});

test("benchmark reporting writes latest files only", async () => {
  const reportsRoot = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "prompt-lupinum-report-test-")
  );

  try {
    const report: BenchmarkReport<"smoke"> = {
      generatedAt: "2026-01-01T00:00:00.000Z",
      scale: "smoke",
      fixture: {
        rootDir: "/tmp/fixture",
        totalFiles: 10,
        selectedFiles: 3,
        totalBytes: 1000,
        selectedBytes: 300,
        largestFileBytes: 200,
        deepestPathSegments: 5,
      },
      results: [
        {
          name: "tokens:full",
          description: "full token benchmark",
          iterations: 3,
          meanMs: 1,
          minMs: 1,
          maxMs: 1,
          p95Ms: 1,
        },
      ],
      comparison: [],
    };

    const paths = await writeLatestReportFiles(reportsRoot, report);
    const latestReport = await readLatestReport(reportsRoot, "smoke");
    const markdown = renderMarkdownReport(report);

    assert.ok(await fileExists(paths.latestJson));
    assert.ok(await fileExists(paths.latestMd));
    assert.equal(latestReport?.scale, "smoke");
    assert.match(markdown, /prompt\.lupinum benchmark report/);
    assert.match(markdown, /Fixture bytes:/);
    assert.equal(await fileExists(path.join(reportsRoot, "history")), false);
  } finally {
    await fs.promises.rm(reportsRoot, { recursive: true, force: true });
  }
});

async function fileExists(targetPath: string): Promise<boolean> {
  try {
    await fs.promises.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function readFixture(relativePath: string): Promise<string> {
  const content = await fs.promises.readFile(
    path.join(FIXTURE_ROOT, relativePath),
    "utf8"
  );
  return content.replace(/\n$/, "");
}

function createMemoryStorage(initial: Record<string, unknown>) {
  const values = new Map(Object.entries(initial));
  return {
    get<T>(key: string, fallback: T): T {
      return (values.has(key) ? values.get(key) : fallback) as T;
    },
    async update(key: string, value: unknown): Promise<void> {
      values.set(key, value);
    },
  };
}

async function createSelectionFixtureIndex(
  relativePaths: string[]
): Promise<FileIndex> {
  const workspace: IndexedWorkspace = {
    id: "w",
    name: "demo",
    rootPath: "/repo",
  };
  const index = new FileIndex(
    {
      async listFiles() {
        return relativePaths.map((relativePath) => `/repo/${relativePath}`);
      },
      async statFile(absolutePath: string) {
        return { sizeBytes: absolutePath.length * 10, mtimeMs: 1 };
      },
    },
    [workspace],
    getTokenProfile("claude")
  );
  await index.ensureFresh();
  return index;
}
