import { DEFAULT_LAYERS } from "../config.js";
import { scaffold } from "../scaffold.js";

export interface InitCommandOptions {
  cwd: string;
  layers?: string;
  force?: boolean;
}

export function initCommand(options: InitCommandOptions): void {
  const layers = options.layers
    ?.split(",")
    .map((s) => s.trim())
    .filter(Boolean) ?? [...DEFAULT_LAYERS];

  if (layers.length === 0) {
    throw new Error("At least one layer name is required");
  }

  const result = scaffold({
    cwd: options.cwd,
    layers,
    force: options.force,
  });

  for (const path of result.created) {
    console.log(`created ${path}`);
  }
  for (const path of result.skipped) {
    console.log(`skipped ${path} (already exists)`);
  }

  console.log(`\nNext steps:`);
  console.log(`  1. Edit .rulesync.<layer>/ files for your layers`);
  console.log(`  2. Run: rulelayers generate`);
}
