# prompt.lupinum

`prompt.lupinum` is a focused VS Code extension for creating AI-ready codebase context.

It does one job:

1. Select codebase files in a native VS Code tree.
2. Optionally choose or write a reusable prompt prefix.
3. Generate clean XML-like context.
4. Copy or save it for Claude, OpenAI, Gemini, or another AI tool.

## Features

- Native file selection tree with folder selection.
- Native selection filters for file kinds, tests, declarations, and extensions.
- Re-enable excluded filters without losing folder selection intent.
- Estimated token and input-cost preview for Claude, OpenAI, and Gemini.
- Versioned prompt prefix presets.
- Readable or compact context output.
- `.gitignore`, `.contextignore`, `.towerignore`, and built-in ignore support.
- Save generated context to `.prompt-lupinum/prompts`.

## Context Format

```xml
<context>
<project_tree>
src/
└─ app.ts
</project_tree>
<project_files>
<file name="app.ts" path="/src/app.ts">
export const value = 1;
</file>
</project_files>
</context>
```

## Development

```bash
vp install
vp check
vp test
vp build
vp run validate
vp run deploy:local
```

Core modules live under `src/core` and must not import VS Code APIs. VS Code-specific code lives under `src/vscode`, and app orchestration lives under `src/app`.

## License

AGPL-3.0
