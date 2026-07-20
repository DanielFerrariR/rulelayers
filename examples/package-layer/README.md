# Package + local layers

Company rules come from a local npm package under `packages/company-rules/` (stand-in for a published `@org/…` package). Project and user stay as folders in the consumer repo.

```bash
npm install
node ../../dist/cli.js generate --merge-only -v
```

Config:

```jsonc
{
  "layers": [{ "name": "company", "package": "@examples/company-rules" }, "project", "user"],
}
```
