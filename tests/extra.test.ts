import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CONFIG, layerDirName, loadConfig } from "../src/config.js";
import { generateCommand } from "../src/commands/generate.js";
import { initCommand } from "../src/commands/init.js";
import { mergeLayers } from "../src/merge.js";
import { resolveRulesyncBinary, runRulesync } from "../src/rulesync.js";
import { scaffold } from "../src/scaffold.js";

const tempDirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "rulelayers-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

function write(cwd: string, rel: string, content: string): void {
  const abs = join(cwd, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content, "utf8");
}

describe("commands / subagents / hooks / permissions", () => {
  it("merges commands and subagents with override and omit", () => {
    const cwd = tempDir();
    write(
      cwd,
      ".rulesync.company/commands/review.md",
      "---\ndescription: review\n---\n\ncompany review\n",
    );
    write(
      cwd,
      ".rulesync.company/subagents/tester.md",
      "---\ndescription: tester\n---\n\ncompany tester\n",
    );
    write(
      cwd,
      ".rulesync.project/commands/review.md",
      "---\nomit: true\nreason: use pr-review instead\n---\n\n",
    );
    write(
      cwd,
      ".rulesync.project/commands/pr-review.md",
      "---\ndescription: pr\n---\n\nproject pr\n",
    );
    write(
      cwd,
      ".rulesync.project/subagents/tester.md",
      "---\ndescription: tester\n---\n\nproject tester\n",
    );

    const result = mergeLayers({
      cwd,
      config: { ...DEFAULT_CONFIG, layers: [{ name: "company" }, { name: "project" }] },
    });

    expect(result.omitted.some((o) => o.path === "commands/review.md")).toBe(true);
    expect(existsSync(join(cwd, ".rulesync/commands/review.md"))).toBe(false);
    expect(readFileSync(join(cwd, ".rulesync/commands/pr-review.md"), "utf8")).toContain(
      "project pr",
    );
    expect(readFileSync(join(cwd, ".rulesync/subagents/tester.md"), "utf8")).toContain(
      "project tester",
    );
  });

  it("deep-merges hooks.json and permissions.json", () => {
    const cwd = tempDir();
    write(
      cwd,
      ".rulesync.company/hooks.json",
      JSON.stringify({ hooks: { PreToolUse: [{ matcher: "a" }] } }),
    );
    write(
      cwd,
      ".rulesync.project/hooks.json",
      JSON.stringify({ hooks: { PostToolUse: [{ matcher: "b" }] } }),
    );
    write(
      cwd,
      ".rulesync.company/permissions.json",
      JSON.stringify({ allow: ["Read"], deny: ["Bash"] }),
    );
    write(
      cwd,
      ".rulesync.project/permissions.json",
      JSON.stringify({ allow: ["Read", "Edit"], ask: ["Write"] }),
    );

    mergeLayers({
      cwd,
      config: { ...DEFAULT_CONFIG, layers: [{ name: "company" }, { name: "project" }] },
    });

    const hooks = JSON.parse(readFileSync(join(cwd, ".rulesync/hooks.json"), "utf8")) as {
      hooks: Record<string, unknown[]>;
    };
    expect(hooks.hooks.PreToolUse).toEqual([{ matcher: "a" }]);
    expect(hooks.hooks.PostToolUse).toEqual([{ matcher: "b" }]);

    const perms = JSON.parse(readFileSync(join(cwd, ".rulesync/permissions.json"), "utf8")) as {
      allow: string[];
      deny: string[];
      ask: string[];
    };
    // array replace (not union) for conflicting keys — project allow replaces company allow
    expect(perms.allow).toEqual(["Read", "Edit"]);
    expect(perms.deny).toEqual(["Bash"]);
    expect(perms.ask).toEqual(["Write"]);
  });

  it("collapses legacy .mcp.json into mcp.json", () => {
    const cwd = tempDir();
    write(
      cwd,
      ".rulesync.company/.mcp.json",
      JSON.stringify({ mcpServers: { legacy: { command: "old" } } }),
    );
    write(
      cwd,
      ".rulesync.project/mcp.json",
      JSON.stringify({ mcpServers: { modern: { command: "new" } } }),
    );

    mergeLayers({
      cwd,
      config: { ...DEFAULT_CONFIG, layers: [{ name: "company" }, { name: "project" }] },
    });

    expect(existsSync(join(cwd, ".rulesync/mcp.json"))).toBe(true);
    expect(existsSync(join(cwd, ".rulesync/.mcp.json"))).toBe(false);
    const mcp = JSON.parse(readFileSync(join(cwd, ".rulesync/mcp.json"), "utf8")) as {
      mcpServers: Record<string, { command: string }>;
    };
    expect(mcp.mcpServers.legacy.command).toBe("old");
    expect(mcp.mcpServers.modern.command).toBe("new");
  });

  it("skips .gitkeep files in path features", () => {
    const cwd = tempDir();
    write(cwd, ".rulesync.company/rules/.gitkeep", "");
    write(cwd, ".rulesync.company/rules/real.md", '---\ntargets: ["*"]\n---\n\nok\n');

    const result = mergeLayers({
      cwd,
      config: { ...DEFAULT_CONFIG, layers: [{ name: "company" }] },
    });

    expect(result.written).toContain("rules/real.md");
    expect(result.written).not.toContain("rules/.gitkeep");
  });
});

describe("layerDirName / formatConfig", () => {
  it("builds layer directory names", () => {
    expect(layerDirName("company")).toBe(".rulesync.company");
  });

  it("rejects empty layers array", () => {
    const cwd = tempDir();
    writeFileSync(join(cwd, "rulelayers.jsonc"), '{ "layers": [] }\n', "utf8");
    expect(() => loadConfig(cwd)).toThrow(/non-empty/);
  });
});

describe("initCommand / generateCommand", () => {
  it("initCommand scaffolds and is idempotent without --force", () => {
    const cwd = tempDir();
    const logs: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((msg?: unknown) => {
      logs.push(String(msg ?? ""));
    });

    initCommand({ cwd });
    initCommand({ cwd });

    spy.mockRestore();
    expect(existsSync(join(cwd, "rulelayers.jsonc"))).toBe(true);
    expect(logs.some((l) => l.includes("skipped"))).toBe(true);
  });

  it("initCommand accepts custom layers", () => {
    const cwd = tempDir();
    vi.spyOn(console, "log").mockImplementation(() => {});
    initCommand({ cwd, layers: "org,repo" });
    vi.restoreAllMocks();

    expect(existsSync(join(cwd, ".rulesync.org"))).toBe(true);
    expect(existsSync(join(cwd, ".rulesync.repo"))).toBe(true);
    const cfg = loadConfig(cwd);
    expect(cfg.layers).toEqual([{ name: "org" }, { name: "repo" }]);
  });

  it("generateCommand merge-only writes .rulesync", async () => {
    const cwd = tempDir();
    scaffold({ cwd });
    vi.spyOn(console, "log").mockImplementation(() => {});

    await generateCommand({ cwd, mergeOnly: true });
    vi.restoreAllMocks();

    expect(existsSync(join(cwd, ".rulesync/rules/overview.md"))).toBe(true);
  });

  it("generateCommand dry-run does not create .rulesync", async () => {
    const cwd = tempDir();
    scaffold({ cwd });
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((msg?: unknown) => {
      logs.push(String(msg ?? ""));
    });

    await generateCommand({ cwd, dryRun: true });
    vi.restoreAllMocks();

    expect(existsSync(join(cwd, ".rulesync"))).toBe(false);
    expect(logs.some((l) => l.includes("dry-run"))).toBe(true);
  });

  it("generateCommand throws when config missing", async () => {
    const cwd = tempDir();
    await expect(generateCommand({ cwd, mergeOnly: true })).rejects.toThrow(/Missing rulelayers/);
  });
});

describe("resolveRulesyncBinary / runRulesync", () => {
  it("returns absolute command paths unchanged", () => {
    expect(resolveRulesyncBinary("/tmp", "/usr/local/bin/rulesync")).toBe(
      "/usr/local/bin/rulesync",
    );
  });

  it("prefers local node_modules/.bin/rulesync", () => {
    const cwd = tempDir();
    const binDir = join(cwd, "node_modules", ".bin");
    mkdirSync(binDir, { recursive: true });
    const local = join(binDir, "rulesync");
    writeFileSync(local, "#!/bin/sh\necho ok\n", "utf8");
    expect(resolveRulesyncBinary(cwd, "rulesync")).toBe(local);
  });

  it("runs a stub executable and returns exit code 0", async () => {
    const cwd = tempDir();
    const stub = join(cwd, "fake-rulesync");
    writeFileSync(stub, "#!/bin/sh\nexit 0\n", "utf8");
    chmodSync(stub, 0o755);

    const code = await runRulesync({
      cwd,
      rulesync: { command: stub, args: [] },
      verbose: true,
      log: () => {},
    });
    expect(code).toBe(0);
  });

  it("rejects with install hint when binary is missing", async () => {
    const cwd = tempDir();
    await expect(
      runRulesync({
        cwd,
        rulesync: { command: "rulelayers-definitely-missing-xyz", args: ["generate"] },
      }),
    ).rejects.toThrow(/Could not find/);
  });

  it("returns non-zero exit codes from the child", async () => {
    const cwd = tempDir();
    const stub = join(cwd, "fail-rulesync");
    writeFileSync(stub, "#!/bin/sh\nexit 7\n", "utf8");
    chmodSync(stub, 0o755);

    const code = await runRulesync({
      cwd,
      rulesync: { command: stub, args: [] },
    });
    expect(code).toBe(7);
  });
});

describe("scaffold force", () => {
  it("overwrites when force is true", () => {
    const cwd = tempDir();
    scaffold({ cwd });
    writeFileSync(join(cwd, "rulelayers.jsonc"), '{ "layers": ["broken"] }\n', "utf8");
    const result = scaffold({ cwd, force: true });
    expect(result.created.some((p) => p.endsWith("rulelayers.jsonc"))).toBe(true);
    expect(readFileSync(join(cwd, "rulelayers.jsonc"), "utf8")).toContain('"company"');
  });
});
