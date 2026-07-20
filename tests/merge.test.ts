import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.js";
import { parseFrontmatter } from "../src/frontmatter.js";
import { mergeLayers, __test } from "../src/merge.js";
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

describe("parseFrontmatter", () => {
  it("detects omit and reason, strips both from output", () => {
    const raw = `---
omit: true
reason: "not needed here"
targets: ["*"]
---

Body
`;
    const fm = parseFrontmatter(raw);
    expect(fm.omit).toBe(true);
    expect(fm.reason).toBe("not needed here");
    expect(fm.stripped).not.toContain("omit:");
    expect(fm.stripped).not.toContain("reason:");
    expect(fm.stripped).toContain("targets:");
    expect(fm.stripped).toContain("Body");
  });

  it("leaves content without frontmatter unchanged", () => {
    const raw = "Just text\n";
    const fm = parseFrontmatter(raw);
    expect(fm.omit).toBe(false);
    expect(fm.stripped).toBe(raw);
  });

  it("preserves original frontmatter formatting when omit/reason are absent", () => {
    const raw = `---
targets: ["*"]
globs: ["**/*.ts", "**/*.tsx"]
description: "hello"
---

Body
`;
    const fm = parseFrontmatter(raw);
    expect(fm.omit).toBe(false);
    expect(fm.stripped).toBe(raw);
  });
});

describe("deepMerge / mergeIgnoreLines", () => {
  it("deep-merges objects with higher keys winning", () => {
    const a = { mcpServers: { a: { command: "a" }, b: { command: "b" } } };
    const b = { mcpServers: { b: { command: "b2" }, c: { command: "c" } } };
    const merged = __test.deepMerge(a, b);
    expect(merged).toEqual({
      mcpServers: {
        a: { command: "a" },
        b: { command: "b2" },
        c: { command: "c" },
      },
    });
  });

  it("unions ignore lines preserving order", () => {
    const merged = __test.mergeIgnoreLines("foo\nbar\n", "bar\nbaz\n");
    expect(merged).toBe("foo\nbar\nbaz\n");
  });
});

describe("mergeLayers", () => {
  it("overrides same path, extends different paths", () => {
    const cwd = tempDir();
    write(cwd, ".rulesync.company/rules/shared.md", '---\ntargets: ["*"]\n---\n\ncompany\n');
    write(
      cwd,
      ".rulesync.company/rules/only-company.md",
      '---\ntargets: ["*"]\n---\n\ncompany-only\n',
    );
    write(cwd, ".rulesync.project/rules/shared.md", '---\ntargets: ["*"]\n---\n\nproject\n');
    write(
      cwd,
      ".rulesync.project/rules/only-project.md",
      '---\ntargets: ["*"]\n---\n\nproject-only\n',
    );

    const result = mergeLayers({
      cwd,
      config: { ...DEFAULT_CONFIG, layers: [{ name: "company" }, { name: "project" }] },
    });

    expect(result.written).toContain("rules/shared.md");
    expect(result.written).toContain("rules/only-company.md");
    expect(result.written).toContain("rules/only-project.md");
    expect(readFileSync(join(cwd, ".rulesync/rules/shared.md"), "utf8")).toContain("project");
    expect(readFileSync(join(cwd, ".rulesync/rules/shared.md"), "utf8")).not.toContain("company\n");
  });

  it("omits with optional reason", () => {
    const cwd = tempDir();
    write(cwd, ".rulesync.company/rules/legacy.md", '---\ntargets: ["*"]\n---\n\nold\n');
    write(
      cwd,
      ".rulesync.project/rules/legacy.md",
      '---\nomit: true\nreason: "replaced by project flow"\n---\n\n',
    );

    const logs: string[] = [];
    const result = mergeLayers({
      cwd,
      config: { ...DEFAULT_CONFIG, layers: [{ name: "company" }, { name: "project" }] },
      verbose: true,
      log: (m) => logs.push(m),
    });

    expect(result.omitted).toEqual([
      {
        path: "rules/legacy.md",
        layer: "project",
        reason: "replaced by project flow",
      },
    ]);
    expect(existsSync(join(cwd, ".rulesync/rules/legacy.md"))).toBe(false);
    expect(logs.some((l) => l.includes("omit rules/legacy.md"))).toBe(true);
  });

  it("merges mcp.json servers", () => {
    const cwd = tempDir();
    write(
      cwd,
      ".rulesync.company/mcp.json",
      JSON.stringify({
        mcpServers: {
          company: { command: "c" },
          shared: { command: "old" },
        },
      }),
    );
    write(
      cwd,
      ".rulesync.project/mcp.json",
      JSON.stringify({
        mcpServers: {
          shared: { command: "new" },
          project: { command: "p" },
        },
      }),
    );

    mergeLayers({
      cwd,
      config: { ...DEFAULT_CONFIG, layers: [{ name: "company" }, { name: "project" }] },
    });

    const mcp = JSON.parse(readFileSync(join(cwd, ".rulesync/mcp.json"), "utf8")) as {
      mcpServers: Record<string, { command: string }>;
    };
    expect(mcp.mcpServers.company.command).toBe("c");
    expect(mcp.mcpServers.shared.command).toBe("new");
    expect(mcp.mcpServers.project.command).toBe("p");
  });

  it("replaces skills by name and adds new ones", () => {
    const cwd = tempDir();
    write(
      cwd,
      ".rulesync.company/skills/shared/SKILL.md",
      "---\nname: shared\n---\n\ncompany skill\n",
    );
    write(
      cwd,
      ".rulesync.company/skills/company-only/SKILL.md",
      "---\nname: company-only\n---\n\ncompany only\n",
    );
    write(
      cwd,
      ".rulesync.project/skills/shared/SKILL.md",
      "---\nname: shared\n---\n\nproject skill\n",
    );
    write(
      cwd,
      ".rulesync.user/skills/user-tool/SKILL.md",
      "---\nname: user-tool\n---\n\nuser skill\n",
    );

    mergeLayers({
      cwd,
      config: {
        ...DEFAULT_CONFIG,
        layers: [{ name: "company" }, { name: "project" }, { name: "user" }],
      },
    });

    expect(readFileSync(join(cwd, ".rulesync/skills/shared/SKILL.md"), "utf8")).toContain(
      "project skill",
    );
    expect(existsSync(join(cwd, ".rulesync/skills/company-only/SKILL.md"))).toBe(true);
    expect(existsSync(join(cwd, ".rulesync/skills/user-tool/SKILL.md"))).toBe(true);
  });

  it("omits a skill via SKILL.md omit: true", () => {
    const cwd = tempDir();
    write(cwd, ".rulesync.company/skills/banned/SKILL.md", "---\nname: banned\n---\n\nnope\n");
    write(
      cwd,
      ".rulesync.project/skills/banned/SKILL.md",
      '---\nomit: true\nreason: "security policy"\n---\n\n',
    );

    const result = mergeLayers({
      cwd,
      config: { ...DEFAULT_CONFIG, layers: [{ name: "company" }, { name: "project" }] },
    });

    expect(result.omitted.some((o) => o.path === "skills/banned")).toBe(true);
    expect(existsSync(join(cwd, ".rulesync/skills/banned"))).toBe(false);
  });

  it("merges ignore files and skips missing middle layer", () => {
    const cwd = tempDir();
    write(cwd, ".rulesync.company/.aiignore", "secrets/\n");
    write(cwd, ".rulesync.user/.aiignore", "local/\nsecrets/\n");

    const result = mergeLayers({
      cwd,
      config: {
        ...DEFAULT_CONFIG,
        layers: [{ name: "company" }, { name: "project" }, { name: "user" }],
      },
      verbose: true,
      log: () => {},
    });

    expect(result.skippedLayers).toContain("project");
    expect(readFileSync(join(cwd, ".rulesync/.aiignore"), "utf8")).toBe("secrets/\nlocal/\n");
  });

  it("dry-run does not write .rulesync", () => {
    const cwd = tempDir();
    write(cwd, ".rulesync.company/rules/a.md", '---\ntargets: ["*"]\n---\n\nx\n');

    const result = mergeLayers({
      cwd,
      config: { ...DEFAULT_CONFIG, layers: [{ name: "company" }] },
      dryRun: true,
    });

    expect(result.written).toContain("rules/a.md");
    expect(existsSync(join(cwd, ".rulesync"))).toBe(false);
  });

  it("resolves filename sublayers: replace chain and standalone", () => {
    const cwd = tempDir();
    const sublayers = ["company", "project", "user"];
    write(cwd, ".rulesync.src/rules/unit-testing.md", '---\ntargets: ["*"]\n---\n\ncompany base\n');
    write(
      cwd,
      ".rulesync.src/rules/unit-testing.project.md",
      '---\ntargets: ["*"]\n---\n\nproject override\n',
    );
    write(
      cwd,
      ".rulesync.src/rules/unit-testing.project.standalone.md",
      '---\ntargets: ["*"]\n---\n\nproject extra\n',
    );

    mergeLayers({
      cwd,
      config: {
        ...DEFAULT_CONFIG,
        layers: [{ name: "src", sublayers }],
      },
    });

    expect(readFileSync(join(cwd, ".rulesync/rules/unit-testing.md"), "utf8")).toContain(
      "project override",
    );
    expect(readFileSync(join(cwd, ".rulesync/rules/unit-testing.project.md"), "utf8")).toContain(
      "project extra",
    );
  });

  it("higher path sublayer can omit the chain", () => {
    const cwd = tempDir();
    write(cwd, ".rulesync.src/rules/legacy.md", '---\ntargets: ["*"]\n---\n\nold\n');
    write(cwd, ".rulesync.src/rules/legacy.project.md", '---\nomit: true\nreason: "gone"\n---\n\n');

    const result = mergeLayers({
      cwd,
      config: {
        ...DEFAULT_CONFIG,
        layers: [{ name: "src", sublayers: ["company", "project"] }],
      },
    });

    expect(result.omitted.some((o) => o.path === "rules/legacy.md")).toBe(true);
    expect(existsSync(join(cwd, ".rulesync/rules/legacy.md"))).toBe(false);
  });

  it("deep-merges mcp and unions aiignore across sublayer suffixes", () => {
    const cwd = tempDir();
    write(
      cwd,
      ".rulesync.src/mcp.json",
      JSON.stringify({ mcpServers: { a: { command: "a" }, shared: { command: "old" } } }),
    );
    write(
      cwd,
      ".rulesync.src/mcp.project.json",
      JSON.stringify({ mcpServers: { shared: { command: "new" }, b: { command: "b" } } }),
    );
    write(cwd, ".rulesync.src/.aiignore", "secrets/\n");
    write(cwd, ".rulesync.src/.aiignore.project", "local/\n");

    mergeLayers({
      cwd,
      config: {
        ...DEFAULT_CONFIG,
        layers: [{ name: "src", sublayers: ["company", "project"] }],
      },
    });

    const mcp = JSON.parse(readFileSync(join(cwd, ".rulesync/mcp.json"), "utf8")) as {
      mcpServers: Record<string, { command: string }>;
    };
    expect(mcp.mcpServers.a.command).toBe("a");
    expect(mcp.mcpServers.shared.command).toBe("new");
    expect(mcp.mcpServers.b.command).toBe("b");
    expect(readFileSync(join(cwd, ".rulesync/.aiignore"), "utf8")).toBe("secrets/\nlocal/\n");
  });

  it("merges legacy .mcp.{sublayer}.json into mcp.json by sublayer rank", () => {
    const cwd = tempDir();
    write(
      cwd,
      ".rulesync.src/mcp.json",
      JSON.stringify({ mcpServers: { a: { command: "a" }, shared: { command: "old" } } }),
    );
    write(
      cwd,
      ".rulesync.src/.mcp.project.json",
      JSON.stringify({ mcpServers: { shared: { command: "new" }, b: { command: "b" } } }),
    );

    mergeLayers({
      cwd,
      config: {
        ...DEFAULT_CONFIG,
        layers: [{ name: "src", sublayers: ["company", "project"] }],
      },
    });

    const mcp = JSON.parse(readFileSync(join(cwd, ".rulesync/mcp.json"), "utf8")) as {
      mcpServers: Record<string, { command: string }>;
    };
    expect(mcp.mcpServers.shared.command).toBe("new");
    expect(mcp.mcpServers.a.command).toBe("a");
    expect(mcp.mcpServers.b.command).toBe("b");
    expect(existsSync(join(cwd, ".rulesync/.mcp.json"))).toBe(false);
  });

  it("errors on standalone JSON/ignore filenames", () => {
    const cwd = tempDir();
    write(cwd, ".rulesync.src/mcp.project.standalone.json", "{}");

    expect(() =>
      mergeLayers({
        cwd,
        config: {
          ...DEFAULT_CONFIG,
          layers: [{ name: "src", sublayers: ["company", "project"] }],
        },
      }),
    ).toThrow(/standalone/);
  });

  it("without sublayers keeps dotted names and ignores mcp.project.json", () => {
    const cwd = tempDir();
    write(cwd, ".rulesync.project/rules/style.project.md", '---\ntargets: ["*"]\n---\n\nkeep\n');
    write(
      cwd,
      ".rulesync.project/mcp.project.json",
      JSON.stringify({ mcpServers: { x: { command: "x" } } }),
    );
    write(
      cwd,
      ".rulesync.project/mcp.json",
      JSON.stringify({ mcpServers: { y: { command: "y" } } }),
    );

    mergeLayers({
      cwd,
      config: { ...DEFAULT_CONFIG, layers: [{ name: "project" }] },
    });

    expect(existsSync(join(cwd, ".rulesync/rules/style.project.md"))).toBe(true);
    const mcp = JSON.parse(readFileSync(join(cwd, ".rulesync/mcp.json"), "utf8")) as {
      mcpServers: Record<string, unknown>;
    };
    expect(mcp.mcpServers.y).toBeDefined();
    expect(mcp.mcpServers.x).toBeUndefined();
  });

  it("higher physical layer replaces resolved path from lower sublayers", () => {
    const cwd = tempDir();
    write(
      cwd,
      ".rulesync.src/rules/unit-testing.user.md",
      '---\ntargets: ["*"]\n---\n\nfrom src user sublayer\n',
    );
    write(
      cwd,
      ".rulesync.local/rules/unit-testing.md",
      '---\ntargets: ["*"]\n---\n\nfrom local layer\n',
    );

    mergeLayers({
      cwd,
      config: {
        ...DEFAULT_CONFIG,
        layers: [{ name: "src", sublayers: ["company", "project", "user"] }, { name: "local" }],
      },
    });

    expect(readFileSync(join(cwd, ".rulesync/rules/unit-testing.md"), "utf8")).toContain(
      "from local layer",
    );
  });
});

describe("scaffold", () => {
  it("creates config and default layers", () => {
    const cwd = tempDir();
    const result = scaffold({ cwd });
    expect(result.created.some((p) => p.endsWith("rulelayers.jsonc"))).toBe(true);
    expect(existsSync(join(cwd, ".rulesync.company/rules/overview.md"))).toBe(true);
    expect(existsSync(join(cwd, ".rulesync.project"))).toBe(true);
    expect(existsSync(join(cwd, ".rulesync.user"))).toBe(true);
    expect(readFileSync(join(cwd, "rulelayers.jsonc"), "utf8")).toContain('"company"');
  });
});
