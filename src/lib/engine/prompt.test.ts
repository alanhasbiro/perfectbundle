import { describe, it, expect } from "vitest";
import { buildBundlePrompt, buildItemSwapPrompt, buildBundleRegeneratePrompt } from "./prompt";
import type { QuizAnswers } from "../quiz/types";

const answers: QuizAnswers = {
  occasion: "Birthday",
  ageBand: "18-24",
  relationship: "Friend",
  interests: ["Coffee & tea", "Reading"],
  budget: 50,
  currency: "GBP",
  urgency: "normal",
  exclusions: ["candles"],
  country: "GB",
};

describe("buildBundlePrompt", () => {
  it("includes every quiz answer field", () => {
    const p = buildBundlePrompt(answers);
    expect(p).toContain("Birthday");
    expect(p).toContain("18-24");
    expect(p).toContain("Friend");
    expect(p).toContain("Coffee & tea");
    expect(p).toContain("Reading");
    expect(p).toContain("50");
    expect(p).toContain("GBP");
    expect(p).toContain("candles");
  });

  it("instructs exactly 3 bundles and 3-6 items each", () => {
    const p = buildBundlePrompt(answers);
    expect(p).toMatch(/exactly 3/i);
    expect(p).toMatch(/3.{0,10}6 items|between 3 and 6/i);
  });

  it("instructs price ranges only, never a live/exact price claim", () => {
    const p = buildBundlePrompt(answers);
    expect(p).toMatch(/estimate/i);
    expect(p.toLowerCase()).toContain("range");
  });

  it("instructs respecting exclusions and budget", () => {
    const p = buildBundlePrompt(answers);
    expect(p).toMatch(/exclu/i);
    expect(p).toMatch(/budget/i);
  });

  it("includes an age-appropriateness safety rule", () => {
    const p = buildBundlePrompt(answers);
    expect(p).toMatch(/age-appropriate|alcohol|legal drinking age/i);
  });

  it("mentions the required JSON field names so the model targets the schema", () => {
    const p = buildBundlePrompt(answers);
    for (const field of [
      "theme",
      "rationale",
      "estTotal",
      "items",
      "name",
      "description",
      "why",
      "estPriceRange",
      "searchQuery",
      "tags",
    ]) {
      expect(p).toContain(field);
    }
  });

  it("omits the gender line when gender is not provided", () => {
    const p = buildBundlePrompt(answers);
    expect(p.toLowerCase()).not.toContain("gender:");
  });

  it("includes gender when provided", () => {
    const p = buildBundlePrompt({ ...answers, gender: "Female" });
    expect(p).toContain("Female");
  });

  it("includes free text when provided", () => {
    const p = buildBundlePrompt({ ...answers, freeText: "obsessed with houseplants" });
    expect(p).toContain("obsessed with houseplants");
  });

  it("omits any past-items instruction when none are given", () => {
    const p = buildBundlePrompt(answers);
    expect(p.toLowerCase()).not.toContain("previously suggested");
  });

  it("instructs avoiding previously suggested items when given", () => {
    const p = buildBundlePrompt(answers, ["Ceramic mug", "French press"]);
    expect(p).toMatch(/previously suggested/i);
    expect(p).toContain("Ceramic mug");
    expect(p).toContain("French press");
    expect(p).toMatch(/avoid repeating|do not repeat/i);
  });
});

describe("buildItemSwapPrompt", () => {
  it("includes the recipient context, bundle theme, and item to replace", () => {
    const p = buildItemSwapPrompt(answers, "Cozy Coffee Morning", ["Ceramic Mug"], "French Press");
    expect(p).toContain("Birthday");
    expect(p).toContain("Cozy Coffee Morning");
    expect(p).toContain("French Press");
    expect(p).toContain("candles"); // exclusions still apply
    expect(p).toContain("50"); // budget still applies
  });

  it("lists the other items so the replacement doesn't duplicate them", () => {
    const p = buildItemSwapPrompt(answers, "Cozy Coffee Morning", ["Ceramic Mug", "Coffee Beans"], "French Press");
    expect(p).toContain("Ceramic Mug");
    expect(p).toContain("Coffee Beans");
  });

  it("asks for exactly one replacement item, not a full bundle", () => {
    const p = buildItemSwapPrompt(answers, "Cozy Coffee Morning", [], "French Press");
    expect(p).toMatch(/one|single/i);
    expect(p).not.toMatch(/exactly 3/i);
  });

  it("mentions the required JSON field names for a single item object", () => {
    const p = buildItemSwapPrompt(answers, "Cozy Coffee Morning", [], "French Press");
    for (const field of ["name", "description", "why", "estPriceRange", "searchQuery", "tags"]) {
      expect(p).toContain(field);
    }
  });

  it("instructs avoiding past items when provided", () => {
    const p = buildItemSwapPrompt(answers, "Cozy Coffee Morning", [], "French Press", ["Old Mug"]);
    expect(p).toContain("Old Mug");
    expect(p).toMatch(/avoid|previously/i);
  });
});

describe("buildBundleRegeneratePrompt", () => {
  it("includes the recipient context and the current theme to differ from", () => {
    const p = buildBundleRegeneratePrompt(answers, "Cozy Coffee Morning");
    expect(p).toContain("Birthday");
    expect(p).toContain("Cozy Coffee Morning");
    expect(p).toContain("candles");
    expect(p).toContain("50");
  });

  it("asks for exactly one bundle, not three", () => {
    const p = buildBundleRegeneratePrompt(answers, "Cozy Coffee Morning");
    expect(p).toMatch(/one|single/i);
    expect(p).not.toMatch(/exactly 3/i);
  });

  it("mentions the required JSON field names for a single bundle object", () => {
    const p = buildBundleRegeneratePrompt(answers, "Cozy Coffee Morning");
    for (const field of ["theme", "rationale", "estTotal", "items", "name", "description", "why", "estPriceRange", "searchQuery", "tags"]) {
      expect(p).toContain(field);
    }
  });

  it("instructs avoiding past items when provided", () => {
    const p = buildBundleRegeneratePrompt(answers, "Cozy Coffee Morning", ["Old Mug"]);
    expect(p).toContain("Old Mug");
    expect(p).toMatch(/avoid|previously/i);
  });
});
