# Single folder + sublayers

One physical layer (`.rulesync.src/`) with `sublayers: ["company", "project", "user"]`. Filenames encode precedence.

```bash
node ../../dist/cli.js generate --merge-only -v
```

Expected highlights in `.rulesync/`:

- `rules/unit-testing.md` ← from `unit-testing.project.md` (replaced company base)
- `rules/unit-testing.project.md` ← from `.standalone`
- `mcp.json` ← deep-merge of `mcp.json` + `mcp.project.json`
- `.aiignore` ← union of `.aiignore` + `.aiignore.project`
