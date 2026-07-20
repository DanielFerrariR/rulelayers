import { describe, expect, it } from "vitest";
import { matchSpecialFile, resolvePathSublayer } from "../src/sublayers.js";

const SUBS = ["company", "project", "user"];

describe("resolvePathSublayer", () => {
  it("passes through when no sublayers", () => {
    expect(resolvePathSublayer("unit-testing.project.md", undefined)).toEqual({
      outRel: "unit-testing.project.md",
      rank: 0,
      standalone: false,
    });
  });

  it("treats unmarked file as lowest sublayer", () => {
    expect(resolvePathSublayer("unit-testing.md", SUBS)).toMatchObject({
      outRel: "unit-testing.md",
      rank: 0,
      sublayer: "company",
      standalone: false,
    });
  });

  it("does not treat a stem equal to a sublayer name as that sublayer", () => {
    // project.md is a rule named "project", not the project sublayer suffix
    expect(resolvePathSublayer("project.md", SUBS)).toMatchObject({
      outRel: "project.md",
      rank: 0,
      sublayer: "company",
      standalone: false,
    });
    expect(resolvePathSublayer("project.project.md", SUBS)).toMatchObject({
      outRel: "project.md",
      rank: 1,
      sublayer: "project",
    });
  });

  it("strips known sublayer suffix for replace chain", () => {
    expect(resolvePathSublayer("unit-testing.project.md", SUBS)).toMatchObject({
      outRel: "unit-testing.md",
      rank: 1,
      sublayer: "project",
      standalone: false,
    });
    expect(resolvePathSublayer("unit-testing.user.md", SUBS)).toMatchObject({
      outRel: "unit-testing.md",
      rank: 2,
      sublayer: "user",
    });
    expect(resolvePathSublayer("unit-testing.company.md", SUBS)).toMatchObject({
      outRel: "unit-testing.md",
      rank: 0,
      sublayer: "company",
    });
  });

  it("keeps sublayer suffix for standalone", () => {
    expect(resolvePathSublayer("unit-testing.project.standalone.md", SUBS)).toMatchObject({
      outRel: "unit-testing.project.md",
      rank: 1,
      standalone: true,
      sublayer: "project",
    });
  });

  it("keeps unknown dotted names as-is", () => {
    expect(resolvePathSublayer("unit-testing.extra.md", SUBS)).toEqual({
      outRel: "unit-testing.extra.md",
      rank: 0,
      standalone: false,
    });
  });

  it("preserves directories", () => {
    expect(resolvePathSublayer("nested/unit-testing.project.md", SUBS)).toMatchObject({
      outRel: "nested/unit-testing.md",
      rank: 1,
    });
  });

  it("errors when standalone lacks a sublayer suffix", () => {
    expect(() => resolvePathSublayer("unit-testing.standalone.md", SUBS)).toThrow(
      /standalone requires/,
    );
  });
});

describe("matchSpecialFile", () => {
  it("matches canonical and suffixed JSON/ignore", () => {
    expect(matchSpecialFile("mcp.json", SUBS)?.canonical).toBe("mcp.json");
    expect(matchSpecialFile("mcp.project.json", SUBS)).toMatchObject({
      canonical: "mcp.json",
      rank: 1,
      sublayer: "project",
    });
    expect(matchSpecialFile(".mcp.project.json", SUBS)).toMatchObject({
      canonical: "mcp.json",
      accumKey: "mcp.json",
      rank: 1,
      sublayer: "project",
    });
    expect(matchSpecialFile(".aiignore.user", SUBS)).toMatchObject({
      canonical: ".aiignore",
      rank: 2,
    });
  });

  it("ignores unknown suffixes when sublayers are set", () => {
    expect(matchSpecialFile("mcp.extra.json", SUBS)).toBeUndefined();
  });

  it("does not treat suffixed JSON as special without sublayers", () => {
    expect(matchSpecialFile("mcp.project.json", undefined)).toBeUndefined();
  });

  it("rejects standalone on JSON/ignore", () => {
    expect(() => matchSpecialFile("mcp.project.standalone.json", SUBS)).toThrow(/standalone/);
    expect(() => matchSpecialFile(".aiignore.project.standalone", SUBS)).toThrow(/standalone/);
  });
});
