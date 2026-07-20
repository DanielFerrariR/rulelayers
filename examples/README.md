# Examples

Three common ways to use rulelayers:

| Example                         | Layout                                      | When to use                                                      |
| ------------------------------- | ------------------------------------------- | ---------------------------------------------------------------- |
| [single-src](single-src/)       | One `.rulesync.src/` + filename `sublayers` | Single tree; bot or person merges “company” into the same folder |
| [multi-folder](multi-folder/)   | `.rulesync.company/`, `.project/`, `.user/` | Default split; what `rulelayers init` scaffolds                  |
| [package-layer](package-layer/) | npm package + local project/user            | Shared org rules published as a package                          |

## Run merge-only from this repo

```bash
pnpm build   # once, from repo root

cd examples/single-src   # or multi-folder / package-layer
node ../../dist/cli.js generate --merge-only -v
```

For [package-layer](package-layer/), install the local package first:

```bash
cd examples/package-layer
npm install
node ../../dist/cli.js generate --merge-only -v
```

Generated `.rulesync/` is gitignored in each example.
