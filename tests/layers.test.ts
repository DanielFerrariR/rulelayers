import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.js";
import { formatLayerLabel, resolveLayerRoot, resolvePackageDir } from "../src/layers.js";
import { mergeLayers } from "../src/merge.js";

const dirs: string[] = [];

afterEach(() => {
  while (dirs.length) {
    const d = dirs.pop();
    if (d) rmSync(d, { recursive: true, force: true });
  }
});

function tempDir(): string {
  const cwd = mkdtempSync(join(tmpdir(), "rulelayers-pkg-"));
  dirs.push(cwd);
  return cwd;
}

function write(cwd: string, rel: string, content: string): void {
  const abs = join(cwd, rel);
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, content, "utf8");
}

function installFakePackage(
  cwd: string,
  packageName: string,
  files: Record<string, string>,
  pkgFields: Record<string, unknown> = {},
): string {
  const pkgRoot = join(cwd, "node_modules", ...packageName.split("/"));
  mkdirSync(pkgRoot, { recursive: true });
  writeFileSync(
    join(pkgRoot, "package.json"),
    `${JSON.stringify({ name: packageName, version: "1.0.0", ...pkgFields }, null, 2)}\n`,
  );
  for (const [rel, content] of Object.entries(files)) {
    write(pkgRoot, rel, content);
  }
  return realpathSync(pkgRoot);
}

describe("resolvePackageDir / resolveLayerRoot", () => {
  it("resolves a scoped package from node_modules", () => {
    const cwd = tempDir();
    const pkgRoot = installFakePackage(cwd, "@acme/company-rules", {
      "rules/base.md": '---\ntargets: ["*"]\n---\n\nfrom pkg\n',
    });

    expect(resolvePackageDir(cwd, "@acme/company-rules")).toBe(pkgRoot);
    expect(resolveLayerRoot(cwd, { name: "company", package: "@acme/company-rules" })).toBe(
      pkgRoot,
    );
  });

  it("honors package.json rulelayers root and config path", () => {
    const cwd = tempDir();
    const pkgRoot = installFakePackage(
      cwd,
      "@acme/mono",
      {
        "layers/company/rules/a.md": '---\ntargets: ["*"]\n---\n\na\n',
      },
      { rulelayers: { root: "layers/company" } },
    );

    expect(resolveLayerRoot(cwd, { name: "company", package: "@acme/mono" })).toBe(
      join(pkgRoot, "layers/company"),
    );
    expect(
      resolveLayerRoot(cwd, {
        name: "company",
        package: "@acme/mono",
        path: "layers/company",
      }),
    ).toBe(join(pkgRoot, "layers/company"));
  });

  it("rejects path traversal outside the package", () => {
    const cwd = tempDir();
    installFakePackage(cwd, "acme-rules", {
      "rules/a.md": "x\n",
    });

    expect(() =>
      resolveLayerRoot(cwd, { name: "company", package: "acme-rules", path: "../.." }),
    ).toThrow(/escapes the package root/);
  });

  it("throws when package is not installed", () => {
    const cwd = tempDir();
    expect(() => resolvePackageDir(cwd, "@missing/pkg")).toThrow(/Could not resolve layer package/);
  });

  it("formatLayerLabel includes package", () => {
    expect(formatLayerLabel({ name: "company", package: "@acme/rules", path: "dist" })).toBe(
      "company (@acme/rules:dist)",
    );
  });

  it("resolves a path-only layer relative to cwd", () => {
    const cwd = tempDir();
    const shared = join(cwd, "shared-global");
    mkdirSync(join(shared, "rules"), { recursive: true });
    writeFileSync(join(shared, "rules/a.md"), "x\n");

    const project = join(cwd, "apps", "web");
    mkdirSync(project, { recursive: true });

    expect(resolveLayerRoot(project, { name: "global", path: "../../shared-global" })).toBe(
      realpathSync(shared),
    );
    expect(formatLayerLabel({ name: "global", path: "../../shared-global" })).toBe(
      "global (../../shared-global)",
    );
  });

  it("throws when path-only layer directory is missing", () => {
    const cwd = tempDir();
    expect(() => resolveLayerRoot(cwd, { name: "global", path: "../missing" })).toThrow(
      /path not found/,
    );
  });
});

describe("mergeLayers with package layer", () => {
  it("merges npm package layer under local project overrides", () => {
    const cwd = tempDir();
    installFakePackage(cwd, "@acme/company-rules", {
      "rules/shared.md": '---\ntargets: ["*"]\n---\n\ncompany-pkg\n',
      "rules/only-pkg.md": '---\ntargets: ["*"]\n---\n\npkg-only\n',
    });
    write(cwd, ".rulesync.project/rules/shared.md", '---\ntargets: ["*"]\n---\n\nproject\n');
    write(cwd, ".rulesync.project/rules/project.md", '---\ntargets: ["*"]\n---\n\nlocal\n');

    mergeLayers({
      cwd,
      config: {
        ...DEFAULT_CONFIG,
        layers: [{ name: "company", package: "@acme/company-rules" }, { name: "project" }],
      },
    });

    expect(readFileSync(join(cwd, ".rulesync/rules/shared.md"), "utf8")).toContain("project");
    expect(readFileSync(join(cwd, ".rulesync/rules/only-pkg.md"), "utf8")).toContain("pkg-only");
    expect(readFileSync(join(cwd, ".rulesync/rules/project.md"), "utf8")).toContain("local");
  });

  it("merges a shared path layer across projects", () => {
    const root = tempDir();
    write(root, "global/rules/shared.md", '---\ntargets: ["*"]\n---\n\nglobal\n');
    write(root, "global/rules/only-global.md", '---\ntargets: ["*"]\n---\n\nglobal-only\n');

    const projectA = join(root, "project-a");
    mkdirSync(projectA, { recursive: true });
    write(projectA, ".rulesync.company/rules/base.md", '---\ntargets: ["*"]\n---\n\ncompany\n');
    write(projectA, ".rulesync.project/rules/shared.md", '---\ntargets: ["*"]\n---\n\nproject-a\n');
    write(projectA, ".rulesync.user/rules/personal.md", '---\ntargets: ["*"]\n---\n\nuser-a\n');

    mergeLayers({
      cwd: projectA,
      config: {
        ...DEFAULT_CONFIG,
        layers: [
          { name: "company" },
          { name: "project" },
          { name: "global", path: "../global" },
          { name: "user" },
        ],
      },
    });

    expect(readFileSync(join(projectA, ".rulesync/rules/shared.md"), "utf8")).toContain("global");
    expect(readFileSync(join(projectA, ".rulesync/rules/only-global.md"), "utf8")).toContain(
      "global-only",
    );
    expect(readFileSync(join(projectA, ".rulesync/rules/base.md"), "utf8")).toContain("company");
    expect(readFileSync(join(projectA, ".rulesync/rules/personal.md"), "utf8")).toContain("user-a");
  });
});
