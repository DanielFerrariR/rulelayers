# Development

Build uses plain `tsc` (TypeScript 7) — no bundler. `pnpm run typecheck` runs the same compiler with `noEmit`.

Requires **Node.js ≥ 22** and [pnpm](https://pnpm.io/) 11 (see `packageManager` in `package.json`). The published CLI still runs on Node ≥ 20.

```bash
pnpm install          # also installs lefthook git hooks via prepare
pnpm test
pnpm run typecheck
pnpm run lint
pnpm run format
pnpm run knip
pnpm run build
node dist/cli.js --help
```

## Git hooks (lefthook)

| Hook           | Runs                                     |
| -------------- | ---------------------------------------- |
| **pre-commit** | `oxlint --fix` + `oxfmt` on staged files |
| **pre-push**   | `tsc` typecheck + `knip`                 |

```bash
pnpm exec lefthook install   # if hooks were skipped
```

CI (GitHub Actions) runs the same checks on push/PR to `main`: typecheck, oxlint, oxfmt, knip, tests, and build.

## Publishing

Bump `version` in `package.json`, then:

```bash
pnpm run release
```

This runs `pnpm publish --access public`. `prepublishOnly` builds `dist/` first. You must be logged in to npm (`npm login`) and have publish rights for the `rulelayers` package.
