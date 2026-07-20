# Configuration

## Mental model

| Path                    | Role                                                       | Commit?                                            |
| ----------------------- | ---------------------------------------------------------- | -------------------------------------------------- |
| `.rulesync.{layer}/`    | Editable source for that layer                             | Yes for shared layers; usually **no** for `user`   |
| `.rulesync/`            | **Generated** merge output (rulesync input)                | **No** — includes user overrides; always gitignore |
| `rulelayers.jsonc`      | Project-level settings: layers + how to invoke rulesync    | Yes                                                |
| `rulelayers.user.jsonc` | Optional personal config; **fully replaces** project file  | **No**                                             |
| `rulesync.jsonc`        | rulesync targets/features (project root only; not layered) | Yes                                                |

Default layers (low → high precedence): **`company` → `project` → `user`**.

Local layers live in `.rulesync.<layerName>/`. A layer can also come from an **npm package** (see below). Optional **`sublayers`** encode company/project/user (etc.) in filenames inside one physical folder — see [Sublayers](#sublayers) and [examples/](../examples/).

## `rulelayers.jsonc`

Created by `rulelayers init`:

```jsonc
{
  "$schema": "https://raw.githubusercontent.com/DanielFerrariR/rulelayers/main/schema.json",
  "layers": ["company", "project", "user"],
  "rulesync": {
    "command": "rulesync",
    "args": ["generate", "--targets", "*", "--features", "*"],
  },
}
```

- **`layers`**: ordered list, **lowest precedence first**. Strings (e.g. `"project"`) map to `.rulesync.<name>/`. Objects can pull a layer from a filesystem **`path`**, an npm **`package`**, and/or declare `sublayers` / `standaloneSuffix`.
- **`rulesync.command`**: binary to run after merge (default `rulesync`). Local `node_modules/.bin/rulesync` is preferred when present.
- **`rulesync.args`**: argv passed to that command.

Custom local layers:

```bash
rulelayers init --layers org,team,repo,dev
```

## Sublayers

Any layer object may declare `sublayers` (ordered **low → high**). Filenames may then use those suffixes:

```jsonc
{
  "layers": [
    {
      "name": "src",
      "sublayers": ["company", "project", "user"],
    },
  ],
}
```

```text
.rulesync.src/rules/unit-testing.md
.rulesync.src/rules/unit-testing.project.md
.rulesync.src/mcp.project.json
.rulesync.src/.aiignore.project
```

- Path features: higher sublayer **replaces** the same resolved path; the standalone marker (default `.standalone`) keeps a side file (e.g. `unit-testing.project.standalone.md` → `unit-testing.project.md`). Customize per layer with `standaloneSuffix`.
- JSON / ignore: higher sublayer **deep-merges** / **unions** into the canonical name. The standalone marker is **not** allowed on these files.
- Sublayer names must be **unique across layers** (the same suffix may not appear on more than one layer). A sublayer **may** share a name with a physical layer (e.g. `sublayers: ["project", "user"]` plus an optional `.rulesync.user/` folder). A layer’s standalone suffix must not collide with that layer’s sublayers.
- Priority: later entries in `layers` beat earlier ones; within a layer, later `sublayers` beat earlier ones.

Hybrid without a company tier (suffixes in `src`, optional personal folder):

```jsonc
{
  "layers": [{ "name": "src", "sublayers": ["project", "user"] }, "user"],
}
```

Use `unit-testing.md` / `unit-testing.user.md` under `.rulesync.src/`, or put personal overrides in `.rulesync.user/` (later physical layer wins on the same path). Missing local layer dirs are skipped, so teammates without a user folder are fine.

Runnable demos: [examples/single-project](../examples/single-project/) (no company), [examples/single-src](../examples/single-src/) (company/project/user + standalone).

### `standaloneSuffix`

On a layer with `sublayers`, path-feature files may end with `.{standaloneSuffix}` (default `standalone`) so the sublayer stays in the output name instead of joining the replace chain:

```jsonc
{
  "layers": [
    {
      "name": "src",
      "sublayers": ["company", "project", "user"],
      "standaloneSuffix": "keep",
    },
  ],
}
```

Then `unit-testing.project.keep.md` → `.rulesync/rules/unit-testing.project.md`. Each layer can choose its own marker (useful for package layers with a different convention).

## Path layers

Point a layer at a directory outside `.rulesync.<name>/` (relative to the project, or absolute). A common pattern is personal **global** prefs shared across repos.

Keep the team `rulelayers.jsonc` without your path; put the path in a personal override instead:

```jsonc
// rulelayers.jsonc (committed)
{ "layers": ["company", "project", "user"] }

// rulelayers.user.jsonc (gitignored) — full replace, not a merge
{
  "layers": ["company", "project", { "name": "global", "path": "../global" }, "user"],
}
```

- **`path`** alone: filesystem root for that layer (missing path fails `generate`).
- **`path`** with **`package`**: subpath inside the package (see below).
- **`name`**: required for path-only layers (used in logs/omits).

When `rulelayers.user.jsonc` is present it **fully replaces** `rulelayers.jsonc` (project file must still exist). See [User config](#user-config).

Runnable demo: [examples/cross-project](../examples/cross-project/).

## User config

Optional `rulelayers.user.jsonc` in the project root:

- Same schema as `rulelayers.jsonc`
- **No merge** — if present, it is the only config used for `generate`
- `rulelayers.jsonc` must still exist (so the project has a committed baseline)
- Gitignore it (`rulelayers init` adds the entry)

Use this for personal path layers, different rulesync args, or any layers list you do not want in the shared config.

## npm package layers

Publish a package whose contents look like one layer root (`rules/`, `commands/`, `mcp.json`, …), install it in the consumer repo, and point a layer at it:

```bash
npm install -D @acme/company-rules
```

```jsonc
{
  "layers": [{ "name": "company", "package": "@acme/company-rules" }, "project", "user"],
}
```

- **`package`**: npm package name to resolve from `node_modules` (required for package layers).
- **`name`**: label used in logs/omits. If omitted, defaults to the package basename (`@acme/company-rules` → `company-rules`).
- **`path`**: optional subpath inside the package. Overrides the package’s `rulelayers` root when both are set.
- **`sublayers`**: optional filename suffixes inside that package root (same rules as local layers).
- **`standaloneSuffix`**: optional per-layer standalone marker when `sublayers` is set (default `standalone`).

Package authors can declare the layer root in their `package.json`:

```json
{
  "name": "@acme/company-rules",
  "rulelayers": "./dist"
}
```

or `{ "rulelayers": { "root": "./dist" } }`. If unset, the package root is used.

Monorepo-style example (one package, multiple layer folders):

```jsonc
{
  "layers": [
    { "name": "company", "package": "@acme/ai-rules", "path": "layers/company" },
    { "name": "platform", "package": "@acme/ai-rules", "path": "layers/platform" },
    "project",
    "user",
  ],
}
```

Unresolved packages fail `generate` (install the dependency first). Missing _local_ layer dirs are still skipped (e.g. optional `user`).

See also [examples/package-layer](../examples/package-layer/).
