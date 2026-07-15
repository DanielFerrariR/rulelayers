# rulelayers

**Layered [rulesync](https://github.com/dyoshikawa/rulesync) sources** — company standards, project overrides, and personal tweaks — merged into a single `.rulesync/` tree, then handed to `rulesync generate`.

```text
.rulesync.company/   (lowest precedence)
.rulesync.project/
.rulesync.user/      (highest precedence)
        │
        ▼  rulelayers generate
   .rulesync/        (merged, generated)
        │
        ▼  rulesync generate
   CLAUDE.md, .cursor/, …  (tool configs)
```

Use this when an org wants shared AI rules that each repo can extend, and each developer can customize locally — without forking the whole ruleset.

## Requirements

- **Node.js** ≥ 20
- **[rulesync](https://www.npmjs.com/package/rulesync)** on PATH or as a project dependency (needed for full `generate`, not for `--merge-only`)

## Install

```bash
# global
npm install -g rulelayers rulesync

# or project-local
npm install -D rulelayers rulesync
```

## Quick start

```bash
rulelayers init
# edit .rulesync.company / .rulesync.project / .rulesync.user

rulelayers generate
# 1) merges layers → .rulesync/
# 2) runs: rulesync generate --targets "*" --features "*"
```

Useful flags:

```bash
rulelayers generate --merge-only   # only write .rulesync/
rulelayers generate --dry-run      # preview without writing
rulelayers generate -v            # verbose (includes omit reasons)
```

## Mental model

| Path                 | Role                                                | Commit?                                          |
| -------------------- | --------------------------------------------------- | ------------------------------------------------ |
| `.rulesync.{layer}/` | Editable source for that layer                      | Yes for shared layers; usually **no** for `user` |
| `.rulesync/`         | **Generated** merge output (rulesync input)         | Optional; often gitignored                       |
| `rulelayers.jsonc`   | Layer list + how to invoke rulesync                 | Yes                                              |
| `rulesync.jsonc`     | rulesync targets/features (unchanged by rulelayers) | Yes                                              |

Default layers (low → high precedence): **`company` → `project` → `user`**.

Folder names are always `.rulesync.<layerName>` for whatever you put in config.

## Configuration (`rulelayers.jsonc`)

Created by `rulelayers init`:

```jsonc
{
  "$schema": "https://raw.githubusercontent.com/DanielFerrariR/rulelayers/main/schema.json",
  "layers": ["company", "project", "user"],
  "rulesync": {
    "command": "rulesync",
    "args": ["generate", "--targets", "*", "--features", "*"],
  },
}
```

- **`layers`**: ordered list, **lowest precedence first**. Any names, any count (e.g. `["org", "platform", "service", "me"]`).
- **`rulesync.command`**: binary to run after merge (default `rulesync`). Local `node_modules/.bin/rulesync` is preferred when present.
- **`rulesync.args`**: argv passed to that command.

Custom layers:

```bash
rulelayers init --layers org,team,repo,dev
```

## Patterns to follow

### 1. Same path → replace

```text
.rulesync.company/rules/style.md
.rulesync.project/rules/style.md   ← wins in .rulesync/rules/style.md
```

### 2. Different path → extend

```text
.rulesync.company/rules/security.md
.rulesync.project/rules/api.md     ← both appear in .rulesync/
```

### 3. Omit a lower-layer file

Write a file at the **same relative path** with frontmatter:

```markdown
---
omit: true
reason: "This repo does not use the company /review command"
---
```

- `omit: true` removes the path from the final `.rulesync/`
- `reason` is optional; shown with `--verbose` / `--dry-run`
- Both fields are stripped so rulesync never sees them

Same for skills: put `omit: true` on `skills/<name>/SKILL.md` in a higher layer to drop that skill.

### 4. Feature merge rules

| Feature                             | Behavior                                                                                                                 |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `rules/`, `commands/`, `subagents/` | Same relative path: higher layer replaces. New paths are added. `omit: true` drops.                                      |
| `skills/<name>/`                    | Entire skill directory replaced by highest layer that defines that name. New names are added. No merge _inside_ a skill. |
| `mcp.json` (or `.mcp.json`)         | Deep-merge JSON; higher layer wins on the same key (e.g. same MCP server id).                                            |
| `hooks.json`, `permissions.json`    | Same deep-merge as MCP.                                                                                                  |
| `.aiignore`, `.rulesyncignore`      | Line-union (deduped, lower-then-higher order).                                                                           |

### 5. What lives where

Recommended split:

- **Company**: org-wide style, security, MCP defaults, shared skills/commands
- **Project**: stack-specific rules, omit or replace company items that don’t fit, extra commands
- **User**: personal preferences (keep `.rulesync.user/` gitignored)

`rulesync.jsonc` stays at the **project root** (not layered in v1). Point targets/features there, or pass them via `rulelayers.jsonc` → `rulesync.args`.

## CLI reference

```text
rulelayers init [--layers company,project,user] [-f|--force]
rulelayers generate [--merge-only] [--dry-run] [-v|--verbose]
rulelayers --version
```

| Command    | What it does                                                                                                  |
| ---------- | ------------------------------------------------------------------------------------------------------------- |
| `init`     | Writes `rulelayers.jsonc`, scaffolds `.rulesync.<layer>/`, sample company/project rules, updates `.gitignore` |
| `generate` | Merges layers → `.rulesync/`, then runs configured `rulesync` (unless `--merge-only`)                         |

Exit non-zero on invalid config/JSON/frontmatter issues, or if rulesync exits non-zero / is missing.

## Gitignore

`rulelayers init` appends:

```gitignore
# rulelayers
.rulesync/
.rulesync.user/
rulelayers.local.jsonc
```

Commit `.rulesync.company/` and `.rulesync.project/` (or your shared layers). Keep personal layers and the merged `.rulesync/` out of git when they should stay local/generated.

## CI

```yaml
- run: npm ci
- run: npx rulelayers generate
# commit check: fail if generated tool files drifted, or always regenerate in CI
```

Ensure `rulesync` is installed as a dependency so CI does not need a global binary.

## Relationship to rulesync

rulelayers does **not** reimplement multi-tool emitters. It only:

1. Builds a valid `.rulesync/` tree from layers
2. Invokes `rulesync generate` (same as you would by hand)

After a successful generate, use rulesync’s docs for targets, features, import, and fetch.

## Development

Build uses plain `tsc` (TypeScript 7) — no bundler. `npm run typecheck` runs the same compiler with `noEmit`.

```bash
npm install          # also installs lefthook git hooks via prepare
npm test
npm run typecheck
npm run lint
npm run format
npm run knip
npm run build
node dist/cli.js --help
```

### Git hooks (lefthook)

| Hook           | Runs                                     |
| -------------- | ---------------------------------------- |
| **pre-commit** | `oxlint --fix` + `oxfmt` on staged files |
| **pre-push**   | `tsc` typecheck + `knip`                 |

```bash
npx lefthook install   # if hooks were skipped
```

CI (GitHub Actions) runs the same checks on push/PR to `main`: typecheck, oxlint, oxfmt, knip, tests, and build.

## License

MIT
