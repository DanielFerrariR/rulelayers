# Cross-project global layer

Personal preferences you want in **every** repo — one shared folder on disk, wired in via a local config override (not the committed project config):

`company` → `project` → `global` (path) → `user`

```text
cross-project/
  global/                       # your prefs; outside any one project
  project-a/
    rulelayers.jsonc            # team: company → project → user
    rulelayers.local.jsonc      # you: inserts global path (full replace)
  project-b/
    …
```

Committed project config:

```jsonc
{
  "layers": ["company", "project", "user"],
}
```

Local override (`rulelayers.local.jsonc`, normally gitignored) — **fully replaces** the project file, no merge:

```jsonc
{
  "layers": ["company", "project", { "name": "global", "path": "../global" }, "user"],
}
```

```bash
# from either project
cd examples/cross-project/project-a
node ../../../dist/cli.js generate --merge-only -v

cd ../project-b
node ../../../dist/cli.js generate --merge-only -v
```

Expected highlights:

- Verbose log shows `config: rulelayers.local.jsonc (replaces rulelayers.jsonc)`
- `rules/preferences.md` ← from shared `global/` (same personal prefs in both projects)
- `rules/style.md` ← from each project's `.rulesync.project/`
- `rules/stack.md` ← project-specific
- `rules/personal.md` ← from each project's `.rulesync.user/`
