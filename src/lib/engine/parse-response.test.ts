import { describe, it, expect } from "vitest";
import { parseBundleResponse } from "./parse-response";

const validItem = {
  name: "Ceramic pour-over set",
  description: "A simple one-cup ceramic dripper.",
  why: "Fits their love of slow coffee mornings.",
  estPriceRange: "$18-25",
  searchQuery: "ceramic pour over coffee dripper",
  tags: ["coffee"],
};

const validBundle = {
  theme: "The Coffee Ritual",
  rationale: "Everything for a slow coffee morning.",
  estTotal: "$45-60",
  items: [validItem, validItem, validItem],
};

const validThree = JSON.stringify([validBundle, validBundle, validBundle]);

describe("parseBundleResponse", () => {
  it("parses a clean JSON array of 3 valid bundles", () => {
    const result = parseBundleResponse(validThree);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.bundles).toHaveLength(3);
  });

  it("strips ```json markdown code fences before parsing", () => {
    const fenced = "```json\n" + validThree + "\n```";
    const result = parseBundleResponse(fenced);
    expect(result.ok).toBe(true);
  });

  it("strips bare ``` fences (no language tag) before parsing", () => {
    const fenced = "```\n" + validThree + "\n```";
    const result = parseBundleResponse(fenced);
    expect(result.ok).toBe(true);
  });

  it("fails gracefully on invalid JSON", () => {
    const result = parseBundleResponse("{not: valid json,,,");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeTruthy();
  });

  it("fails when the array does not have exactly 3 bundles", () => {
    const two = JSON.stringify([validBundle, validBundle]);
    const result = parseBundleResponse(two);
    expect(result.ok).toBe(false);
  });

  it("fails when a bundle is missing required fields", () => {
    const broken = JSON.stringify([{ theme: "X" }, validBundle, validBundle]);
    const result = parseBundleResponse(broken);
    expect(result.ok).toBe(false);
  });

  it("fails when an item count is out of the 3-6 range", () => {
    const tooFew = { ...validBundle, items: [validItem, validItem] };
    const broken = JSON.stringify([tooFew, validBundle, validBundle]);
    const result = parseBundleResponse(broken);
    expect(result.ok).toBe(false);
  });

  it("fails when the top-level value is not an array", () => {
    const result = parseBundleResponse(JSON.stringify(validBundle));
    expect(result.ok).toBe(false);
  });
});
