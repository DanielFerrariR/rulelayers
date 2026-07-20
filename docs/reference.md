# CLI & ops

## CLI

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

Commit `.rulesync.company/` and `.rulesync.project/` (or your shared layers). Keep `.rulesync.user/`, `rulelayers.local.jsonc`, and the merged `.rulesync/` out of git — they include personal overrides.

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
