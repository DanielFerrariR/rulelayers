# Development

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

## Git hooks (lefthook)

| Hook           | Runs                                     |
| -------------- | ---------------------------------------- |
| **pre-commit** | `oxlint --fix` + `oxfmt` on staged files |
| **pre-push**   | `tsc` typecheck + `knip`                 |

```bash
npx lefthook install   # if hooks were skipped
```

CI (GitHub Actions) runs the same checks on push/PR to `main`: typecheck, oxlint, oxfmt, knip, tests, and build.

## Publishing

Bump `version` in `package.json`, then:

```bash
npm run release
```

This runs `npm publish --access public`. `prepublishOnly` builds `dist/` first. You must be logged in to npm (`npm login`) and have publish rights for the `rulelayers` package.
