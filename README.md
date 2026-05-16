# Lupinum Kontext

**Turn your codebase into AI-ready context in seconds. Then go talk to your LLM about it.**

[![VS Code Extension](https://img.shields.io/badge/VS%20Code-Extension-0078d4?style=flat-square&logo=visual-studio-code&logoColor=white)](https://kontext.lupinum.com)
[![License](https://img.shields.io/badge/license-AGPL--3.0-blue?style=flat-square)](LICENSE)
[![Built by Lupinum](https://img.shields.io/badge/Lupinum-Kontext-1d8a4e?style=flat-square)](https://lupinum.com)

_Kontext_ is the German word for context. Part of the Lupinum dev toolkit at [lupinum.com](https://lupinum.com). Lives at [kontext.lupinum.com](https://kontext.lupinum.com).

---

## The Problem

You want to ask Claude or Gemini a real question about your code. Not "fix this line" — a real one. _"Why is this slow?" "How would you split this module?" "What's the right way to model this?"_

So you start gathering context. You copy a file. Then another. Then a config. Then you realize you forgot the types file. Twenty minutes later you have a Frankenstein paste and you've already lost the train of thought you started with.

Or you let the agent do it. The agent reads files it thinks are useful. That's fine for "implement X" — but not when you want to _think out loud_ with an LLM. You don't want the model to see what it thinks it needs. You want it to see what _you_ think it needs.

## The Solution

Click checkboxes. Get clean, token-efficient context. Paste into any chat. Talk to your code.

```
1. Pick files in the native VS Code tree
2. Optionally select Git commits / diffs you care about
3. See live token counts for Claude, OpenAI, Gemini
4. Hit "Copy Context"
5. Paste into ChatGPT, Claude, Gemini, Cursor, whatever
```

That's it. Built for the moments when full context dumps are still the right move — and there are more of those than the "agents do everything now" crowd will tell you.

---

## Full context dumps are not dead

Agents are great. They read code file by file and decide what's relevant. That's the right tool when you want them to _do_ something.

But sometimes you want a thinking partner, not a worker. You want to:

- Ask Gemini's 1M window what's wrong with your architecture and hear it think
- Drop your auth flow into Claude and ask "what would you change?"
- Show ChatGPT a feature module and ask "is this the right shape?"
- Compare three models' opinions on the same context

For that, you don't want an agent reading what _it_ thinks is interesting. You want the model to see exactly what you put in front of it — no more, no less.

That's what Kontext is for.

---

## What you get

### Visual file selection

Native VS Code tree with checkboxes. Live token counts per file and total. Folder selection that respects your filters. No terminal commands, no path typing.

### Multi-provider token estimates

See estimated token count and cost for Claude, OpenAI, and Gemini side by side. Pick which providers you care about; the chip bar updates live.

### Git commit selection

Select recent commits in a dedicated tree view. Their diffs land in the context as a structured block — so when you ask "review my last change", the model actually sees the change.

### Versioned prompt prefixes

Save a reusable prefix ("You are reviewing a TypeScript codebase. Be specific…"), version it as you tweak it, and restore older versions. No more rewriting the same intro every time.

### Compact mode for token savings

Two output formats. _Readable_ for humans peeking at the preview. _Compact_ strips whitespace and saves a meaningful chunk of tokens when the chat window is tight.

### Smart ignores

Honors `.gitignore`, `.contextignore`, `.towerignore`, plus built-in rules. Keeps `node_modules`, `dist`, lockfiles, and generated junk out by default.

### Clean output format

```xml
<context>
<project_tree>
src/
├─ core/
│  └─ context/ContextAssembler.ts
└─ app/ContextApplicationService.ts
</project_tree>
<project_files>
<file name="ContextAssembler.ts" path="/src/core/context/ContextAssembler.ts">
export function assembleContext(...) { ... }
</file>
</project_files>
<git_diffs>
<diff hash="abc123">
diff --git a/src/foo.ts ...
</diff>
</git_diffs>
</context>
```

Structured, parseable, model-friendly. Same shape every time.

---

## Real use cases

**Architecture review with Gemini**
Select all your core modules + the README → paste into Gemini → "Critique this architecture. Where's the weakest seam?" Gemini's 1M window swallows it whole.

**Code review with Claude**
Pick the changed files + the affected tests + the recent commit diff → paste into Claude → "Review this PR. Be picky." Claude sees exactly what a reviewer would see.

**Debugging session with ChatGPT**
Select the failing module + its tests + the error log (as a prompt prefix) → "Where would you start?" No agent loop, no tool calls, just a fast back-and-forth.

**Refactor planning with any model**
Dump the module + adjacent code + the types it touches → "How would you split this?" → talk through three options before you write a line.

---

## Quick start

1. Install **Lupinum Kontext** from the VS Code Marketplace.
2. Click the Kontext icon in the Activity Bar.
3. Check files in the tree, optionally pick Git commits.
4. Hit **Copy Context**.
5. Paste into your chat of choice.

That's the whole loop. Build a habit around it.

---

## Configuration

### `.towerignore` / `.kontextignore`

Create either in your project root. Works like `.gitignore`:

```gitignore
# Keep context lean
tests/fixtures/
docs/generated/
*.min.js
data/
```

### Token warnings

Set `promptLupinum.maxFileSizeWarningKB` in your settings to flag oversized files before they bloat your context.

### Tree display

`promptLupinum.showTreeTokenCounts` toggles inline token counts in the file tree.

---

## Credits

Lupinum Kontext is a hard fork of **[prompt-tower](https://github.com/backnotprop/prompt-tower)** by **Michael Ramos** ([@backnotprop](https://github.com/backnotprop)). The original idea — a focused VS Code tool for building LLM context — is his, and the early architecture and selection model came from there. Real respect.

### Why a fork, not a contribution?

We needed a sharper tool. Prompt Tower aims wide; we aim narrow. The upstream roadmap leans into more breadth (GitHub PR integration, more provider hooks, more "smart" features). Ours leans the other way — no agent, no embeddings, no remote calls, no chat-in-editor.

Keeping a divergent fork is cheaper than fighting that direction in PR reviews. Both projects are better for it. If you want breadth and an active upstream community, [prompt-tower](https://github.com/backnotprop/prompt-tower) is the right home.

We rebuilt the internals for speed on large codebases, added Git commit selection as a first-class feature, replaced the webview UI with a real Vue app, and tightened the filters. Same idea, sharper tool.

---

## Contributing

Found a bug? Want a feature? [Open an issue](https://github.com/lupinum/kontext/issues).

```bash
git clone https://github.com/lupinum/kontext.git
npm install
vp build
vp run deploy:local   # installs the .vsix into your local VS Code
```

---

**[AGPL-3.0](LICENSE)** • **[kontext.lupinum.com](https://kontext.lupinum.com)** • Built by [Lupinum](https://lupinum.com) • Originally [@backnotprop](https://github.com/backnotprop)

<sub>For the moments when you want to talk to your codebase, not just have an agent operate on it.</sub>
