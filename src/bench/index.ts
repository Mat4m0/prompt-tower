import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { performance } from "perf_hooks";
import { encode } from "gpt-tokenizer";
import {
  applyContextWrapperTemplate,
  ContextCoreConfig,
  ContextFileEntry,
  formatContextFileBlock,
} from "../services/contextGenerationCore";
import { generateFileStructureTree } from "../utils/fileTree";

type ScaleName = "smoke" | "standard" | "large";

interface BenchmarkCase {
  name: string;
  description: string;
  run: () => Promise<void>;
}

interface BenchmarkStats {
  name: string;
  description: string;
  iterations: number;
  meanMs: number;
  minMs: number;
  maxMs: number;
  p95Ms: number;
}

interface BenchmarkComparison {
  name: string;
  meanDeltaMs: number;
  meanDeltaPercent: number;
  p95DeltaMs: number;
  p95DeltaPercent: number;
}

interface BenchmarkFixtureSummary {
  rootDir: string;
  totalFiles: number;
  selectedFiles: number;
}

interface BenchmarkReport {
  generatedAt: string;
  scale: ScaleName;
  fixture: BenchmarkFixtureSummary;
  results: BenchmarkStats[];
  comparison: BenchmarkComparison[];
}

interface FixtureSet {
  rootDir: string;
  allFiles: ContextFileEntry[];
  selectedFiles: ContextFileEntry[];
}

interface TreeFileEntry {
  origin: string;
  tree: string;
}

const DEFAULT_CONFIG: ContextCoreConfig = {
  blockTemplate:
    '<file name="{fileNameWithExtension}" path="{rawFilePath}">\n{fileContent}\n</file>',
  blockSeparator: "\n",
  blockTrimLines: true,
  wrapperTemplate:
    "<context>\n{githubIssues}{githubPRs}{treeBlock}<project_files>\n{blocks}\n</project_files>\n</context>",
  projectTree: {
    enabled: true,
    template: "<project_tree>\n{projectTree}\n</project_tree>\n",
  },
};

const SCALE_CONFIG: Record<
  ScaleName,
  {
    directories: number;
    filesPerDirectory: number;
    selectedEvery: number;
    iterations: number;
  }
> = {
  smoke: { directories: 8, filesPerDirectory: 15, selectedEvery: 3, iterations: 4 },
  standard: {
    directories: 24,
    filesPerDirectory: 35,
    selectedEvery: 4,
    iterations: 6,
  },
  large: {
    directories: 40,
    filesPerDirectory: 50,
    selectedEvery: 5,
    iterations: 8,
  },
};

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2));
  const scale = getScale(args);
  const jsonOutput = args.has("--json");
  const fixtureSet = await createFixtureSet(scale);

  try {
    const benchmarkCases = createBenchmarkCases(fixtureSet);
    const iterations = SCALE_CONFIG[scale].iterations;
    const results: BenchmarkStats[] = [];

    for (const benchmarkCase of benchmarkCases) {
      results.push(await measureBenchmark(benchmarkCase, iterations));
    }

    const fixture = {
      rootDir: fixtureSet.rootDir,
      totalFiles: fixtureSet.allFiles.length,
      selectedFiles: fixtureSet.selectedFiles.length,
    };
    const previousReport = await readLatestReport(scale);
    const report: BenchmarkReport = {
      generatedAt: new Date().toISOString(),
      scale,
      fixture,
      results,
      comparison: createComparison(results, previousReport?.results ?? []),
    };

    const reportPaths = await writeReportFiles(report);

    if (jsonOutput) {
      process.stdout.write(
        JSON.stringify(
          {
            ...report,
            reportPaths,
          },
          null,
          2
        ) + "\n"
      );
      return;
    }

    printResults(report, reportPaths);
  } finally {
    await fs.promises.rm(fixtureSet.rootDir, { recursive: true, force: true });
  }
}

function getScale(args: Set<string>): ScaleName {
  for (const arg of args) {
    if (!arg.startsWith("--scale=")) {
      continue;
    }

    const scale = arg.slice("--scale=".length) as ScaleName;
    if (scale in SCALE_CONFIG) {
      return scale;
    }
    throw new Error(`Unsupported benchmark scale: ${scale}`);
  }

  return "standard";
}

async function createFixtureSet(scale: ScaleName): Promise<FixtureSet> {
  const config = SCALE_CONFIG[scale];
  const rootDir = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "prompt-tower-bench-")
  );
  const allFiles: ContextFileEntry[] = [];
  const selectedFiles: ContextFileEntry[] = [];

  for (let directoryIndex = 0; directoryIndex < config.directories; directoryIndex++) {
    const groupDir = path.join(rootDir, `group-${directoryIndex.toString().padStart(2, "0")}`);
    const nestedDir = path.join(groupDir, `feature-${directoryIndex % 6}`);
    await fs.promises.mkdir(nestedDir, { recursive: true });

    for (let fileIndex = 0; fileIndex < config.filesPerDirectory; fileIndex++) {
      const fileName = `sample-${directoryIndex.toString().padStart(2, "0")}-${fileIndex
        .toString()
        .padStart(3, "0")}.ts`;
      const absolutePath = path.join(nestedDir, fileName);
      const relativePath = path.relative(rootDir, absolutePath);
      await fs.promises.writeFile(
        absolutePath,
        createFixtureFileContent(directoryIndex, fileIndex),
        "utf8"
      );

      const entry = { absolutePath, relativePath };
      allFiles.push(entry);

      if ((directoryIndex * config.filesPerDirectory + fileIndex) % config.selectedEvery === 0) {
        selectedFiles.push(entry);
      }
    }
  }

  return { rootDir, allFiles, selectedFiles };
}

function createFixtureFileContent(directoryIndex: number, fileIndex: number): string {
  const repeatedSection = Array.from({ length: 18 }, (_, blockIndex) =>
    [
      `export function fixture_${directoryIndex}_${fileIndex}_${blockIndex}(input: string): string {`,
      `  const label = "group-${directoryIndex}-file-${fileIndex}-block-${blockIndex}";`,
      "  return `${label}:${input}`;",
      "}",
      "",
    ].join("\n")
  ).join("\n");

  return [
    `// fixture ${directoryIndex}/${fileIndex}`,
    `export const meta = { directory: ${directoryIndex}, file: ${fileIndex} };`,
    "",
    repeatedSection,
  ].join("\n");
}

function createBenchmarkCases(fixtureSet: FixtureSet): BenchmarkCase[] {
  return [
    {
      name: "file-blocks:selected",
      description: "Read and format selected file blocks",
      run: async () => {
        await Promise.all(
          fixtureSet.selectedFiles.map((fileEntry) =>
            formatContextFileBlock(fileEntry, DEFAULT_CONFIG)
          )
        );
      },
    },
    {
      name: "tree:selected",
      description: "Generate project tree for selected files only",
      run: async () => {
        await generateFileStructureTree(
          fixtureSet.rootDir,
          toTreeEntries(fixtureSet.selectedFiles)
        );
      },
    },
    {
      name: "tree:full",
      description: "Generate project tree for the full repository view",
      run: async () => {
        await generateFileStructureTree(
          fixtureSet.rootDir,
          toTreeEntries(fixtureSet.allFiles)
        );
      },
    },
    {
      name: "tokens:selected",
      description: "Read and tokenize selected files",
      run: async () => {
        const contents = await Promise.all(
          fixtureSet.selectedFiles.map((fileEntry) =>
            fs.promises.readFile(fileEntry.absolutePath, "utf8")
          )
        );
        for (const content of contents) {
          encode(content);
        }
      },
    },
    {
      name: "tokens:full",
      description: "Read and tokenize the full repository fixture",
      run: async () => {
        const contents = await Promise.all(
          fixtureSet.allFiles.map((fileEntry) =>
            fs.promises.readFile(fileEntry.absolutePath, "utf8")
          )
        );
        for (const content of contents) {
          encode(content);
        }
      },
    },
    {
      name: "context:selected-tree",
      description: "End-to-end context generation with selected-files tree",
      run: async () => {
        const fileBlocks = await Promise.all(
          fixtureSet.selectedFiles.map((fileEntry) =>
            formatContextFileBlock(fileEntry, DEFAULT_CONFIG)
          )
        );
        const projectTree = await generateFileStructureTree(
          fixtureSet.rootDir,
          toTreeEntries(fixtureSet.selectedFiles)
        );
        applyContextWrapperTemplate({
          config: DEFAULT_CONFIG,
          fileBlocks: fileBlocks.join(DEFAULT_CONFIG.blockSeparator),
          githubIssues: "",
          githubPRs: "",
          projectTree,
          fileCount: fixtureSet.selectedFiles.length,
        });
      },
    },
    {
      name: "context:full-tree",
      description: "End-to-end context generation with full repository tree",
      run: async () => {
        const fileBlocks = await Promise.all(
          fixtureSet.selectedFiles.map((fileEntry) =>
            formatContextFileBlock(fileEntry, DEFAULT_CONFIG)
          )
        );
        const projectTree = await generateFileStructureTree(
          fixtureSet.rootDir,
          toTreeEntries(fixtureSet.allFiles)
        );
        applyContextWrapperTemplate({
          config: DEFAULT_CONFIG,
          fileBlocks: fileBlocks.join(DEFAULT_CONFIG.blockSeparator),
          githubIssues: "",
          githubPRs: "",
          projectTree,
          fileCount: fixtureSet.selectedFiles.length,
        });
      },
    },
  ];
}

function toTreeEntries(fileEntries: ContextFileEntry[]): TreeFileEntry[] {
  return fileEntries.map((fileEntry) => ({
    origin: fileEntry.absolutePath,
    tree: fileEntry.relativePath.replace(/\\/g, "/"),
  }));
}

async function measureBenchmark(
  benchmarkCase: BenchmarkCase,
  iterations: number
): Promise<BenchmarkStats> {
  await benchmarkCase.run();

  const samples: number[] = [];
  for (let iteration = 0; iteration < iterations; iteration++) {
    const start = performance.now();
    await benchmarkCase.run();
    samples.push(performance.now() - start);
  }

  const sortedSamples = [...samples].sort((left, right) => left - right);
  return {
    name: benchmarkCase.name,
    description: benchmarkCase.description,
    iterations,
    meanMs: average(samples),
    minMs: sortedSamples[0],
    maxMs: sortedSamples[sortedSamples.length - 1],
    p95Ms:
      sortedSamples[
        Math.min(
          sortedSamples.length - 1,
          Math.floor(sortedSamples.length * 0.95)
        )
      ],
  };
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

async function readLatestReport(
  scale: ScaleName
): Promise<BenchmarkReport | null> {
  const latestPath = path.join(
    process.cwd(),
    "benchmarks",
    "reports",
    `latest-${scale}.json`
  );

  try {
    const raw = await fs.promises.readFile(latestPath, "utf8");
    return JSON.parse(raw) as BenchmarkReport;
  } catch {
    return null;
  }
}

function createComparison(
  currentResults: BenchmarkStats[],
  previousResults: BenchmarkStats[]
): BenchmarkComparison[] {
  const previousByName = new Map(
    previousResults.map((result) => [result.name, result])
  );

  return currentResults
    .filter((result) => previousByName.has(result.name))
    .map((result) => {
      const previous = previousByName.get(result.name)!;
      return {
        name: result.name,
        meanDeltaMs: result.meanMs - previous.meanMs,
        meanDeltaPercent: percentageDelta(result.meanMs, previous.meanMs),
        p95DeltaMs: result.p95Ms - previous.p95Ms,
        p95DeltaPercent: percentageDelta(result.p95Ms, previous.p95Ms),
      };
    });
}

function percentageDelta(currentValue: number, previousValue: number): number {
  if (previousValue === 0) {
    return 0;
  }

  return ((currentValue - previousValue) / previousValue) * 100;
}

async function writeReportFiles(report: BenchmarkReport): Promise<{
  latestJson: string;
  latestMd: string;
  historyJson: string;
  historyMd: string;
}> {
  const reportsDir = path.join(process.cwd(), "benchmarks", "reports");
  const historyDir = path.join(reportsDir, "history");
  await fs.promises.mkdir(historyDir, { recursive: true });

  const safeTimestamp = report.generatedAt.replace(/[:.]/g, "-");
  const latestJson = path.join(reportsDir, `latest-${report.scale}.json`);
  const latestMd = path.join(reportsDir, `latest-${report.scale}.md`);
  const historyJson = path.join(
    historyDir,
    `${safeTimestamp}-${report.scale}.json`
  );
  const historyMd = path.join(historyDir, `${safeTimestamp}-${report.scale}.md`);

  const jsonPayload = JSON.stringify(report, null, 2);
  const markdownPayload = renderMarkdownReport(report);

  await Promise.all([
    fs.promises.writeFile(latestJson, jsonPayload + "\n", "utf8"),
    fs.promises.writeFile(latestMd, markdownPayload, "utf8"),
    fs.promises.writeFile(historyJson, jsonPayload + "\n", "utf8"),
    fs.promises.writeFile(historyMd, markdownPayload, "utf8"),
  ]);

  return { latestJson, latestMd, historyJson, historyMd };
}

function renderMarkdownReport(report: BenchmarkReport): string {
  const lines = [
    `# Prompt Tower benchmark report (${report.scale})`,
    "",
    `Generated: ${report.generatedAt}`,
    `Fixture: ${report.fixture.totalFiles} total files, ${report.fixture.selectedFiles} selected files`,
    "",
    "## Results",
    "",
    "| Benchmark | Mean (ms) | P95 (ms) | Min (ms) | Max (ms) | Iterations |",
    "| --- | ---: | ---: | ---: | ---: | ---: |",
    ...report.results.map(
      (result) =>
        `| ${result.name} | ${formatNumber(result.meanMs)} | ${formatNumber(
          result.p95Ms
        )} | ${formatNumber(result.minMs)} | ${formatNumber(
          result.maxMs
        )} | ${result.iterations} |`
    ),
  ];

  if (report.comparison.length > 0) {
    lines.push(
      "",
      "## Comparison To Previous Latest",
      "",
      "| Benchmark | Mean delta (ms) | Mean delta (%) | P95 delta (ms) | P95 delta (%) |",
      "| --- | ---: | ---: | ---: | ---: |",
      ...report.comparison.map(
        (comparison) =>
          `| ${comparison.name} | ${formatSignedNumber(
            comparison.meanDeltaMs
          )} | ${formatSignedPercent(
            comparison.meanDeltaPercent
          )} | ${formatSignedNumber(comparison.p95DeltaMs)} | ${formatSignedPercent(
            comparison.p95DeltaPercent
          )} |`
      )
    );
  }

  lines.push("");
  return lines.join("\n");
}

function printResults(
  report: BenchmarkReport,
  reportPaths: {
    latestJson: string;
    latestMd: string;
    historyJson: string;
    historyMd: string;
  }
): void {
  console.log(`Prompt Tower benchmark suite (${report.scale})`);
  console.log(
    `Fixture: ${report.fixture.totalFiles} total files, ${report.fixture.selectedFiles} selected files`
  );
  console.log("");
  console.log("name                 mean ms   p95 ms   min ms   max ms   iterations");

  for (const result of report.results) {
    console.log(
      `${result.name.padEnd(20)} ${formatNumber(result.meanMs).padStart(8)} ${formatNumber(
        result.p95Ms
      ).padStart(8)} ${formatNumber(result.minMs).padStart(8)} ${formatNumber(
        result.maxMs
      ).padStart(8)} ${String(result.iterations).padStart(12)}`
    );
  }

  if (report.comparison.length > 0) {
    console.log("");
    console.log("comparison vs previous latest");
    console.log("name                 mean Δms  mean Δ%  p95 Δms   p95 Δ%");
    for (const comparison of report.comparison) {
      console.log(
        `${comparison.name.padEnd(20)} ${formatSignedNumber(
          comparison.meanDeltaMs
        ).padStart(8)} ${formatSignedPercent(comparison.meanDeltaPercent).padStart(
          8
        )} ${formatSignedNumber(comparison.p95DeltaMs).padStart(8)} ${formatSignedPercent(
          comparison.p95DeltaPercent
        ).padStart(9)}`
      );
    }
  }

  console.log("");
  console.log(`saved latest json: ${reportPaths.latestJson}`);
  console.log(`saved latest md:   ${reportPaths.latestMd}`);
  console.log(`saved history json:${reportPaths.historyJson}`);
  console.log(`saved history md:  ${reportPaths.historyMd}`);
}

function formatNumber(value: number): string {
  return value.toFixed(2);
}

function formatSignedNumber(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;
}

function formatSignedPercent(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
