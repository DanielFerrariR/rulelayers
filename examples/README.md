# Examples

Common ways to use rulelayers:

| Example                           | Layout                                                           | When to use                                                    |
| --------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------- |
| [single-project](single-project/) | `.rulesync.src/` (`project`/`user` suffixes) + optional `.user/` | No company tier — simpler single-repo setup                    |
| [single-src](single-src/)         | One `.rulesync.src/` + `company`/`project`/`user` sublayers      | Single tree with a company tier (standalone, mcp, ignore demo) |
| [multi-folder](multi-folder/)     | `.rulesync.company/`, `.project/`, `.user/`                      | Default split; what `rulelayers init` scaffolds                |
| [cross-project](cross-project/)   | Two projects + `rulelayers.user.jsonc` path global               | Personal prefs reused across repos via one external folder     |
| [package-layer](package-layer/)   | npm package + local project/user                                 | Shared org rules published as a package                        |

## Run merge-only from this repo

```bash
pnpm build   # once, from repo root

cd examples/single-project   # or single-src / multi-folder / package-layer / cross-project/project-a
node ../../dist/cli.js generate --merge-only -v
```

For [cross-project](cross-project/), run from a project folder (path is relative to that cwd):

```bash
cd examples/cross-project/project-a
node ../../../dist/cli.js generate --merge-only -v
```

For [package-layer](package-layer/), install the local package first:

```bash
cd examples/package-layer
npm install
node ../../dist/cli.js generate --merge-only -v
```

Generated `.rulesync/` is gitignored in each example.
