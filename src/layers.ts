import { existsSync, readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, isAbsolute, join, relative } from "node:path";
import { layerDirName, type LayerSource } from "./config.js";

function packageNameSegments(packageName: string): string[] {
  return packageName.split("/");
}

function realpath(path: string): string {
  return realpathSync(path);
}

/** Resolve an installed npm package directory by walking node_modules and require.resolve. */
export function resolvePackageDir(cwd: string, packageName: string): string {
  const require = createRequire(join(cwd, "package.json"));
  try {
    return realpath(dirname(require.resolve(`${packageName}/package.json`)));
  } catch {
    // exports maps often omit package.json — fall through to filesystem walk
  }

  let dir = cwd;
  for (;;) {
    const candidate = join(dir, "node_modules", ...packageNameSegments(packageName));
    if (existsSync(join(candidate, "package.json"))) {
      return realpath(candidate);
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  throw new Error(
    `Could not resolve layer package "${packageName}" from ${cwd}. Install it as a dependency first.`,
  );
}

function packageDeclaredRoot(pkgRoot: string): string {
  const pkgPath = join(pkgRoot, "package.json");
  if (!existsSync(pkgPath)) return ".";
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
    rulelayers?: string | { root?: string };
  };
  if (typeof pkg.rulelayers === "string" && pkg.rulelayers.length > 0) {
    return pkg.rulelayers;
  }
  if (
    pkg.rulelayers &&
    typeof pkg.rulelayers === "object" &&
    typeof pkg.rulelayers.root === "string" &&
    pkg.rulelayers.root.length > 0
  ) {
    return pkg.rulelayers.root;
  }
  return ".";
}

function assertInsidePackage(pkgRoot: string, root: string, packageName: string): void {
  const rel = relative(pkgRoot, root);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error(`Layer path for package "${packageName}" escapes the package root`);
  }
}

/**
 * Absolute filesystem root for a layer:
 * - local: `<cwd>/.rulesync.<name>/`
 * - path: directory relative to cwd (or absolute)
 * - package: installed package dir (+ optional path / package.json `rulelayers` root)
 */
export function resolveLayerRoot(cwd: string, layer: LayerSource): string {
  if (!layer.package) {
    if (layer.path) {
      const root = isAbsolute(layer.path) ? layer.path : join(cwd, layer.path);
      if (!existsSync(root)) {
        throw new Error(
          `Layer "${layer.name}" path not found at ${root} (config path: ${layer.path})`,
        );
      }
      return realpath(root);
    }
    return join(cwd, layerDirName(layer.name));
  }

  const pkgRoot = resolvePackageDir(cwd, layer.package);
  const subpath = layer.path ?? packageDeclaredRoot(pkgRoot);
  const root = join(pkgRoot, subpath);
  assertInsidePackage(pkgRoot, root, layer.package);

  if (!existsSync(root)) {
    throw new Error(
      `Layer package "${layer.package}" root not found at ${root}` +
        (layer.path ? ` (config path: ${layer.path})` : ""),
    );
  }

  const resolved = realpath(root);
  assertInsidePackage(pkgRoot, resolved, layer.package);
  return resolved;
}

export function formatLayerLabel(layer: LayerSource): string {
  if (layer.package) {
    const pathSuffix = layer.path ? `:${layer.path}` : "";
    return `${layer.name} (${layer.package}${pathSuffix})`;
  }
  if (layer.path) {
    return `${layer.name} (${layer.path})`;
  }
  return layer.name;
}
