# Multi-folder layers

Classic layout: separate `.rulesync.company/`, `.rulesync.project/`, and `.rulesync.user/` (same as `rulelayers init`). No `sublayers` — precedence is the `layers` array only.

```bash
node ../../dist/cli.js generate --merge-only -v
```

- Same path `rules/style.md`: project replaces company.
- Distinct path `rules/api.md`: both survive.
- Optional `.rulesync.user/` is included so the full three-layer merge is visible (in real apps you often gitignore personal user layers).
