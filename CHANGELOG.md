# Changelog

All notable changes to **Lupinum Context** are documented in this file.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Honor nested `.gitignore` files while keeping `.contextignore` and `.towerignore` root-only.
- Preflight very large context before reading selected file contents in copy/save workflows.
- Omit oversized, binary-looking, or outside-workspace files with explicit context warnings.
- Remove billing labels and keep estimates token-only.
- Render missing selected files in generated context warnings.
- Keep generated context output order stable across file listing order changes.
- Make file index snapshots cheap to read and stat files concurrently during refresh.
- Add smoke and large benchmark scripts for indexing and context-generation hot paths.
- Expand architecture boundary validation beyond the core-only VS Code import check.
- Cache selected Git commit diff reads during context estimation and creation.
- Clarify local-only behavior, rough estimate language, and the supported `vp` verification path in docs.

## [1.0.0] - 2026-05-16

First release of **Lupinum Context** — a hard fork of [`prompt-tower`](https://github.com/backnotprop/prompt-tower) reshaped into a sharper, narrower tool for building LLM context inside VS Code. See [README › Why a fork, not a contribution?](README.md#why-a-fork-not-a-contribution) for the scope rationale.

### Added

- **Visual file selection** in a native VS Code tree with live rough size estimates per file and total.
- **Rough multi-provider estimates** for Claude, OpenAI, and Gemini side by side.
- **Git commit selection** — pick recent commits and include their diffs as a structured block in the generated context.
- **Reusable prompt prefixes** — save named prompt prefixes and switch between them.
- **Compact tags output mode** — removes generated wrapper whitespace without changing selected file contents.
- **Layered ignore rules** — honors `.gitignore`, `.contextignore`, `.towerignore`, plus built-in rules.
- **XML-like tagged output** (`<context>` / `<project_tree>` / `<project_files>` / `<git_diffs>`) — structured and model-friendly.

### Project

- `core / app / vscode / webview` architecture with import boundaries enforced by `scripts/check-no-core-vscode-imports.mjs`.
- Webview rebuilt on Vue 3.
- `vp` (vite-plus) handles build, lint, format, and test in one toolchain.
- Project ships pinned to pnpm 10 via the `packageManager` field.
- Prompt Tower prefix import is a one-time compatibility path for the 1.0.x line and should be removed after that line.
