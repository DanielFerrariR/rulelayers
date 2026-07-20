import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parse as parseJsonc, type ParseError } from "jsonc-parser";

export const CONFIG_FILENAME = "rulelayers.jsonc";
/** Optional local override; when present, fully replaces `rulelayers.jsonc` (no merge). */
export const LOCAL_CONFIG_FILENAME = "rulelayers.local.jsonc";
export const DEFAULT_LAYERS = ["company", "project", "user"] as const;
export const MERGED_DIR = ".rulesync";
export const DEFAULT_STANDALONE_SUFFIX = "standalone";

export interface RulesyncConfig {
  command: string;
  args: string[];
}

/** A merge layer: local `.rulesync.<name>/`, a filesystem path, and/or an npm package tree. */
export interface LayerSource {
  name: string;
  /** npm package name (e.g. `@acme/ai-rules`). When set, layer files are read from the package. */
  package?: string;
  /**
   * Without `package`: directory relative to the project (or absolute) to use as this layer root.
   * With `package`: subpath inside the package (overrides package.json `rulelayers` root).
   */
  path?: string;
  /** Ordered low → high. When set, filenames may use these suffixes within the layer. */
  sublayers?: string[];
  /**
   * Filename marker that keeps a sublayer suffix in the output path
   * (e.g. `unit-testing.project.standalone.md` → `unit-testing.project.md`).
   * Default: `"standalone"`. Only valid when `sublayers` is set.
   */
  standaloneSuffix?: string;
}

export interface RulelayersConfig {
  layers: LayerSource[];
  rulesync: RulesyncConfig;
}

export const DEFAULT_CONFIG: RulelayersConfig = {
  layers: DEFAULT_LAYERS.map((name) => ({ name })),
  rulesync: {
    command: "rulesync",
    args: ["generate", "--targets", "*", "--features", "*"],
  },
};

export function layerDirName(layer: string): string {
  return `${MERGED_DIR}.${layer}`;
}

/** Effective standalone marker for a layer (default when unset). */
export function layerStandaloneSuffix(layer: LayerSource): string {
  return layer.standaloneSuffix ?? DEFAULT_STANDALONE_SUFFIX;
}

function defaultNameFromPackage(packageName: string): string {
  const base = packageName.includes("/") ? packageName.split("/").pop()! : packageName;
  return base.replace(/^@/, "");
}

function normalizeSublayers(raw: unknown, layerLabel: string): string[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error(
      `${CONFIG_FILENAME}: layer "${layerLabel}" "sublayers" must be a non-empty array of strings`,
    );
  }
  const sublayers: string[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (typeof entry !== "string" || entry.length === 0) {
      throw new Error(
        `${CONFIG_FILENAME}: layer "${layerLabel}" each sublayer must be a non-empty string`,
      );
    }
    if (seen.has(entry)) {
      throw new Error(`${CONFIG_FILENAME}: layer "${layerLabel}" duplicate sublayer "${entry}"`);
    }
    seen.add(entry);
    sublayers.push(entry);
  }
  return sublayers;
}

function normalizeStandaloneSuffix(raw: unknown, layerLabel: string): string | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw !== "string" || raw.length === 0) {
    throw new Error(
      `${CONFIG_FILENAME}: layer "${layerLabel}" "standaloneSuffix" must be a non-empty string`,
    );
  }
  if (raw.includes(".") || raw.includes("/") || raw.includes("\\")) {
    throw new Error(
      `${CONFIG_FILENAME}: layer "${layerLabel}" "standaloneSuffix" must be a single path segment without dots or slashes`,
    );
  }
  return raw;
}

export function normalizeLayer(raw: unknown): LayerSource {
  if (typeof raw === "string") {
    if (raw.length === 0) {
      throw new Error(`${CONFIG_FILENAME}: each layer name must be a non-empty string`);
    }
    return { name: raw };
  }

  if (raw === undefined || raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(
      `${CONFIG_FILENAME}: each layer must be a string or { name?, package?, path?, sublayers?, standaloneSuffix? } object`,
    );
  }

  const o = raw as Record<string, unknown>;
  const pkg = typeof o.package === "string" && o.package.length > 0 ? o.package : undefined;
  const path = typeof o.path === "string" && o.path.length > 0 ? o.path : undefined;
  let name = typeof o.name === "string" && o.name.length > 0 ? o.name : undefined;

  if (!name && pkg) {
    name = defaultNameFromPackage(pkg);
  }

  if (!name) {
    throw new Error(`${CONFIG_FILENAME}: layer needs "name" or "package"`);
  }

  const sublayers = normalizeSublayers(o.sublayers, name);
  const standaloneSuffix = normalizeStandaloneSuffix(o.standaloneSuffix, name);

  if (standaloneSuffix !== undefined && !sublayers) {
    throw new Error(`${CONFIG_FILENAME}: layer "${name}" "standaloneSuffix" requires "sublayers"`);
  }

  const layer: LayerSource = { name };
  if (pkg) layer.package = pkg;
  if (path) layer.path = path;
  if (sublayers) layer.sublayers = sublayers;
  if (standaloneSuffix !== undefined) layer.standaloneSuffix = standaloneSuffix;
  return layer;
}

/**
 * Sublayer names must be unique across layers (same suffix on two folders would be confusing).
 * They may reuse a physical layer name — e.g. `sublayers: [..., "user"]` plus a `.rulesync.user/` layer.
 */
function validateLayerSublayerNames(layers: LayerSource[]): void {
  const seenSublayers = new Map<string, string>(); // sublayer → first layer that declared it

  for (const layer of layers) {
    if (!layer.sublayers) continue;

    const suffix = layerStandaloneSuffix(layer);

    for (const sub of layer.sublayers) {
      if (sub === suffix) {
        throw new Error(
          `${CONFIG_FILENAME}: layer "${layer.name}" sublayer "${sub}" collides with standaloneSuffix`,
        );
      }
      const previous = seenSublayers.get(sub);
      if (previous !== undefined) {
        throw new Error(
          `${CONFIG_FILENAME}: sublayer "${sub}" is declared on both layer "${previous}" and layer "${layer.name}" (sublayer names must be globally unique)`,
        );
      }
      seenSublayers.set(sub, layer.name);
    }
  }
}

function serializeLayer(layer: LayerSource): string | Record<string, string | string[]> {
  if (!layer.package && !layer.path && !layer.sublayers && !layer.standaloneSuffix) {
    return layer.name;
  }
  const out: Record<string, string | string[]> = { name: layer.name };
  if (layer.package) out.package = layer.package;
  if (layer.path) out.path = layer.path;
  if (layer.sublayers) out.sublayers = layer.sublayers;
  if (layer.standaloneSuffix) out.standaloneSuffix = layer.standaloneSuffix;
  return out;
}

/** Which config file `loadConfig` will use (local overrides project when both exist). */
export function resolveConfigFilename(cwd: string): string {
  if (existsSync(join(cwd, LOCAL_CONFIG_FILENAME))) {
    return LOCAL_CONFIG_FILENAME;
  }
  return CONFIG_FILENAME;
}

function parseConfigFile(cwd: string, filename: string): RulelayersConfig {
  const path = join(cwd, filename);
  const text = readFileSync(path, "utf8");
  const errors: ParseError[] = [];
  const raw = parseJsonc(text, errors, {
    allowTrailingComma: true,
  }) as Record<string, unknown> | undefined;

  if (errors.length > 0 || raw === undefined || raw === null || typeof raw !== "object") {
    throw new Error(`Failed to parse ${filename}: invalid JSONC`);
  }

  if (raw.standaloneSuffix !== undefined) {
    throw new Error(
      `${filename}: "standaloneSuffix" belongs on a layer object (next to "sublayers"), not at the top level`,
    );
  }

  const layersRaw = raw.layers;
  if (!Array.isArray(layersRaw) || layersRaw.length === 0) {
    throw new Error(`${filename}: "layers" must be a non-empty array`);
  }

  const layers = layersRaw.map((entry) => normalizeLayer(entry));
  validateLayerSublayerNames(layers);

  const rulesyncRaw =
    raw.rulesync && typeof raw.rulesync === "object"
      ? (raw.rulesync as Record<string, unknown>)
      : {};

  const command =
    typeof rulesyncRaw.command === "string" && rulesyncRaw.command.length > 0
      ? rulesyncRaw.command
      : DEFAULT_CONFIG.rulesync.command;

  const args = Array.isArray(rulesyncRaw.args)
    ? rulesyncRaw.args.filter((a): a is string => typeof a === "string")
    : DEFAULT_CONFIG.rulesync.args;

  return {
    layers,
    rulesync: { command, args },
  };
}

export function loadConfig(cwd: string): RulelayersConfig {
  const projectPath = join(cwd, CONFIG_FILENAME);
  if (!existsSync(projectPath)) {
    throw new Error(`Missing ${CONFIG_FILENAME} in ${cwd}. Run \`rulelayers init\` first.`);
  }

  return parseConfigFile(cwd, resolveConfigFilename(cwd));
}

export function formatConfig(config: RulelayersConfig): string {
  return `${JSON.stringify(
    {
      $schema: "https://raw.githubusercontent.com/DanielFerrariR/rulelayers/main/schema.json",
      layers: config.layers.map(serializeLayer),
      rulesync: config.rulesync,
    },
    null,
    2,
  )}\n`;
}
