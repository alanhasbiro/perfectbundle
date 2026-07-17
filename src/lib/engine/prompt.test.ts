import { describe, it, expect } from "vitest";
import { buildBundlePrompt } from "./prompt";
import type { QuizAnswers } from "@/lib/quiz/types";

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
});
