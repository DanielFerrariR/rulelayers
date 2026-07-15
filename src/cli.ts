#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { generateCommand } from "./commands/generate.js";
import { initCommand } from "./commands/init.js";

function packageVersion(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    // dist/cli.js → ../package.json ; src via tsx → ../package.json
    const candidates = [join(here, "..", "package.json"), join(here, "..", "..", "package.json")];
    for (const p of candidates) {
      try {
        const pkg = JSON.parse(readFileSync(p, "utf8")) as { version?: string };
        if (pkg.version) return pkg.version;
      } catch {
        // try next
      }
    }
  } catch {
    // fall through
  }
  return "0.0.0";
}

const program = new Command();

program
  .name("rulelayers")
  .description("Layer company / project / user rulesync sources, then run rulesync generate")
  .version(packageVersion());

program
  .command("init")
  .description("Create rulelayers.jsonc and .rulesync.{layer} directories")
  .option(
    "--layers <list>",
    "Comma-separated layer names (low→high precedence)",
    "company,project,user",
  )
  .option("-f, --force", "Overwrite existing files", false)
  .action((opts: { layers: string; force: boolean }) => {
    try {
      initCommand({
        cwd: process.cwd(),
        layers: opts.layers,
        force: opts.force,
      });
    } catch (err) {
      console.error(err instanceof Error ? err.message : err);
      process.exitCode = 1;
    }
  });

program
  .command("generate")
  .description("Merge layered sources into .rulesync/, then run rulesync generate")
  .option("--merge-only", "Only write .rulesync/; do not run rulesync", false)
  .option("--dry-run", "Show what would be written without touching disk", false)
  .option("-v, --verbose", "Verbose logging", false)
  .action(async (opts: { mergeOnly: boolean; dryRun: boolean; verbose: boolean }) => {
    try {
      await generateCommand({
        cwd: process.cwd(),
        mergeOnly: opts.mergeOnly,
        dryRun: opts.dryRun,
        verbose: opts.verbose,
      });
    } catch (err) {
      console.error(err instanceof Error ? err.message : err);
      process.exitCode = 1;
    }
  });

program.parse();
