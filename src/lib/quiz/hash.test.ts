import { describe, it, expect } from "vitest";
import { hashQuizAnswers } from "./hash";
import type { QuizAnswers } from "./types";

const base: QuizAnswers = {
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

describe("hashQuizAnswers", () => {
  it("is deterministic for identical input", () => {
    expect(hashQuizAnswers(base)).toBe(hashQuizAnswers({ ...base }));
  });

  it("is order-independent for interests and exclusions arrays", () => {
    const reordered: QuizAnswers = {
      ...base,
      interests: ["Reading", "Coffee & tea"],
      exclusions: ["candles"],
    };
    expect(hashQuizAnswers(base)).toBe(hashQuizAnswers(reordered));
  });

  it("changes when budget changes", () => {
    expect(hashQuizAnswers(base)).not.toBe(hashQuizAnswers({ ...base, budget: 100 }));
  });

  it("changes when occasion changes", () => {
    expect(hashQuizAnswers(base)).not.toBe(hashQuizAnswers({ ...base, occasion: "Christmas" }));
  });

  it("produces a non-empty string of reasonable length", () => {
    const h = hashQuizAnswers(base);
    expect(typeof h).toBe("string");
    expect(h.length).toBeGreaterThanOrEqual(8);
  });
});
