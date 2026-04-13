import * as fs from "fs";
import * as path from "path";

export interface BenchmarkStats {
  name: string;
  description: string;
  iterations: number;
  meanMs: number;
  minMs: number;
  maxMs: number;
  p95Ms: number;
}

export interface BenchmarkComparison {
  name: string;
  meanDeltaMs: number;
  meanDeltaPercent: number;
  p95DeltaMs: number;
  p95DeltaPercent: number;
}

export interface BenchmarkFixtureSummary {
  rootDir: string;
  totalFiles: number;
  selectedFiles: number;
  totalBytes: number;
  selectedBytes: number;
  largestFileBytes: number;
  deepestPathSegments: number;
}

export interface BenchmarkReport<ScaleName extends string = string> {
  generatedAt: string;
  scale: ScaleName;
  fixture: BenchmarkFixtureSummary;
  results: BenchmarkStats[];
  comparison: BenchmarkComparison[];
}

export async function readLatestReport<ScaleName extends string>(
  reportsRoot: string,
  scale: ScaleName
): Promise<BenchmarkReport<ScaleName> | null> {
  const latestPath = path.join(reportsRoot, `latest-${scale}.json`);

  try {
    const raw = await fs.promises.readFile(latestPath, "utf8");
    return JSON.parse(raw) as BenchmarkReport<ScaleName>;
  } catch {
    return null;
  }
}

export function createComparison(
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

export async function writeLatestReportFiles<ScaleName extends string>(
  reportsRoot: string,
  report: BenchmarkReport<ScaleName>
): Promise<{
  latestJson: string;
  latestMd: string;
}> {
  await fs.promises.mkdir(reportsRoot, { recursive: true });

  const latestJson = path.join(reportsRoot, `latest-${report.scale}.json`);
  const latestMd = path.join(reportsRoot, `latest-${report.scale}.md`);
  const jsonPayload = JSON.stringify(report, null, 2);
  const markdownPayload = renderMarkdownReport(report);

  await Promise.all([
    fs.promises.writeFile(latestJson, jsonPayload + "\n", "utf8"),
    fs.promises.writeFile(latestMd, markdownPayload, "utf8"),
  ]);

  return { latestJson, latestMd };
}

export function renderMarkdownReport<ScaleName extends string>(
  report: BenchmarkReport<ScaleName>
): string {
  const lines = [
    `# Prompt Tower benchmark report (${report.scale})`,
    "",
    `Generated: ${report.generatedAt}`,
    `Fixture: ${report.fixture.totalFiles} total files, ${report.fixture.selectedFiles} selected files`,
    `Fixture bytes: ${report.fixture.totalBytes} total, ${report.fixture.selectedBytes} selected, largest file ${report.fixture.largestFileBytes}, deepest path ${report.fixture.deepestPathSegments} segments`,
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

export function formatNumber(value: number): string {
  return value.toFixed(2);
}

export function formatSignedNumber(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;
}

export function formatSignedPercent(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function percentageDelta(currentValue: number, previousValue: number): number {
  if (previousValue === 0) {
    return 0;
  }

  return ((currentValue - previousValue) / previousValue) * 100;
}
