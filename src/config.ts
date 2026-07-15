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

export interface RulelayersConfig {
  layers: string[];
  rulesync: RulesyncConfig;
}

export const DEFAULT_CONFIG: RulelayersConfig = {
  layers: [...DEFAULT_LAYERS],
  rulesync: {
    command: "rulesync",
    args: ["generate", "--targets", "*", "--features", "*"],
  },
};

export function layerDirName(layer: string): string {
  return `${MERGED_DIR}.${layer}`;
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

  const layers = raw.layers;
  if (!Array.isArray(layers) || layers.length === 0) {
    throw new Error(`${CONFIG_FILENAME}: "layers" must be a non-empty array of strings`);
  }
  if (!layers.every((l) => typeof l === "string" && l.length > 0)) {
    throw new Error(`${CONFIG_FILENAME}: each layer name must be a non-empty string`);
  }

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
    layers: layers as string[],
    rulesync: { command, args },
  };
}

export function formatConfig(config: RulelayersConfig): string {
  return `${JSON.stringify(
    {
      $schema: "./node_modules/rulelayers/schema.json",
      layers: config.layers,
      rulesync: config.rulesync,
    },
    null,
    2,
  )}\n`;
}
