import { existsSync, mkdirSync, writeFileSync, appendFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  CONFIG_FILENAME,
  DEFAULT_CONFIG,
  formatConfig,
  layerDirName,
  MERGED_DIR,
  type RulelayersConfig,
} from "./config.js";

const SAMPLE_COMPANY_RULE = `---
root: true
targets: ["*"]
description: Company-wide AI coding standards
---

# Company standards

These rules apply across all projects. Project and user layers can override or extend them.
`;

const SAMPLE_PROJECT_RULE = `---
targets: ["*"]
description: Project-specific conventions
---

# Project conventions

Add project-only guidance here, or create a file with the same relative path as a company rule to override it.
`;

const GITIGNORE_ENTRIES = [MERGED_DIR + "/", ".rulesync.user/"];

export interface InitOptions {
  cwd: string;
  layers?: string[];
  force?: boolean;
}

export interface InitResult {
  created: string[];
  skipped: string[];
}

function writeIfMissing(
  path: string,
  content: string,
  force: boolean,
  created: string[],
  skipped: string[],
): void {
  if (existsSync(path) && !force) {
    skipped.push(path);
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
  created.push(path);
}

export function scaffold(options: InitOptions): InitResult {
  const { cwd, force = false } = options;
  const layerNames = options.layers ?? DEFAULT_CONFIG.layers.map((l) => l.name);
  const created: string[] = [];
  const skipped: string[] = [];

  const config: RulelayersConfig = {
    ...DEFAULT_CONFIG,
    layers: layerNames.map((name) => ({ name })),
  };

  const configPath = join(cwd, CONFIG_FILENAME);
  writeIfMissing(configPath, formatConfig(config), force, created, skipped);

  for (const layer of layerNames) {
    const root = join(cwd, layerDirName(layer));
    mkdirSync(join(root, "rules"), { recursive: true });
    mkdirSync(join(root, "commands"), { recursive: true });
    mkdirSync(join(root, "subagents"), { recursive: true });
    mkdirSync(join(root, "skills"), { recursive: true });

    if (layer === layerNames[0]) {
      // First (lowest) layer gets the company-style sample
      writeIfMissing(
        join(root, "rules", "overview.md"),
        SAMPLE_COMPANY_RULE,
        force,
        created,
        skipped,
      );
      writeIfMissing(
        join(root, "mcp.json"),
        `${JSON.stringify({ mcpServers: {} }, null, 2)}\n`,
        force,
        created,
        skipped,
      );
      writeIfMissing(
        join(root, ".aiignore"),
        "# company ignore patterns\n",
        force,
        created,
        skipped,
      );
    } else if (layer === layerNames[1] || (layerNames.length === 1 && layer === layerNames[0])) {
      // Second layer gets a project sample when present
      if (layerNames.length > 1) {
        writeIfMissing(
          join(root, "rules", "project.md"),
          SAMPLE_PROJECT_RULE,
          force,
          created,
          skipped,
        );
      }
    }
    // Higher layers (user, etc.) stay empty dirs — just ensure .gitkeep
    writeIfMissing(join(root, "rules", ".gitkeep"), "", force, created, skipped);
  }

  // Ensure gitkeep only didn't collide; remove redundant gitkeep on company if overview exists
  // (harmless either way)

  ensureGitignore(cwd, created, skipped);

  return { created, skipped };
}

function ensureGitignore(cwd: string, created: string[], skipped: string[]): void {
  const path = join(cwd, ".gitignore");
  let existing = "";
  if (existsSync(path)) {
    existing = readFileSync(path, "utf8");
  }

  const toAdd = GITIGNORE_ENTRIES.filter(
    (entry) =>
      !existing
        .split(/\r?\n/)
        .map((l) => l.trim())
        .includes(entry.replace(/\/$/, "")) &&
      !existing
        .split(/\r?\n/)
        .map((l) => l.trim())
        .includes(entry),
  );

  if (toAdd.length === 0) {
    skipped.push(path);
    return;
  }

  const block = `\n# rulelayers\n${toAdd.join("\n")}\n`;
  if (existsSync(path)) {
    appendFileSync(path, block, "utf8");
  } else {
    writeFileSync(path, `# rulelayers\n${toAdd.join("\n")}\n`, "utf8");
  }
  created.push(path);
}
