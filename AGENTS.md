# Development Guide

## Product Focus

`prompt.lupinum` does one thing: select codebase files, combine them with an optional reusable prefix, and create AI-ready context that can be copied or saved.

Do not reintroduce GitHub views, GitHub API clients, PR/issue context, exact tokenizer adapters, React, or parallel legacy paths.

## Architecture

The dependency direction is:

```txt
vscode shell
-> app
-> core
```

- `src/core`: pure TypeScript domain logic. No `vscode`, no app imports, no adapter imports.
- `src/app`: application services and small ports. No `vscode` imports and no concrete `src/vscode` adapter imports.
- `src/vscode`: VS Code adapters, tree providers, webview shell, command registration, and bootstrap.
- `src/test`: node-based tests for core invariants, golden context output, storage behavior, and webview contracts.

`src/extension.ts` should stay tiny and only activate/deactivate the VS Code shell.

## Current Source Map

- `src/core/context`: context assembly, project tree rendering, and context-size estimation.
- `src/core/files`: file indexing, ignore rules, file-kind grouping, and selection intent.
- `src/core/prompts`: versioned prompt preset types, validation, store, and versioning.
- `src/core/tokens`: estimate-only token profiles for Claude, OpenAI, and Gemini.
- `src/core/export`: prompt file naming and export target rules.
- `src/app`: context, prompt preset, and workspace-state application services.
- `src/vscode/shell`: VS Code bootstrap, commands, message routing, service wiring, logging, and watcher session.
- `src/vscode/views`: native file tree and selection filter tree providers.
- `src/vscode/webview`: compact vanilla webview HTML, CSS, script, and typed messages.

## Implementation Rules

- Prefer delete, simplify, replace, then add.
- Keep every important concept to one source of truth.
- Selection intent is canonical; selected files, folder checkbox state, filter groups, and token totals are derived.
- Context generation is pure; update golden fixtures for intentional output changes.
- Prompt preset edits create recoverable versions. Do not silently overwrite old prefix text.
- Generated benchmark reports are local artifacts, not product documentation.

## Verification

Before finishing meaningful changes, run:

```sh
vp check
vp test
vp run test:architecture
vp build
vp run validate
```

Run `vp run benchmark:smoke` for performance-sensitive changes and `vp run deploy:local` before manual VS Code smoke.
