import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parse as parseJsonc, type ParseError } from "jsonc-parser";

export const CONFIG_FILENAME = "rulelayers.jsonc";
export const DEFAULT_LAYERS = ["company", "project", "user"] as const;
export const MERGED_DIR = ".rulesync";

export interface RulesyncConfig {
  command: string;
  args: string[];
}

/** A merge layer: local `.rulesync.<name>/` and/or an npm package tree. */
export interface LayerSource {
  name: string;
  /** npm package name (e.g. `@acme/ai-rules`). When set, layer files are read from the package. */
  package?: string;
  /** Subpath inside the package (overrides package.json `rulelayers` root). */
  path?: string;
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

function defaultNameFromPackage(packageName: string): string {
  const base = packageName.includes("/") ? packageName.split("/").pop()! : packageName;
  return base.replace(/^@/, "");
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
      `${CONFIG_FILENAME}: each layer must be a string or { name?, package?, path? } object`,
    );
  }

  const o = raw as Record<string, unknown>;
  const pkg = typeof o.package === "string" && o.package.length > 0 ? o.package : undefined;
  const path = typeof o.path === "string" && o.path.length > 0 ? o.path : undefined;
  let name = typeof o.name === "string" && o.name.length > 0 ? o.name : undefined;

  if (path && !pkg) {
    throw new Error(`${CONFIG_FILENAME}: layer "path" requires "package"`);
  }

  if (!name && pkg) {
    name = defaultNameFromPackage(pkg);
  }

  if (!name) {
    throw new Error(`${CONFIG_FILENAME}: layer needs "name" or "package"`);
  }

  const layer: LayerSource = { name };
  if (pkg) layer.package = pkg;
  if (path) layer.path = path;
  return layer;
}

function serializeLayer(layer: LayerSource): string | Record<string, string> {
  if (!layer.package && !layer.path) {
    return layer.name;
  }
  const out: Record<string, string> = { name: layer.name };
  if (layer.package) out.package = layer.package;
  if (layer.path) out.path = layer.path;
  return out;
}

export function loadConfig(cwd: string): RulelayersConfig {
  const path = join(cwd, CONFIG_FILENAME);
  if (!existsSync(path)) {
    throw new Error(`Missing ${CONFIG_FILENAME} in ${cwd}. Run \`rulelayers init\` first.`);
  }

  const text = readFileSync(path, "utf8");
  const errors: ParseError[] = [];
  const raw = parseJsonc(text, errors, {
    allowTrailingComma: true,
  }) as Record<string, unknown> | undefined;

  if (errors.length > 0 || raw === undefined || raw === null || typeof raw !== "object") {
    throw new Error(`Failed to parse ${CONFIG_FILENAME}: invalid JSONC`);
  }

  const layersRaw = raw.layers;
  if (!Array.isArray(layersRaw) || layersRaw.length === 0) {
    throw new Error(`${CONFIG_FILENAME}: "layers" must be a non-empty array`);
  }

  const layers = layersRaw.map((entry) => normalizeLayer(entry));

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
