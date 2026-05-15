import * as esbuild from "esbuild";
import { mkdtemp, rm } from "fs/promises";
import os from "os";
import path from "path";
import { pathToFileURL } from "url";

const tempDir = await mkdtemp(path.join(os.tmpdir(), "prompt-lupinum-test-bundle-"));
const outfile = path.join(tempDir, "tests.mjs");

try {
  await esbuild.build({
    entryPoints: ["src/test/index.ts"],
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node22",
    outfile,
    logLevel: "silent",
    sourcemap: false,
    external: ["node:test", "node:assert/strict"],
  });

  await import(pathToFileURL(outfile).href);
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
