import { describe, expect, test } from "vitest";
import { contrastRatio } from "./contrast";

describe("contrastRatio", () => {
  test("white on black is the maximum ratio (21:1)", () => {
    expect(contrastRatio("#FFFFFF", "#000000")).toBeCloseTo(21, 1);
  });

  test("identical colors have a ratio of 1", () => {
    expect(contrastRatio("#FFFBF5", "#FFFBF5")).toBeCloseTo(1, 5);
  });

  test("is symmetric regardless of argument order", () => {
    expect(contrastRatio("#FFFBF5", "#3D2B1F")).toBeCloseTo(
      contrastRatio("#3D2B1F", "#FFFBF5"),
      5
    );
  });
});

describe("PerfectBundle warm palette meets WCAG 4.5:1 for text pairs", () => {
  const AA_TEXT = 4.5;

  const pairs: Array<[label: string, bg: string, fg: string]> = [
    ["light bg / fg", "#FFFBF5", "#3D2B1F"],
    ["light bg-alt / fg", "#FFF1E0", "#3D2B1F"],
    ["light bg / fg-muted", "#FFFBF5", "#7A5C3E"],
    ["light bg-alt / fg-muted", "#FFF1E0", "#7A5C3E"],
    ["light bg / accent-solid", "#FFFBF5", "#C2410C"],
    ["light bg-alt / accent-solid", "#FFF1E0", "#C2410C"],
    ["dark bg / fg", "#1A1210", "#FBE9D8"],
    ["dark bg-alt / fg", "#241813", "#FBE9D8"],
    ["dark bg / fg-muted", "#1A1210", "#C9A47C"],
    ["dark bg-alt / fg-muted", "#241813", "#C9A47C"],
    ["dark bg / accent-solid", "#1A1210", "#FB923C"],
    ["dark bg-alt / accent-solid", "#241813", "#FB923C"],
    ["btn-primary: white text / accent-from", "#FFFFFF", "#C2410C"],
    ["btn-primary: white text / accent-to", "#FFFFFF", "#BE185D"],
  ];

  test.each(pairs)("%s is >= 4.5:1", (_label, bg, fg) => {
    expect(contrastRatio(bg, fg)).toBeGreaterThanOrEqual(AA_TEXT);
  });
});
