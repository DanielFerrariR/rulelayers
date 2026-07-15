import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { formatConfig, loadConfig, DEFAULT_CONFIG } from "../src/config.js";

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
    expect(cfg.layers).toEqual(["org", "repo"]);
    expect(cfg.rulesync.command).toBe("rulesync");
    expect(cfg.rulesync.args).toEqual(["generate", "--targets", "cursor"]);
  });

  it("throws when config missing", () => {
    const cwd = mkdtempSync(join(tmpdir(), "rulelayers-cfg-"));
    dirs.push(cwd);
    expect(() => loadConfig(cwd)).toThrow(/Missing rulelayers.jsonc/);
  });

  it("formatConfig round-trips defaults", () => {
    const text = formatConfig(DEFAULT_CONFIG);
    expect(text).toContain('"layers"');
    expect(text).toContain("company");
  });
});
