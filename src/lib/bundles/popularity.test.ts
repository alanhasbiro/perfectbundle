import { describe, it, expect } from "vitest";
import { popularityScore } from "./popularity";

describe("popularityScore", () => {
  it("weights clicks highest, then saves/shares, then views", () => {
    expect(popularityScore({ linkClicks: 0, saves: 0, shares: 0, views: 0 })).toBe(0);
    expect(popularityScore({ linkClicks: 1, saves: 0, shares: 0, views: 0 })).toBe(3);
    expect(popularityScore({ linkClicks: 0, saves: 1, shares: 0, views: 0 })).toBe(2);
    expect(popularityScore({ linkClicks: 0, saves: 0, shares: 1, views: 0 })).toBe(2);
    expect(popularityScore({ linkClicks: 0, saves: 0, shares: 0, views: 1 })).toBe(1);
  });

  it("sums all weighted terms", () => {
    expect(popularityScore({ linkClicks: 2, saves: 1, shares: 3, views: 4 })).toBe(
      3 * 2 + 2 * 1 + 2 * 3 + 4
    );
  });

  it("accepts objects carrying extra fields (a full counter doc)", () => {
    const doc = {
      bundleId: "abc",
      kind: "generated" as const,
      linkClicks: 1,
      saves: 1,
      shares: 1,
      views: 1,
    };
    expect(popularityScore(doc)).toBe(3 + 2 + 2 + 1);
  });
});
