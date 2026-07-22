import { describe, it, expect } from "vitest";
import { bundleItemSchema, bundleContentSchema, curatedBundleSchema } from "./schemas";
import { seedCuratedBundles } from "../../../convex/seedData";

const validItem = {
  name: "Ceramic pour-over set",
  description: "A simple one-cup ceramic dripper with matching mug.",
  why: "Slows the morning down — perfect for a coffee-lover who savors ritual.",
  estPriceRange: "$18–25",
  searchQuery: "ceramic pour over coffee dripper set",
  tags: ["coffee", "home"],
};

const validContent = {
  theme: "The Coffee Ritual",
  rationale: "Everything needed for a slow, luxurious coffee morning.",
  estTotal: "$45–60",
  items: [validItem, validItem, validItem],
};

describe("bundleItemSchema", () => {
  it("accepts a valid item", () => {
    expect(bundleItemSchema.safeParse(validItem).success).toBe(true);
  });
  it("rejects an empty searchQuery", () => {
    expect(bundleItemSchema.safeParse({ ...validItem, searchQuery: "" }).success).toBe(false);
  });
});

describe("bundleContentSchema", () => {
  it("accepts 3–6 items", () => {
    expect(bundleContentSchema.safeParse(validContent).success).toBe(true);
  });
  it("rejects fewer than 3 items", () => {
    expect(bundleContentSchema.safeParse({ ...validContent, items: [validItem, validItem] }).success).toBe(false);
  });
  it("rejects more than 6 items", () => {
    expect(bundleContentSchema.safeParse({ ...validContent, items: Array(7).fill(validItem) }).success).toBe(false);
  });
});

describe("seed data", () => {
  it("contains 23 curated bundles, all valid and approved", () => {
    expect(seedCuratedBundles).toHaveLength(23);
    for (const b of seedCuratedBundles) {
      const parsed = curatedBundleSchema.safeParse(b);
      expect(parsed.success, `invalid: ${b.title} ${JSON.stringify(parsed.success ? "" : parsed.error.issues)}`).toBe(true);
      expect(b.approved).toBe(true);
    }
  });

  it("has no duplicate titles — seedAdditionalCurated matches by title to stay idempotent", () => {
    const titles = seedCuratedBundles.map((b) => b.title);
    expect(new Set(titles).size).toBe(titles.length);
  });
});
