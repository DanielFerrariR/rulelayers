# rulelayers

**Layered [rulesync](https://github.com/dyoshikawa/rulesync) sources** — company standards, project overrides, and personal tweaks — merged into a single `.rulesync/` tree, then handed to `rulesync generate`.

Three common layouts (see [examples/](examples/)):

```text
1) Multi-folder (default init)
   .rulesync.company/  →  .rulesync.project/  →  .rulesync.user/
                         (low ─────────────────────────── high)

2) Single folder + sublayers
   .rulesync.src/   with  unit-testing.md
                          unit-testing.project.md
                          unit-testing.user.md
                   (suffixes ordered in config.sublayers)

3) Package + local
   @org/company-rules (npm)  →  .rulesync.project/  →  .rulesync.user/

        │  rulelayers generate
        ▼
   .rulesync/          (merged, generated)
        │  rulesync generate
        ▼
   CLAUDE.md, .cursor/, …
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

```bash
rulelayers generate --merge-only   # only write .rulesync/
rulelayers generate --dry-run      # preview without writing
rulelayers generate -v            # verbose (includes omit reasons)
```

## Docs

| Topic                                 | Doc                                            |
| ------------------------------------- | ---------------------------------------------- |
| Mental model & `rulelayers.jsonc`     | [docs/configuration.md](docs/configuration.md) |
| Replace / extend / omit / merge rules | [docs/patterns.md](docs/patterns.md)           |
| Example layouts                       | [examples/](examples/)                         |
| CLI, gitignore, CI                    | [docs/reference.md](docs/reference.md)         |
| Contributing & publishing             | [docs/development.md](docs/development.md)     |

## License

MIT
