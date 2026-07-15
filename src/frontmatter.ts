import matter from "gray-matter";

const OMIT_KEYS = new Set(["omit", "reason"]);

export interface FrontmatterResult {
  data: Record<string, unknown>;
  content: string;
  omit: boolean;
  reason?: string;
  /** Full file text; omit/reason stripped from frontmatter only when those keys were present. */
  stripped: string;
}

export function parseFrontmatter(raw: string): FrontmatterResult {
  const parsed = matter(raw);
  const data = (parsed.data ?? {}) as Record<string, unknown>;
  const omit = data.omit === true;
  const reason =
    typeof data.reason === "string" && data.reason.length > 0 ? data.reason : undefined;

  const needsStrip = Object.keys(data).some((key) => OMIT_KEYS.has(key));

  const cleanData: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (!OMIT_KEYS.has(key)) {
      cleanData[key] = value;
    }
  }

  let stripped: string;
  if (!needsStrip) {
    // Nothing to remove — keep original YAML formatting (flow lists, quotes, etc.)
    stripped = raw;
  } else if (Object.keys(cleanData).length === 0) {
    // No remaining frontmatter fields — emit body only (trim leading blank lines)
    stripped = parsed.content.replace(/^\n+/, "");
  } else {
    stripped = matter.stringify(parsed.content.replace(/^\n/, ""), cleanData);
  }

  return {
    data,
    content: parsed.content,
    omit,
    reason,
    stripped,
  };
}

export function isMarkdownPath(path: string): boolean {
  return path.endsWith(".md") || path.endsWith(".mdx");
}
