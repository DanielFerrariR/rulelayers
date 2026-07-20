import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { formatConfig, loadConfig, normalizeLayer, DEFAULT_CONFIG } from "../src/config.js";

const dirs: string[] = [];

afterEach(() => {
  while (dirs.length) {
    const d = dirs.pop();
    if (d) rmSync(d, { recursive: true, force: true });
  }
});

describe("loadConfig", () => {
  it("loads layers and rulesync defaults", () => {
    const cwd = mkdtempSync(join(tmpdir(), "rulelayers-cfg-"));
    dirs.push(cwd);
    writeFileSync(
      join(cwd, "rulelayers.jsonc"),
      `{
  // comment ok
  "layers": ["org", "repo"],
  "rulesync": {
    "args": ["generate", "--targets", "cursor"]
  }
}
`,
    );

    const cfg = loadConfig(cwd);
    expect(cfg.layers).toEqual([{ name: "org" }, { name: "repo" }]);
    expect(cfg.rulesync.command).toBe("rulesync");
    expect(cfg.rulesync.args).toEqual(["generate", "--targets", "cursor"]);
  });

  it("loads a per-layer standaloneSuffix", () => {
    const cwd = mkdtempSync(join(tmpdir(), "rulelayers-cfg-"));
    dirs.push(cwd);
    writeFileSync(
      join(cwd, "rulelayers.jsonc"),
      `{
  "layers": [{ "name": "src", "sublayers": ["company", "project"], "standaloneSuffix": "keep" }]
}
`,
    );
    const cfg = loadConfig(cwd);
    expect(cfg.layers).toEqual([
      { name: "src", sublayers: ["company", "project"], standaloneSuffix: "keep" },
    ]);
    expect(formatConfig(cfg)).toContain('"standaloneSuffix": "keep"');
  });

  it("rejects standaloneSuffix that collides with a sublayer", () => {
    const cwd = mkdtempSync(join(tmpdir(), "rulelayers-cfg-"));
    dirs.push(cwd);
    writeFileSync(
      join(cwd, "rulelayers.jsonc"),
      `{
  "layers": [{ "name": "src", "sublayers": ["company", "keep"], "standaloneSuffix": "keep" }]
}
`,
    );
    expect(() => loadConfig(cwd)).toThrow(/collides with standaloneSuffix/);
  });

  it("allows a physical layer named standalone with default standaloneSuffix", () => {
    const cwd = mkdtempSync(join(tmpdir(), "rulelayers-cfg-"));
    dirs.push(cwd);
    writeFileSync(
      join(cwd, "rulelayers.jsonc"),
      `{
  "layers": [
    { "name": "standalone", "sublayers": ["company", "team"] },
    "repo"
  ]
}
`,
    );
    const cfg = loadConfig(cwd);
    expect(cfg.layers[0]).toEqual({
      name: "standalone",
      sublayers: ["company", "team"],
    });
  });

  it("rejects a sublayer named standalone when using the default marker", () => {
    const cwd = mkdtempSync(join(tmpdir(), "rulelayers-cfg-"));
    dirs.push(cwd);
    writeFileSync(
      join(cwd, "rulelayers.jsonc"),
      `{
  "layers": [{ "name": "src", "sublayers": ["company", "standalone"] }]
}
`,
    );
    expect(() => loadConfig(cwd)).toThrow(/collides with standaloneSuffix/);
  });

  it("rejects standaloneSuffix without sublayers", () => {
    const cwd = mkdtempSync(join(tmpdir(), "rulelayers-cfg-"));
    dirs.push(cwd);
    writeFileSync(
      join(cwd, "rulelayers.jsonc"),
      `{ "layers": [{ "name": "project", "standaloneSuffix": "keep" }] }\n`,
    );
    expect(() => loadConfig(cwd)).toThrow(/requires "sublayers"/);
  });

  it("rejects top-level standaloneSuffix", () => {
    const cwd = mkdtempSync(join(tmpdir(), "rulelayers-cfg-"));
    dirs.push(cwd);
    writeFileSync(
      join(cwd, "rulelayers.jsonc"),
      `{
  "layers": [{ "name": "src", "sublayers": ["company"] }],
  "standaloneSuffix": "keep"
}
`,
    );
    expect(() => loadConfig(cwd)).toThrow(/belongs on a layer object/);
  });

  it("rejects invalid standaloneSuffix values", () => {
    const cwd = mkdtempSync(join(tmpdir(), "rulelayers-cfg-"));
    dirs.push(cwd);
    writeFileSync(
      join(cwd, "rulelayers.jsonc"),
      `{ "layers": [{ "name": "src", "sublayers": ["company"], "standaloneSuffix": "foo.bar" }] }\n`,
    );
    expect(() => loadConfig(cwd)).toThrow(/single path segment/);
  });

  it("loads package layers", () => {
    const cwd = mkdtempSync(join(tmpdir(), "rulelayers-cfg-"));
    dirs.push(cwd);
    writeFileSync(
      join(cwd, "rulelayers.jsonc"),
      `{
  "layers": [
    { "package": "@acme/company-rules" },
    { "name": "platform", "package": "@acme/mono", "path": "layers/platform" },
    "project",
    "user"
  ]
}
`,
    );

    const cfg = loadConfig(cwd);
    expect(cfg.layers).toEqual([
      { name: "company-rules", package: "@acme/company-rules" },
      { name: "platform", package: "@acme/mono", path: "layers/platform" },
      { name: "project" },
      { name: "user" },
    ]);
  });

  it("rejects path without package", () => {
    const cwd = mkdtempSync(join(tmpdir(), "rulelayers-cfg-"));
    dirs.push(cwd);
    writeFileSync(
      join(cwd, "rulelayers.jsonc"),
      `{ "layers": [{ "name": "x", "path": "oops" }] }\n`,
    );
    expect(() => loadConfig(cwd)).toThrow(/path" requires "package/);
  });

  it("throws when config missing", () => {
    const cwd = mkdtempSync(join(tmpdir(), "rulelayers-cfg-"));
    dirs.push(cwd);
    expect(() => loadConfig(cwd)).toThrow(/Missing rulelayers.jsonc/);
  });

  it("formatConfig round-trips defaults and package layers", () => {
    const text = formatConfig(DEFAULT_CONFIG);
    expect(text).toContain('"layers"');
    expect(text).toContain("company");

    const withPkg = formatConfig({
      ...DEFAULT_CONFIG,
      layers: [normalizeLayer({ package: "@acme/rules" }), { name: "project" }, { name: "user" }],
    });
    expect(withPkg).toContain('"package": "@acme/rules"');
    expect(withPkg).toContain('"name": "rules"');
  });

  it("loads sublayers and serializes them", () => {
    const cwd = mkdtempSync(join(tmpdir(), "rulelayers-cfg-"));
    dirs.push(cwd);
    writeFileSync(
      join(cwd, "rulelayers.jsonc"),
      `{
  "layers": [{ "name": "src", "sublayers": ["company", "project", "user"] }]
}
`,
    );
    const cfg = loadConfig(cwd);
    expect(cfg.layers).toEqual([{ name: "src", sublayers: ["company", "project", "user"] }]);
    expect(formatConfig(cfg)).toContain('"sublayers"');
  });

  it("rejects empty or duplicate sublayers", () => {
    const cwd = mkdtempSync(join(tmpdir(), "rulelayers-cfg-"));
    dirs.push(cwd);
    writeFileSync(
      join(cwd, "rulelayers.jsonc"),
      `{ "layers": [{ "name": "src", "sublayers": [] }] }\n`,
    );
    expect(() => loadConfig(cwd)).toThrow(/non-empty array/);

    writeFileSync(
      join(cwd, "rulelayers.jsonc"),
      `{ "layers": [{ "name": "src", "sublayers": ["a", "a"] }] }\n`,
    );
    expect(() => loadConfig(cwd)).toThrow(/duplicate sublayer/);
  });

  it("allows a sublayer name that matches a physical layer", () => {
    const cwd = mkdtempSync(join(tmpdir(), "rulelayers-cfg-"));
    dirs.push(cwd);
    writeFileSync(
      join(cwd, "rulelayers.jsonc"),
      `{
  "layers": [
    { "name": "src", "sublayers": ["project", "user"] },
    "user"
  ]
}
`,
    );
    const cfg = loadConfig(cwd);
    expect(cfg.layers).toEqual([{ name: "src", sublayers: ["project", "user"] }, { name: "user" }]);
  });

  it("rejects the same sublayer name on multiple layers", () => {
    const cwd = mkdtempSync(join(tmpdir(), "rulelayers-cfg-"));
    dirs.push(cwd);
    writeFileSync(
      join(cwd, "rulelayers.jsonc"),
      `{
  "layers": [
    { "name": "src", "sublayers": ["company"] },
    { "name": "rules", "sublayers": ["company"] }
  ]
}
`,
    );
    expect(() => loadConfig(cwd)).toThrow(/globally unique|declared on both/);
  });
});
