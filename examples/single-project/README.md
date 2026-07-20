# Single project (no company layer)

When you don’t need a company tier: one shared folder (`.rulesync.src/`) with `project` / `user` filename suffixes. Optional `.rulesync.user/` for developers who prefer a separate personal folder (in real projects, gitignore that folder; missing dirs are skipped).

```jsonc
{
  "layers": [{ "name": "src", "sublayers": ["project", "user"] }, "user"],
}
```

```bash
node ../../dist/cli.js generate --merge-only -v
```

Expected highlights in `.rulesync/`:

- `rules/unit-testing.md` ← from `.rulesync.user/` (beats `unit-testing.user.md` in `src`)
- `rules/style.md` ← from `style.md` in `src` (no user override)
