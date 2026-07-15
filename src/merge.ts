import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import type { RulelayersConfig } from "./config.js";
import { MERGED_DIR } from "./config.js";
import { isMarkdownPath, parseFrontmatter } from "./frontmatter.js";
import { formatLayerLabel, resolveLayerRoot } from "./layers.js";

const PATH_FEATURES = ["rules", "commands", "subagents"] as const;
const JSON_FILES = ["mcp.json", ".mcp.json", "hooks.json", "permissions.json"] as const;
const IGNORE_FILES = [".aiignore", ".rulesyncignore"] as const;

interface OmitEvent {
  path: string;
  layer: string;
  reason?: string;
}

export interface MergeResult {
  omitted: OmitEvent[];
  written: string[];
  skippedLayers: string[];
}

export interface MergeOptions {
  cwd: string;
  config: RulelayersConfig;
  dryRun?: boolean;
  verbose?: boolean;
  log?: (message: string) => void;
}

function walkFiles(root: string, base = root): string[] {
  if (!existsSync(root)) return [];
  const results: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.name === ".DS_Store" || entry.name === ".gitkeep") continue;
    const abs = join(root, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkFiles(abs, base));
    } else if (entry.isFile()) {
      results.push(relative(base, abs).split(sep).join("/"));
    }
  }
  return results;
}

function ensureParent(filePath: string): void {
  mkdirSync(dirname(filePath), { recursive: true });
}

function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...target };
  for (const [key, value] of Object.entries(source)) {
    if (
      value !== undefined &&
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      out[key] !== undefined &&
      out[key] !== null &&
      typeof out[key] === "object" &&
      !Array.isArray(out[key])
    ) {
      out[key] = deepMerge(out[key] as Record<string, unknown>, value as Record<string, unknown>);
    } else {
      out[key] = value;
    }
  }
  return out;
}

function mergeIgnoreLines(...chunks: string[]): string {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const chunk of chunks) {
    for (const line of chunk.split(/\r?\n/)) {
      const trimmed = line.trimEnd();
      if (trimmed === "") continue;
      if (!seen.has(trimmed)) {
        seen.add(trimmed);
        lines.push(trimmed);
      }
    }
  }
  return lines.length > 0 ? `${lines.join("\n")}\n` : "";
}

function readJsonObject(path: string): Record<string, unknown> {
  const text = readFileSync(path, "utf8");
  const parsed = JSON.parse(text) as unknown;
  if (
    parsed === undefined ||
    parsed === null ||
    typeof parsed !== "object" ||
    Array.isArray(parsed)
  ) {
    throw new Error(`Expected JSON object in ${path}`);
  }
  return parsed as Record<string, unknown>;
}

export function mergeLayers(options: MergeOptions): MergeResult {
  const { cwd, config, dryRun = false, verbose = false } = options;
  const log = options.log ?? ((m: string) => console.log(m));

  const omitted: OmitEvent[] = [];
  const written: string[] = [];
  const skippedLayers: string[] = [];

  const layerRoots = config.layers.map((layer) => {
    if (layer.package) {
      return {
        name: layer.name,
        root: resolveLayerRoot(cwd, layer),
        label: formatLayerLabel(layer),
        fromPackage: true as const,
      };
    }
    return {
      name: layer.name,
      root: resolveLayerRoot(cwd, layer),
      label: formatLayerLabel(layer),
      fromPackage: false as const,
    };
  });

  for (const layer of layerRoots) {
    if (!existsSync(layer.root)) {
      // Local layers may be absent (e.g. user). Package layers are validated in resolveLayerRoot.
      skippedLayers.push(layer.name);
      if (verbose) {
        log(`skip missing layer directory: .rulesync.${layer.name}`);
      }
    } else if (verbose && layer.fromPackage) {
      log(`layer ${layer.label} → ${layer.root}`);
    }
  }

  const outRoot = join(cwd, MERGED_DIR);
  if (!dryRun) {
    if (existsSync(outRoot)) {
      rmSync(outRoot, { recursive: true, force: true });
    }
    mkdirSync(outRoot, { recursive: true });
  }

  // --- Path features: rules, commands, subagents ---
  type PathWinner = {
    layer: string;
    absPath: string;
    omit: boolean;
    reason?: string;
    content: string;
  };

  for (const feature of PATH_FEATURES) {
    const winners = new Map<string, PathWinner>();

    for (const layer of layerRoots) {
      if (!existsSync(layer.root)) continue;
      const featureRoot = join(layer.root, feature);
      if (!existsSync(featureRoot)) continue;

      for (const rel of walkFiles(featureRoot)) {
        const abs = join(featureRoot, rel);
        const outRel = `${feature}/${rel}`;
        const raw = readFileSync(abs);

        if (isMarkdownPath(rel)) {
          const fm = parseFrontmatter(raw.toString("utf8"));
          winners.set(outRel, {
            layer: layer.name,
            absPath: abs,
            omit: fm.omit,
            reason: fm.reason,
            content: fm.omit ? "" : fm.stripped,
          });
        } else {
          winners.set(outRel, {
            layer: layer.name,
            absPath: abs,
            omit: false,
            content: raw.toString("utf8"),
          });
        }
      }
    }

    for (const [outRel, winner] of winners) {
      if (winner.omit) {
        omitted.push({
          path: outRel,
          layer: winner.layer,
          reason: winner.reason,
        });
        if (verbose) {
          const reasonSuffix = winner.reason ? `: ${winner.reason}` : "";
          log(`omit ${outRel} (${winner.layer})${reasonSuffix}`);
        }
        continue;
      }
      const dest = join(outRoot, outRel);
      written.push(outRel);
      if (!dryRun) {
        ensureParent(dest);
        writeFileSync(dest, winner.content, "utf8");
      }
    }
  }

  // --- Skills: per-skill directory replace ---
  type SkillWinner = {
    layer: string;
    absDir: string;
    omit: boolean;
    reason?: string;
  };
  const skills = new Map<string, SkillWinner>();

  for (const layer of layerRoots) {
    if (!existsSync(layer.root)) continue;
    const skillsRoot = join(layer.root, "skills");
    if (!existsSync(skillsRoot)) continue;

    for (const entry of readdirSync(skillsRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const skillName = entry.name;
      const absDir = join(skillsRoot, skillName);
      const skillMd = join(absDir, "SKILL.md");

      let omit = false;
      let reason: string | undefined;
      if (existsSync(skillMd)) {
        const fm = parseFrontmatter(readFileSync(skillMd, "utf8"));
        omit = fm.omit;
        reason = fm.reason;
      }

      skills.set(skillName, { layer: layer.name, absDir, omit, reason });
    }
  }

  for (const [skillName, winner] of skills) {
    const outRel = `skills/${skillName}`;
    if (winner.omit) {
      omitted.push({ path: outRel, layer: winner.layer, reason: winner.reason });
      if (verbose) {
        const reasonSuffix = winner.reason ? `: ${winner.reason}` : "";
        log(`omit ${outRel} (${winner.layer})${reasonSuffix}`);
      }
      continue;
    }

    written.push(outRel);
    if (!dryRun) {
      const dest = join(outRoot, "skills", skillName);
      cpSync(winner.absDir, dest, { recursive: true });

      // Strip omit/reason from SKILL.md if they somehow weren't omit:true
      const skillMdDest = join(dest, "SKILL.md");
      if (existsSync(skillMdDest)) {
        const fm = parseFrontmatter(readFileSync(skillMdDest, "utf8"));
        writeFileSync(skillMdDest, fm.stripped, "utf8");
      }
    }
  }

  // --- JSON files ---
  // Prefer mcp.json over .mcp.json when both appear after merge
  const jsonAccum: Record<string, Record<string, unknown>> = {};

  for (const layer of layerRoots) {
    if (!existsSync(layer.root)) continue;
    for (const name of JSON_FILES) {
      const abs = join(layer.root, name);
      if (!existsSync(abs) || !statSync(abs).isFile()) continue;
      const current = jsonAccum[name] ?? {};
      jsonAccum[name] = deepMerge(current, readJsonObject(abs));
    }
  }

  // Collapse legacy .mcp.json into mcp.json if both exist
  if (jsonAccum["mcp.json"] && jsonAccum[".mcp.json"]) {
    jsonAccum["mcp.json"] = deepMerge(jsonAccum[".mcp.json"], jsonAccum["mcp.json"]);
    delete jsonAccum[".mcp.json"];
  } else if (jsonAccum[".mcp.json"] && !jsonAccum["mcp.json"]) {
    jsonAccum["mcp.json"] = jsonAccum[".mcp.json"];
    delete jsonAccum[".mcp.json"];
  }

  for (const [name, obj] of Object.entries(jsonAccum)) {
    const outRel = name;
    written.push(outRel);
    if (!dryRun) {
      const dest = join(outRoot, outRel);
      ensureParent(dest);
      writeFileSync(dest, `${JSON.stringify(obj, null, 2)}\n`, "utf8");
    }
  }

  // --- Ignore files ---
  for (const name of IGNORE_FILES) {
    const parts: string[] = [];
    for (const layer of layerRoots) {
      if (!existsSync(layer.root)) continue;
      const abs = join(layer.root, name);
      if (existsSync(abs) && statSync(abs).isFile()) {
        parts.push(readFileSync(abs, "utf8"));
      }
    }
    if (parts.length === 0) continue;
    const merged = mergeIgnoreLines(...parts);
    written.push(name);
    if (!dryRun) {
      writeFileSync(join(outRoot, name), merged, "utf8");
    }
  }

  // Copy any other top-level files from highest layer that aren't handled?
  // v1: only the documented features — skip unknown extras to stay predictable.

  if (verbose && !dryRun) {
    log(`wrote ${written.length} path(s) to ${MERGED_DIR}/`);
  }

  return { omitted, written, skippedLayers };
}

/** Exported for tests */
export const __test = {
  deepMerge,
  mergeIgnoreLines,
  walkFiles,
};
