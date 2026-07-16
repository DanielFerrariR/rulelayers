# Configuration

## Mental model

| Path                 | Role                                                | Commit?                                            |
| -------------------- | --------------------------------------------------- | -------------------------------------------------- |
| `.rulesync.{layer}/` | Editable source for that layer                      | Yes for shared layers; usually **no** for `user`   |
| `.rulesync/`         | **Generated** merge output (rulesync input)         | **No** — includes user overrides; always gitignore |
| `rulelayers.jsonc`   | Layer list + how to invoke rulesync                 | Yes                                                |
| `rulesync.jsonc`     | rulesync targets/features (unchanged by rulelayers) | Yes                                                |

Default layers (low → high precedence): **`company` → `project` → `user`**.

Local layers live in `.rulesync.<layerName>/`. A layer can also come from an **npm package** (see below).

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

- **`layers`**: ordered list, **lowest precedence first**. Strings (e.g. `"project"`) map to `.rulesync.<name>/`. Objects can pull a layer from an npm package.
- **`rulesync.command`**: binary to run after merge (default `rulesync`). Local `node_modules/.bin/rulesync` is preferred when present.
- **`rulesync.args`**: argv passed to that command.

Custom local layers:

```bash
rulelayers init --layers org,team,repo,dev
```

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
