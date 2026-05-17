# Contributing to Lupinum Context

Thanks for taking the time. This is a focused VS Code extension — one job, done well — so contributions land best when they align with that focus. Read this once, then dive in.

## Before you start

- **Bug or small fix:** just open a PR.
- **New feature or anything that changes the UX:** open an issue first so we can talk shape. We've turned down good ideas because they widened the product surface area. See [README › Why a fork, not a contribution?](README.md#why-a-fork-not-a-contribution) for what we deliberately don't do.
- **Architecture:** read [AGENTS.md](AGENTS.md) before touching `src/`. The core boundary is enforced by `scripts/check-no-core-vscode-imports.mjs`.

## Local setup

This repo uses **pnpm** (pinned via the `packageManager` field).

```bash
git clone https://github.com/lupinum-dev/context.git
cd context
corepack enable          # ensures pnpm@10 is on PATH
pnpm install
```

Node 20+ is required (see [.nvmrc](.nvmrc) and the `engines` block in [package.json](package.json)).

## Running the extension

```bash
pnpm run watch           # incremental rebuild of extension + webview
```

Then press **F5** in VS Code to launch the Extension Development Host. Reload that window (`Cmd/Ctrl+R`) after edits — the watcher rebuilds in the background.

To install the production VSIX into your real VS Code:

```bash
pnpm run deploy:local
```

## Quality gates

Before opening a PR, run:

```bash
pnpm run check               # format + lint + types (via vp)
pnpm test                    # vitest
pnpm run test:no-core-vscode-imports   # core boundary check
pnpm run validate            # all of the above in one shot
```

The pre-commit hook (`.vite-hooks/pre-commit`) runs `vp staged` automatically — it formats and lints only what you staged. Don't bypass it.

## Code style

- Format & lint are handled by `vite-plus` (oxc under the hood). The config lives in [vite.config.mts](vite.config.mts). Don't introduce a parallel ESLint/Prettier setup.
- Single quotes, no semicolons (configured in the `fmt` block).
- Prefer **delete, simplify, replace** before adding code. Same rule [AGENTS.md](AGENTS.md) gives the agents.

## Commit & PR conventions

- Short imperative subject: `add git commit selection`, `fix token estimate rounding`. Match the existing `git log`.
- One concern per PR. If you find yourself writing "and also", split it.
- Update [CHANGELOG.md](CHANGELOG.md) under an `## Unreleased` section (create one if missing) for any user-visible change.
- Link the issue in the PR body. If there isn't one, write a paragraph explaining the motivation.

## Security issues

Do **not** open a public issue for a security report. See [SECURITY.md](SECURITY.md) for the private disclosure channel.

## License

By contributing, you agree your contributions are licensed under [AGPL-3.0](LICENSE).
