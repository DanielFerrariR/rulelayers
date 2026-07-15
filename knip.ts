import type { KnipConfig } from "knip";

const config: KnipConfig = {
  entry: ["tests/**/*.test.ts"],
  project: ["src/**/*.ts", "tests/**/*.ts"],
};

export default config;
