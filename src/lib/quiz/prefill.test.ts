import { describe, it, expect } from "vitest";
import { profileToQuizState } from "./prefill";

describe("profileToQuizState", () => {
  const base = {
    relationship: "Mum",
    ageBand: "55-64",
    interests: ["Cooking", "Gardening"],
  };

  it("seeds recipient fields and starts at the first step", () => {
    const state = profileToQuizState(base, "GB", "GBP");
    expect(state.stepIndex).toBe(0);
    expect(state.answers.relationship).toBe("Mum");
    expect(state.answers.ageBand).toBe("55-64");
    expect(state.answers.interests).toEqual(["Cooking", "Gardening"]);
    expect(state.answers.country).toBe("GB");
    expect(state.answers.currency).toBe("GBP");
  });

  it("leaves per-gift fields blank for the user to fill", () => {
    const state = profileToQuizState(base, "US", "USD");
    expect(state.answers.occasion).toBeUndefined();
    expect(state.answers.budget).toBeUndefined();
    expect(state.answers.urgency).toBe("normal");
    expect(state.answers.exclusions).toEqual([]);
  });

  it("includes optional gender and notes only when present", () => {
    const withOptional = profileToQuizState(
      { ...base, gender: "Female", notes: "loves her allotment" },
      "US",
      "USD"
    );
    expect(withOptional.answers.gender).toBe("Female");
    expect(withOptional.answers.freeText).toBe("loves her allotment");

    const withoutOptional = profileToQuizState(base, "US", "USD");
    expect(withoutOptional.answers.gender).toBeUndefined();
    expect(withoutOptional.answers.freeText).toBeUndefined();
  });

  it("copies the interests array rather than sharing the reference", () => {
    const state = profileToQuizState(base, "US", "USD");
    state.answers.interests.push("Music");
    expect(base.interests).toEqual(["Cooking", "Gardening"]);
  });
});
