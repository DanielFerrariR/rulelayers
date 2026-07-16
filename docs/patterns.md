# Patterns

## Replace or new file?

Default to a **new file**, and make the layer explicit in the filename with a `.{layer}` suffix:

```text
.rulesync.company/rules/style.company.md
.rulesync.project/rules/style.project.md   ← both appear side by side in .rulesync/rules/
```

Because the relative paths differ, both files survive the merge — nothing is replaced. This is the **common case**: it keeps every rule visible in the merged output, makes provenance obvious from the filename alone, and avoids accidentally clobbering a lower layer just because someone reused a name.

Only fall back to the same relative path (no `.{layer}` suffix) when you deliberately want to **override or fully supersede** a lower layer's file — that's the less common case, covered next.

### 1. Same path → replace

```text
.rulesync.company/rules/style.md
.rulesync.project/rules/style.md   ← wins in .rulesync/rules/style.md
```

Same relative path is a **hard override** — the higher layer's file wins outright and the lower layer's content is gone. Use this only when you truly want to change or remove lower-layer behavior.

### 2. Different path → extend

```text
.rulesync.company/rules/security.md
.rulesync.project/rules/api.md     ← both appear in .rulesync/
```

This is the **default layering style**: preserve lower layers and add extra files in higher layers. Naming files with a `.{layer}` suffix (see above) is the clearest way to guarantee different paths on purpose, rather than relying on unrelated filenames.

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
