import { loadConfig, resolveConfigFilename, USER_CONFIG_FILENAME } from "../config.js";
import { formatLayerLabel } from "../layers.js";
import { mergeLayers } from "../merge.js";
import { runRulesync } from "../rulesync.js";

export interface GenerateOptions {
  cwd: string;
  mergeOnly?: boolean;
  dryRun?: boolean;
  verbose?: boolean;
}

export async function generateCommand(options: GenerateOptions): Promise<void> {
  const { cwd, mergeOnly = false, dryRun = false, verbose = false } = options;
  const configFile = resolveConfigFilename(cwd);
  const config = loadConfig(cwd);

  if (verbose) {
    if (configFile === USER_CONFIG_FILENAME) {
      console.log(`config: ${USER_CONFIG_FILENAME} (replaces rulelayers.jsonc)`);
    }
    console.log(`layers (low→high): ${config.layers.map(formatLayerLabel).join(" → ")}`);
  }

  const result = mergeLayers({
    cwd,
    config,
    dryRun,
    verbose,
  });

  if (result.skippedLayers.length > 0 && verbose) {
    console.log(`missing layer dirs (skipped): ${result.skippedLayers.join(", ")}`);
  }

  if (dryRun) {
    console.log(
      `dry-run: would write ${result.written.length} path(s), omit ${result.omitted.length}`,
    );
    for (const w of result.written) {
      console.log(`  + ${w}`);
    }
    for (const o of result.omitted) {
      const reason = o.reason ? `: ${o.reason}` : "";
      console.log(`  - ${o.path} (${o.layer})${reason}`);
    }
    return;
  }

  console.log(
    `Merged into .rulesync/ (${result.written.length} written, ${result.omitted.length} omitted)`,
  );

  if (mergeOnly) {
    if (verbose) {
      console.log("skipping rulesync (--merge-only)");
    }
    return;
  }

  const code = await runRulesync({
    cwd,
    rulesync: config.rulesync,
    verbose,
  });

  if (code !== 0) {
    process.exitCode = code;
    throw new Error(`rulesync exited with code ${code}`);
  }
}
