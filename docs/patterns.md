# Patterns

## Replace or new file?

### Across physical layers (multi-folder)

Default to a **new file**, and make provenance obvious with a `.{layer}` suffix in the filename when you want both to survive:

```text
.rulesync.company/rules/style.company.md
.rulesync.project/rules/style.project.md   ← both appear side by side in .rulesync/rules/
```

Because the relative paths differ, both files survive the merge — nothing is replaced.

Only reuse the **same relative path** (no distinguishing suffix) when you deliberately want a higher physical layer to **override** a lower one.

### Within one folder: `sublayers`

When a layer declares `sublayers` in `rulelayers.jsonc`, known suffixes participate in a **replace chain** for path features:

```text
.rulesync.src/rules/unit-testing.md              → unit-testing.md (lowest)
.rulesync.src/rules/unit-testing.project.md      → replaces → unit-testing.md
.rulesync.src/rules/unit-testing.user.md         → replaces again (highest)
.rulesync.src/rules/unit-testing.project.standalone.md
                                                 → unit-testing.project.md (extra file)
```

- Unmarked `unit-testing.md` ≡ lowest sublayer (same as `unit-testing.company.md` when `company` is first).
- **`.standalone`** keeps the sublayer in the output name so it does not replace the chain.
- JSON/ignore use the same suffixes but **merge** (deep-merge / line-union), not replace — and **do not** support `.standalone`.

See [examples/](../examples/) for runnable layouts.

### 1. Same path → replace

```text
.rulesync.company/rules/style.md
.rulesync.project/rules/style.md   ← wins in .rulesync/rules/style.md
```

Same relative path is a **hard override** — the higher layer's file wins outright and the lower layer's content is gone. Use this only when you truly want to change or remove lower-layer behavior.

With `sublayers`, `style.project.md` resolves to the same output path as `style.md` and replaces it within that physical layer.

### 2. Different path → extend

```text
.rulesync.company/rules/security.md
.rulesync.project/rules/api.md     ← both appear in .rulesync/
```

This is the **default layering style** across physical folders: preserve lower layers and add extra files in higher layers.

With `sublayers`, use `.standalone` when you want a side-by-side file (`style.project.md` in the output) instead of replacing `style.md`.

### 3. Omit a lower-layer file

Write a file at the **same relative path** (or the same resolved path after sublayer stripping) with frontmatter:

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
| `rules/`, `commands/`, `subagents/` | Same resolved path: higher physical layer / higher sublayer replaces. New paths are added. `omit: true` drops.           |
| `skills/<name>/`                    | Entire skill directory replaced by highest layer that defines that name. New names are added. No merge _inside_ a skill. |
| `mcp.json` (or `.mcp.json`)         | Deep-merge JSON; higher physical layer / higher sublayer wins on the same key. Suffixes: `mcp.{sublayer}.json`.          |
| `hooks.json`, `permissions.json`    | Same deep-merge as MCP (`hooks.{sublayer}.json`, …).                                                                     |
| `.aiignore`, `.rulesyncignore`      | Line-union (deduped, lower-then-higher). Suffixes: `.aiignore.{sublayer}`.                                               |

Priority is nested: **physical `layers` first** (outer), then that layer’s **`sublayers`** (inner). Sublayer names are not global ranks across folders.

### 5. What lives where

Recommended split:

- **Company**: org-wide style, security, MCP defaults, shared skills/commands
- **Project**: stack-specific rules, omit or replace company items that don’t fit, extra commands
- **User**: personal preferences (keep `.rulesync.user/` gitignored)

Or keep a **single** source folder (e.g. `.rulesync.src`) with `sublayers: ["company", "project", "user"]` — see [examples/single-src](../examples/single-src/).

`rulesync.jsonc` stays at the **project root** (not layered in v1). Point targets/features there, or pass them via `rulelayers.jsonc` → `rulesync.args`.
