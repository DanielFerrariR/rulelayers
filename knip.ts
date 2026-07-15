import type { KnipConfig } from "knip";

const config: KnipConfig = {
  entry: ["src/cli.ts", "tests/**/*.test.ts"],
  project: ["src/**/*.ts", "tests/**/*.ts"],
  ignoreDependencies: [
    // Optional peer — invoked at runtime when users run full generate
    "rulesync",
  ],
  ignoreBinaries: ["rulesync"],
};

export default config;
