# Releasing Lupinum Context

This is the internal runbook for shipping a new version of `Lupinum Context`
to both **VS Code Marketplace** (stock VS Code) and **Open VSX Registry**
(Cursor, VSCodium, Windsurf, Gitpod, etc.). They are independent registries —
every release goes to both.

> Publisher: `lupinum-dev` · Repo: `github.com/lupinum-dev/context`

---

## One-time setup

These steps are required exactly once per developer machine. Skip to
[Release flow](#release-flow) if everything below is already done.

### 1. VS Code Marketplace (Azure DevOps PAT)

1. Sign in to <https://dev.azure.com> with the Microsoft account that owns the publisher.
2. Create an Azure DevOps **organization** (any name — not user-visible).
3. Top-right user icon → **Personal access tokens** → **New Token**:
   - **Organization**: `All accessible organizations` (a single-org PAT cannot publish).
   - **Scopes**: switch to _Custom defined_ → check **Marketplace → Manage**.
   - **Expiration**: up to 1 year. Save the token — it is shown only once.
4. Visit <https://marketplace.visualstudio.com/manage> with the same Microsoft account → **Create publisher**:
   - **ID**: `lupinum-dev` (must match `publisher` in [package.json](../package.json)).
   - **Display name**: `Lupinum`.
5. Cache the PAT locally so future publishes don't prompt:
   ```sh
   pnpm exec vsce login lupinum-dev
   # paste PAT when prompted
   ```

### 2. Open VSX Registry (GitHub auth)

1. Sign in to <https://open-vsx.org> with the GitHub account that owns
   `github.com/lupinum-dev`.
2. **User settings → Namespaces → Create namespace** → `lupinum-dev`.
   - Open VSX namespaces are first-come, first-served. If `lupinum-dev` is
     taken, claim a different one and update `publisher` in
     [package.json](../package.json) to match — both marketplaces require
     the publisher field to equal the namespace.
3. **User settings → Access Tokens → Generate New Token**. Save it.
4. Export it in your shell profile (`~/.zshrc` / `~/.bashrc`):
   ```sh
   export OVSX_PAT='<token>'
   ```

### 3. GitHub CLI

```sh
gh auth login   # if not already authenticated
```

Needed only for the release-tag step at the end.

---

## Release flow

Every release runs the steps below in order. Replace `<version>` with the
new version string (e.g. `1.0.1`).

### 1. Pre-flight checks

```sh
vp run validate          # check + test + architecture
vp run benchmark:smoke   # perf-sensitive changes only
```

Confirm:

- [ ] `CHANGELOG.md` has an entry for the new version.
- [ ] `README.md` listing description is still accurate (first paragraphs show on marketplace).
- [ ] Working tree is clean except for the changelog + version bump you're about to make.

### 2. Bump the version

```sh
pnpm version patch    # or: minor / major / 1.0.1
```

This rewrites `package.json`, makes a commit `v<version>`, and creates tag `v<version>`.
Do NOT push yet — we push after a successful publish.

### 3. Package the VSIX

```sh
pnpm run package:vsix
```

Produces `lupinum-context-<version>.vsix` at the repo root. The `vscode:prepublish`
hook chains to `vp run package` → `vp run build`, so the bundle is rebuilt fresh.

Sanity-check the contents:

```sh
unzip -l lupinum-context-<version>.vsix | head -40
```

Expect to see `extension/dist/extension.js`, `extension/assets/*.png`,
`extension/README.md`, `extension/CHANGELOG.md`, `extension/package.json`.
Do **not** expect `extension/src/**` or `extension/node_modules/**` (those
are excluded by [.vscodeignore](../.vscodeignore)).

### 4. Publish to VS Code Marketplace

```sh
pnpm exec vsce publish --packagePath lupinum-context-<version>.vsix
```

`--packagePath` republishes the exact VSIX from step 3 instead of rebuilding,
so both marketplaces hold byte-identical artifacts.

### 5. Publish to Open VSX

```sh
pnpm exec ovsx publish lupinum-context-<version>.vsix -p "$OVSX_PAT"
```

### 6. Push tag + GitHub release

```sh
git push origin main --follow-tags
gh release create v<version> lupinum-context-<version>.vsix \
    --title "v<version>" --notes-from-tag
```

Attaching the VSIX to the GitHub release gives a manual install fallback if
either marketplace is down or slow to index.

### 7. Post-publish verification

Wait 2–10 minutes for indexing, then:

- [ ] **VS Code Marketplace** page shows new version:
      <https://marketplace.visualstudio.com/items?itemName=lupinum-dev.lupinum-context>
- [ ] **Open VSX** page shows new version:
      <https://open-vsx.org/extension/lupinum-dev/lupinum-context>
- [ ] In a **clean VS Code window**: uninstall any dev build, install from
      the marketplace UI, open the `Lupinum Context` view, check a couple of
      files, run **Copy Context to Clipboard**, paste — confirm
      `<context>…</context>` XML.
- [ ] Repeat the same smoke test in **Cursor** (queries Open VSX).

---

## Rollback

You **cannot delete a published version** on either marketplace. The fix is
always: bump patch version, publish a corrected release.

- `pnpm exec vsce unpublish lupinum-dev.lupinum-context` removes the **entire**
  extension from the VS Code Marketplace. Nuclear option — avoid.
- For deprecation without nuking, use the web UI on each marketplace's
  publisher dashboard to **unlist** a specific version.

---

## Troubleshooting

| Symptom                                         | Cause / fix                                                                                                                                                                           |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vsce publish` returns `403`                    | PAT expired, or scoped to a single Azure org instead of _All accessible organizations_. Recreate it.                                                                                  |
| `vsce publish` returns `409 conflict`           | Version already published. Bump `package.json` version and retry.                                                                                                                     |
| `ovsx publish` says namespace doesn't exist     | Claim it at <https://open-vsx.org/user-settings/namespaces> first.                                                                                                                    |
| Marketplace listing shows broken icon           | The path in `package.json` `icon` is excluded by [.vscodeignore](../.vscodeignore). Currently `assets/lupinum-context-icon.png` — make sure `assets/**` stays out of `.vscodeignore`. |
| `vsce` warns about missing repository / LICENSE | Check the identity fields in [package.json](../package.json) and that `LICENSE` is at repo root (it is).                                                                              |
| Listing description is stale                    | First paragraphs of [README.md](../README.md) drive the description. Edit, bump patch, republish.                                                                                     |

---

## Identity (do not change without coordinated migration)

| Field               | Value                                    |
| ------------------- | ---------------------------------------- |
| Extension `name`    | `lupinum-context`                        |
| `displayName`       | `Lupinum Context`                        |
| VS Code publisher   | `lupinum-dev`                            |
| Open VSX namespace  | `lupinum-dev`                            |
| Full marketplace ID | `lupinum-dev.lupinum-context`            |
| Repository          | <https://github.com/lupinum-dev/context> |

Changing `name` or `publisher` after the first publish creates a **separate
extension** that users have to migrate to manually. Treat them as immutable.
