import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { countTextTokens, countTextTokensLegacy } from "../services/tokenizer";
import { FileSnapshotService } from "../services/FileSnapshotService";
import {
  buildGitHubIssueTokenContent,
  buildGitHubPullRequestTokenContent,
} from "../services/githubContextFormatter";
import {
  readLatestReport,
  renderMarkdownReport,
  writeLatestReportFiles,
  type BenchmarkReport,
} from "../bench/reporting";

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
