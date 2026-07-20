/** Filename sublayer resolution for path features and top-level JSON/ignore files. */

import { DEFAULT_STANDALONE_SUFFIX } from "./config.js";

export interface SublayerResolution {
  /** Resolved output relative path (feature-relative for path features). */
  outRel: string;
  /** Sublayer index (0 = lowest). Unmarked files use 0. */
  rank: number;
  /** True when the standalone suffix was present (path features only). */
  standalone: boolean;
  /** Matched sublayer name, if any (including implied lowest for unmarked). */
  sublayer?: string;
}

function longestTrailingSublayer(stem: string, sublayers: string[]): string | undefined {
  let matched: string | undefined;
  for (const name of sublayers) {
    // Only `.${name}` suffixes count — a file named `project.md` is unmarked, not the project sublayer.
    if (stem.endsWith(`.${name}`)) {
      if (!matched || name.length > matched.length) {
        matched = name;
      }
    }
  }
  return matched;
}

/**
 * Resolve a relative path under rules/commands/subagents against configured sublayers.
 * When `sublayers` is undefined/empty, returns the path unchanged at rank 0.
 */
export function resolvePathSublayer(
  rel: string,
  sublayers: string[] | undefined,
  standaloneSuffix: string = DEFAULT_STANDALONE_SUFFIX,
): SublayerResolution {
  if (!sublayers || sublayers.length === 0) {
    return { outRel: rel, rank: 0, standalone: false };
  }

  const slash = rel.lastIndexOf("/");
  const dir = slash >= 0 ? rel.slice(0, slash + 1) : "";
  const filename = slash >= 0 ? rel.slice(slash + 1) : rel;

  const dot = filename.lastIndexOf(".");
  if (dot <= 0) {
    return {
      outRel: rel,
      rank: 0,
      standalone: false,
      sublayer: sublayers[0],
    };
  }

  const ext = filename.slice(dot);
  let stem = filename.slice(0, dot);

  let standalone = false;
  if (stem.endsWith(`.${standaloneSuffix}`)) {
    standalone = true;
    stem = stem.slice(0, -(standaloneSuffix.length + 1));
  }

  const matched = longestTrailingSublayer(stem, sublayers);

  if (standalone && !matched) {
    throw new Error(
      `${standaloneSuffix} requires a sublayer suffix (one of: ${sublayers.join(", ")}): ${rel}`,
    );
  }

  if (!matched) {
    // Bare name with no dots → unmarked = lowest sublayer
    if (!stem.includes(".")) {
      return {
        outRel: `${dir}${stem}${ext}`,
        rank: 0,
        standalone: false,
        sublayer: sublayers[0],
      };
    }
    // Unknown dotted segments — keep full relative path
    return { outRel: rel, rank: 0, standalone: false };
  }

  const contentBase = stem.slice(0, -(matched.length + 1));
  const rank = sublayers.indexOf(matched);

  if (standalone) {
    return {
      outRel: `${dir}${contentBase}.${matched}${ext}`,
      rank,
      standalone: true,
      sublayer: matched,
    };
  }

  return {
    outRel: `${dir}${contentBase}${ext}`,
    rank,
    standalone: false,
    sublayer: matched,
  };
}

export interface SpecialFileMatch {
  /** Canonical output name (e.g. mcp.json, .aiignore). */
  canonical: string;
  /** Accumulator key before .mcp collapse (mcp.json or .mcp.json). */
  accumKey: string;
  rank: number;
  sublayer?: string;
  filename: string;
}

function looksLikeSpecialWithStandalone(filename: string, standaloneSuffix: string): boolean {
  const prefixes = ["mcp.", ".mcp.", "hooks.", "permissions.", ".aiignore.", ".rulesyncignore."];
  return prefixes.some((p) => filename.startsWith(p) && filename.includes(`.${standaloneSuffix}`));
}

/**
 * If `filename` is a canonical or sublayer-suffixed JSON/ignore file for this layer, return a match.
 * Throws if the standalone suffix is used on these names when sublayers are configured.
 */
export function matchSpecialFile(
  filename: string,
  sublayers: string[] | undefined,
  standaloneSuffix: string = DEFAULT_STANDALONE_SUFFIX,
): SpecialFileMatch | undefined {
  const hasSublayers = Boolean(sublayers && sublayers.length > 0);
  if (hasSublayers && looksLikeSpecialWithStandalone(filename, standaloneSuffix)) {
    throw new Error(
      `.${standaloneSuffix} is not supported for JSON/ignore files: ${filename}`,
    );
  }

  const exact: Array<{ filename: string; canonical: string; accumKey: string }> = [
    { filename: "mcp.json", canonical: "mcp.json", accumKey: "mcp.json" },
    { filename: ".mcp.json", canonical: "mcp.json", accumKey: ".mcp.json" },
    { filename: "hooks.json", canonical: "hooks.json", accumKey: "hooks.json" },
    { filename: "permissions.json", canonical: "permissions.json", accumKey: "permissions.json" },
    { filename: ".aiignore", canonical: ".aiignore", accumKey: ".aiignore" },
    { filename: ".rulesyncignore", canonical: ".rulesyncignore", accumKey: ".rulesyncignore" },
  ];

  for (const e of exact) {
    if (filename === e.filename) {
      return {
        canonical: e.canonical,
        accumKey: e.accumKey,
        rank: 0,
        filename,
        sublayer: sublayers?.[0],
      };
    }
  }

  if (!sublayers || sublayers.length === 0) {
    return undefined;
  }

  for (const name of sublayers) {
    const rank = sublayers.indexOf(name);
    const candidates: Array<{ filename: string; canonical: string; accumKey: string }> = [
      { filename: `mcp.${name}.json`, canonical: "mcp.json", accumKey: "mcp.json" },
      // Legacy dotted name still maps into the canonical mcp.json bucket so sublayer rank merges apply
      { filename: `.mcp.${name}.json`, canonical: "mcp.json", accumKey: "mcp.json" },
      { filename: `hooks.${name}.json`, canonical: "hooks.json", accumKey: "hooks.json" },
      {
        filename: `permissions.${name}.json`,
        canonical: "permissions.json",
        accumKey: "permissions.json",
      },
      { filename: `.aiignore.${name}`, canonical: ".aiignore", accumKey: ".aiignore" },
      {
        filename: `.rulesyncignore.${name}`,
        canonical: ".rulesyncignore",
        accumKey: ".rulesyncignore",
      },
    ];
    for (const c of candidates) {
      if (filename === c.filename) {
        return {
          canonical: c.canonical,
          accumKey: c.accumKey,
          rank,
          sublayer: name,
          filename,
        };
      }
    }
  }

  return undefined;
}

/** Top-level filenames to check in a layer root for JSON/ignore (exact + sublayer variants). */
export function listSpecialCandidateNames(sublayers: string[] | undefined): string[] {
  const names = [
    "mcp.json",
    ".mcp.json",
    "hooks.json",
    "permissions.json",
    ".aiignore",
    ".rulesyncignore",
  ];
  if (!sublayers) return names;
  for (const s of sublayers) {
    names.push(
      `mcp.${s}.json`,
      `.mcp.${s}.json`,
      `hooks.${s}.json`,
      `permissions.${s}.json`,
      `.aiignore.${s}`,
      `.rulesyncignore.${s}`,
    );
  }
  return names;
}
