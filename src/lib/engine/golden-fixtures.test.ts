import { describe, it, expect } from "vitest";
import { parseBundleResponse } from "./parse-response";

function bundle(theme: string, estTotal: string, items: number, tags: string[][]) {
  return {
    theme,
    rationale: `A bundle themed around ${theme}.`,
    estTotal,
    items: Array.from({ length: items }, (_, i) => ({
      name: `Item ${i + 1}`,
      description: "A nice item.",
      why: "It fits the theme.",
      estPriceRange: "$10-15",
      searchQuery: `item ${i + 1} search query`,
      tags: tags[i] ?? ["misc"],
    })),
  };
}

describe("golden fixture: within-budget response is accepted", () => {
  it("accepts a well-formed $50-budget response with 3 in-range bundles", () => {
    const raw = JSON.stringify([
      bundle("Coffee Lover", "$45-55", 3, [["coffee"], ["coffee"], ["kitchen"]]),
      bundle("Cozy Reader", "$40-50", 4, [["reading"], ["cozy"], ["tea"], ["cozy"]]),
      bundle("Desk Upgrade", "$35-48", 3, [["office"], ["office"], ["gadgets"]]),
    ]);
    const result = parseBundleResponse(raw);
    expect(result.ok).toBe(true);
  });
});

describe("golden fixture: exclusions are a prompt-layer contract, not a schema field", () => {
  // The schema has no "excludedItem" flag — exclusion compliance is enforced by the
  // prompt (see prompt.test.ts) and is not independently verifiable from the response
  // shape alone. This test documents that a response is structurally valid regardless
  // of content, which is why prompt correctness is the real guarantee.
  it("a structurally valid response parses even though we cannot detect excluded words here", () => {
    const raw = JSON.stringify([
      bundle("Candle Lovers", "$30-40", 3, [["candles"], ["candles"], ["candles"]]),
      bundle("Reader", "$30-40", 3, [["reading"], ["reading"], ["reading"]]),
      bundle("Chef", "$30-40", 3, [["cooking"], ["cooking"], ["cooking"]]),
    ]);
    expect(parseBundleResponse(raw).ok).toBe(true);
  });
});

describe("golden fixture: malformed model output is rejected, never throws", () => {
  it("rejects a response with only 2 bundles instead of 3", () => {
    const raw = JSON.stringify([
      bundle("A", "$10-20", 3, [[], [], []]),
      bundle("B", "$10-20", 3, [[], [], []]),
    ]);
    expect(parseBundleResponse(raw).ok).toBe(false);
  });

  it("rejects a bundle with 8 items (over the 3-6 cap)", () => {
    const raw = JSON.stringify([
      bundle("Too Many", "$10-20", 8, Array(8).fill([])),
      bundle("B", "$10-20", 3, [[], [], []]),
      bundle("C", "$10-20", 3, [[], [], []]),
    ]);
    expect(parseBundleResponse(raw).ok).toBe(false);
  });

  it("rejects truncated/invalid JSON without throwing", () => {
    expect(() => parseBundleResponse('[{"theme": "Cut off mid')).not.toThrow();
    expect(parseBundleResponse('[{"theme": "Cut off mid').ok).toBe(false);
  });

  it("rejects an item missing a required field (searchQuery)", () => {
    const b = bundle("A", "$10-20", 3, [[], [], []]);
    // @ts-expect-error deliberately corrupting a fixture item for the malformed-input test
    delete b.items[0].searchQuery;
    const raw = JSON.stringify([
      b,
      bundle("B", "$10-20", 3, [[], [], []]),
      bundle("C", "$10-20", 3, [[], [], []]),
    ]);
    expect(parseBundleResponse(raw).ok).toBe(false);
  });
});
