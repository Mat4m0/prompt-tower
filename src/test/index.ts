import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { countTextTokens, countTextTokensLegacy } from "../services/tokenizer";
import { FileSnapshotService } from "../services/FileSnapshotService";
import { TokenSelectionState } from "../services/TokenSelectionState";
import {
  buildGitHubIssueTokenContent,
  buildGitHubPullRequestTokenContent,
} from "../services/githubContextFormatter";
import {
  applyContextWrapperTemplate,
  formatContextFileContent,
} from "../services/contextGenerationCore";
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
} from "../utils/treeTokens";
import {
  estimateTokensFromText,
  formatTokenCost,
  getTokenProfile,
} from "../services/tokenProfiles";
import { estimateContextCharacters } from "../services/contextTokenEstimate";
import { getSelectionRefinementDefinition } from "../services/selectionRefinement";

interface TestTreeTokenNode extends TreeTokenNode<TestTreeTokenNode> {
  name: string;
}

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

test("countTextTokens matches legacy encode length for representative inputs", () => {
  const inputs = [
    "",
    "const answer = 42;\n",
    "# Title\n\nSome markdown with `code`.\n",
    "Grüße 👋 こんにちは\n",
    "function value() { return 'x'; }\n".repeat(500),
  ];

  for (const input of inputs) {
    assert.equal(countTextTokens(input), countTextTokensLegacy(input));
  }
});

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
    githubIssueChars: 0,
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

test("FileSnapshotService invalidates cached content on file changes", async () => {
  const snapshotService = new FileSnapshotService();
  const tempDir = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "prompt-tower-snapshot-test-")
  );
  const filePath = path.join(tempDir, "fixture.ts");

  try {
    await fs.promises.writeFile(filePath, "const value = 1;\n", "utf8");
    const initialSnapshot = await snapshotService.getSnapshot(filePath);
    assert.ok(initialSnapshot);
    assert.equal(initialSnapshot.content, "const value = 1;\n");

    await new Promise((resolve) => setTimeout(resolve, 10));
    await fs.promises.writeFile(filePath, "const value = 2;\n", "utf8");
    const updatedSnapshot = await snapshotService.getSnapshot(filePath);
    assert.ok(updatedSnapshot);
    assert.equal(updatedSnapshot.content, "const value = 2;\n");
    assert.notEqual(updatedSnapshot.mtimeMs, initialSnapshot.mtimeMs);
  } finally {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  }
});

test("GitHub context token fixtures remain non-empty and stable in shape", () => {
  const issueContent = buildGitHubIssueTokenContent({
    issue: {
      number: 7,
      title: "Fix tree rendering",
      state: "open",
      body: "Detailed issue body",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      labels: [{ name: "bug", color: "ff0000" }],
      user: { login: "octocat" },
      comments: 1,
      html_url: "https://github.com/org/repo/issues/7",
    },
    comments: [
      {
        id: 1,
        body: "Please include repro steps.",
        created_at: "2026-01-01T00:00:00Z",
        user: { login: "reviewer" },
      },
    ],
  });
  const prContent = buildGitHubPullRequestTokenContent({
    pr: {
      number: 9,
      title: "Optimize tokenizer",
      state: "open",
      html_url: "https://github.com/org/repo/pull/9",
    },
    diff: "diff --git a/file.ts b/file.ts\n+const value = 1;\n",
  });

  assert.match(issueContent, /Issue #7: Fix tree rendering/);
  assert.match(issueContent, /Comments:/);
  assert.match(prContent, /diff --git/);
  assert.ok(countTextTokens(issueContent) > 0);
  assert.ok(countTextTokens(prContent) > 0);
});

test("TokenSelectionState adds cached counts immediately on reselect", async () => {
  const counts = new Map([
    ["a.ts", 10],
    ["b.ts", 20],
  ]);
  let resolveCalls = 0;
  const selectionState = new TokenSelectionState(async (filePath) => {
    resolveCalls++;
    return { tokenCount: counts.get(filePath) ?? 0, cacheable: true };
  });

  selectionState.applySelectionDelta(["a.ts", "b.ts"], []);
  await selectionState.waitForIdle();
  assert.equal(selectionState.getSnapshot().selectedTokenTotal, 30);
  assert.equal(resolveCalls, 2);

  selectionState.applySelectionDelta([], ["a.ts", "b.ts"]);
  assert.equal(selectionState.getSnapshot().selectedTokenTotal, 0);

  selectionState.applySelectionDelta(["a.ts"], []);
  assert.equal(selectionState.getSnapshot().selectedTokenTotal, 10);
  assert.equal(selectionState.getSnapshot().pendingTokenCount, 0);
  assert.equal(resolveCalls, 2);
});

test("TokenSelectionState removes pending paths without re-adding stale results", async () => {
  let resolvePath:
    | ((resolution: { tokenCount: number; cacheable: boolean }) => void)
    | undefined;
  const selectionState = new TokenSelectionState(
    (filePath) =>
      new Promise<{ tokenCount: number; cacheable: boolean }>((resolve) => {
        if (filePath === "slow.ts") {
          resolvePath = resolve;
          return;
        }
        resolve({ tokenCount: 5, cacheable: true });
      })
  );

  selectionState.applySelectionDelta(["slow.ts"], []);
  assert.equal(selectionState.getSnapshot().pendingTokenCount, 1);

  selectionState.applySelectionDelta([], ["slow.ts"]);
  assert.equal(selectionState.getSnapshot().selectedTokenTotal, 0);
  assert.equal(selectionState.getSnapshot().pendingTokenCount, 0);

  resolvePath?.({ tokenCount: 99, cacheable: true });
  await selectionState.waitForIdle();

  assert.equal(selectionState.getSnapshot().selectedTokenTotal, 0);
  assert.equal(selectionState.getSnapshot().selectedPathCount, 0);
});

test("TokenSelectionState replaceSelection keeps exact totals across refresh", async () => {
  const counts = new Map([
    ["a.ts", 10],
    ["b.ts", 20],
    ["c.ts", 30],
  ]);
  const selectionState = new TokenSelectionState(
    async (filePath) => ({
      tokenCount: counts.get(filePath) ?? 0,
      cacheable: true,
    })
  );

  selectionState.replaceSelection(["a.ts", "b.ts"]);
  await selectionState.waitForIdle();
  assert.equal(selectionState.getSnapshot().selectedTokenTotal, 30);

  selectionState.replaceSelection(["b.ts", "c.ts"]);
  await selectionState.waitForIdle();
  assert.equal(selectionState.getSnapshot().selectedTokenTotal, 50);

  selectionState.clearSelection();
  assert.equal(selectionState.getSnapshot().selectedTokenTotal, 0);
});

test("TokenSelectionState invalidates selected paths and recounts them", async () => {
  const counts = new Map([["a.ts", 10]]);
  const selectionState = new TokenSelectionState(
    async (filePath) => ({
      tokenCount: counts.get(filePath) ?? 0,
      cacheable: true,
    })
  );

  selectionState.applySelectionDelta(["a.ts"], []);
  await selectionState.waitForIdle();
  assert.equal(selectionState.getSnapshot().selectedTokenTotal, 10);

  counts.set("a.ts", 25);
  selectionState.invalidatePath("a.ts");
  assert.equal(selectionState.getSnapshot().selectedTokenTotal, 0);
  assert.equal(selectionState.getSnapshot().pendingTokenCount, 1);

  await selectionState.waitForIdle();
  assert.equal(selectionState.getSnapshot().selectedTokenTotal, 25);
});

test("minified context output compacts wrapper structure without mutating file content", () => {
  const fileEntry = {
    absolutePath: "/tmp/example.ts",
    relativePath: "src/example.ts",
  };
  const fileContent = "function demo() {\n\n  return 1;\n}\n";
  const minifiedBlock = formatContextFileContent(
    fileEntry,
    fileContent,
    {
      blockTemplate:
        '<file name="{fileNameWithExtension}" path="{rawFilePath}">\n{fileContent}\n</file>',
      blockTrimLines: true,
    },
    { minify: true }
  );
  const wrapped = applyContextWrapperTemplate({
    config: {
      blockTemplate:
        '<file name="{fileNameWithExtension}" path="{rawFilePath}">\n{fileContent}\n</file>',
      blockSeparator: "\n",
      blockTrimLines: true,
      wrapperTemplate:
        "<context>\n{githubIssues}{githubPRs}{treeBlock}<project_files>\n{blocks}\n</project_files>\n</context>",
      projectTree: {
        type: "fullFilesAndDirectories",
        template: "<project_tree>\n{projectTree}\n</project_tree>\n",
      },
    },
    fileBlocks: minifiedBlock,
    githubIssues: "",
    githubPRs: "",
    projectTree: "src/\n  example.ts",
    includeProjectTree: true,
    fileCount: 1,
    minify: true,
  });

  assert.match(minifiedBlock, /^<file path="\/src\/example\.ts">/);
  assert.match(minifiedBlock, /return 1;/);
  assert.equal(wrapped, "<context><project_tree>src/\n  example.ts</project_tree><project_files><file path=\"/src/example.ts\">function demo() {\n\n  return 1;\n}</file></project_files></context>");
});

test("wrapper omits project tree when tree type is none", () => {
  const wrapped = applyContextWrapperTemplate({
    config: {
      blockTemplate:
        '<file name="{fileNameWithExtension}" path="{rawFilePath}">\n{fileContent}\n</file>',
      blockSeparator: "\n",
      blockTrimLines: true,
      wrapperTemplate:
        "<context>\n{githubIssues}{githubPRs}{treeBlock}<project_files>\n{blocks}\n</project_files>\n</context>",
      projectTree: {
        type: "none",
        template: "<project_tree>\n{projectTree}\n</project_tree>\n",
      },
    },
    fileBlocks: '<file path="/src/example.ts">const value = 1;</file>',
    githubIssues: "",
    githubPRs: "",
    projectTree: "",
    includeProjectTree: false,
    fileCount: 1,
    minify: true,
  });

  assert.equal(
    wrapped,
    '<context><project_files><file path="/src/example.ts">const value = 1;</file></project_files></context>'
  );
});

test("benchmark reporting writes latest files only", async () => {
  const reportsRoot = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "prompt-tower-report-test-")
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
    assert.match(markdown, /Prompt Tower benchmark report/);
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
