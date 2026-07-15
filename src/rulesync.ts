import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { RulesyncConfig } from "./config.js";

export interface RunRulesyncOptions {
  cwd: string;
  rulesync: RulesyncConfig;
  verbose?: boolean;
  log?: (message: string) => void;
}

export function resolveRulesyncBinary(cwd: string, command: string): string {
  if (command.includes("/") || command.includes("\\")) {
    return command;
  }
  if (command === "rulesync") {
    const localUnix = join(cwd, "node_modules", ".bin", "rulesync");
    const localWin = join(cwd, "node_modules", ".bin", "rulesync.cmd");
    if (process.platform === "win32" && existsSync(localWin)) {
      return localWin;
    }
    if (existsSync(localUnix)) {
      return localUnix;
    }
  }
  return command;
}

export async function runRulesync(options: RunRulesyncOptions): Promise<number> {
  const { cwd, rulesync, verbose = false } = options;
  const log = options.log ?? ((m: string) => console.log(m));

  const bin = resolveRulesyncBinary(cwd, rulesync.command);
  const args = rulesync.args;

  if (verbose) {
    log(`running: ${bin} ${args.join(" ")}`);
  }

  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      cwd,
      stdio: "inherit",
      shell: process.platform === "win32",
      env: process.env,
    });

    child.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "ENOENT") {
        reject(
          new Error(
            `Could not find \`${rulesync.command}\`. Install it with \`npm install -D rulesync\` or \`npm install -g rulesync\`, then retry.`,
          ),
        );
        return;
      }
      reject(err);
    });

    child.on("close", (code) => {
      resolve(code ?? 1);
    });
  });
}
