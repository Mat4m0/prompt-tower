# Changelog

All notable changes to **Lupinum Context** are documented in this file.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2026-05-16

First release of **Lupinum Context** — a hard fork of [`prompt-tower`](https://github.com/backnotprop/prompt-tower) reshaped into a sharper, narrower tool for building LLM context inside VS Code. See [README › Why a fork, not a contribution?](README.md#why-a-fork-not-a-contribution) for the scope rationale.

### Added

- **Visual file selection** in a native VS Code tree with live token counts per file and total.
- **Multi-provider token estimates** for Claude, OpenAI, and Gemini side by side.
- **Git commit selection** — pick recent commits and include their diffs as a structured block in the generated context.
- **Versioned prompt prefixes** — save reusable prompt prefixes, version them as you edit, restore older versions.
- **Compact output mode** — strips whitespace to save tokens when the chat window is tight.
- **Smart ignores** — honors `.gitignore`, `.contextignore`, `.towerignore`, plus sensible built-in rules.
- **Clean XML output format** (`<context>` / `<project_tree>` / `<project_files>` / `<git_diffs>`) — structured, parseable, model-friendly.

### Project

- Clean `core / app / vscode` architecture; dependency direction enforced by `scripts/check-architecture.mjs`.
- Webview rebuilt on Vue 3.
- `vp` (vite-plus) handles build, lint, format, and test in one toolchain.
- Project ships pinned to pnpm 10 via the `packageManager` field.
