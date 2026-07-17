import { describe, it, expect } from "vitest";
import {
  QUIZ_STEPS,
  emptyQuizState,
  currentStep,
  canAdvance,
  next,
  back,
  setAnswers,
  isComplete,
  toQuizAnswers,
  progress,
} from "./machine";

const start = () => emptyQuizState("GB", "GBP");

// Helper: a state advanced through all steps with valid answers.
const filled = () => {
  let s = start();
  s = setAnswers(s, { occasion: "birthday" });
  s = next(s);
  s = setAnswers(s, { ageBand: "25-34", relationship: "friend" });
  s = next(s);
  s = setAnswers(s, { interests: ["coffee", "reading"] });
  s = next(s);
  s = setAnswers(s, { budget: 50 });
  s = next(s);
  s = setAnswers(s, { urgency: "normal" });
  s = next(s);
  s = setAnswers(s, { exclusions: ["mug"] });
  return s;
};

describe("emptyQuizState", () => {
  it("starts at step 0 with seeded country/currency and empty arrays", () => {
    const s = start();
    expect(s.stepIndex).toBe(0);
    expect(currentStep(s)).toBe("occasion");
    expect(s.answers.country).toBe("GB");
    expect(s.answers.currency).toBe("GBP");
    expect(s.answers.interests).toEqual([]);
    expect(s.answers.exclusions).toEqual([]);
    expect(s.answers.urgency).toBe("normal");
  });
});

describe("step validation (canAdvance)", () => {
  it("occasion step requires occasion", () => {
    const s = start();
    expect(canAdvance(s)).toBe(false);
    expect(canAdvance(setAnswers(s, { occasion: "birthday" }))).toBe(true);
  });

  it("recipient step requires ageBand and relationship, gender optional", () => {
    let s = next(setAnswers(start(), { occasion: "birthday" }));
    expect(currentStep(s)).toBe("recipient");
    expect(canAdvance(s)).toBe(false);
    s = setAnswers(s, { ageBand: "25-34" });
    expect(canAdvance(s)).toBe(false);
    s = setAnswers(s, { relationship: "friend" });
    expect(canAdvance(s)).toBe(true);
  });

  it("interests step requires at least one interest OR free text", () => {
    let s = next(setAnswers(start(), { occasion: "birthday" }));
    s = next(setAnswers(s, { ageBand: "25-34", relationship: "friend" }));
    expect(currentStep(s)).toBe("interests");
    expect(canAdvance(s)).toBe(false);
    expect(canAdvance(setAnswers(s, { interests: ["coffee"] }))).toBe(true);
    expect(canAdvance(setAnswers(s, { freeText: "loves hiking" }))).toBe(true);
  });

  it("budget step requires budget > 0", () => {
    let s = filled();
    // rewind to budget step
    s = back(back(s));
    expect(currentStep(s)).toBe("budget");
    expect(canAdvance(setAnswers(s, { budget: 0 }))).toBe(false);
    expect(canAdvance(setAnswers(s, { budget: 30 }))).toBe(true);
  });

  it("urgency and exclusions steps are always advanceable (defaults ok)", () => {
    let s = filled();
    s = back(s);
    expect(currentStep(s)).toBe("urgency");
    expect(canAdvance(s)).toBe(true);
    s = next(s);
    expect(currentStep(s)).toBe("exclusions");
    expect(canAdvance(s)).toBe(true);
  });
});

describe("navigation", () => {
  it("next() is a no-op when invalid", () => {
    const s = start();
    expect(next(s).stepIndex).toBe(0);
  });

  it("back() preserves answers and is a no-op on first step", () => {
    let s = next(setAnswers(start(), { occasion: "birthday" }));
    s = back(s);
    expect(s.stepIndex).toBe(0);
    expect(s.answers.occasion).toBe("birthday");
    expect(back(s).stepIndex).toBe(0);
  });

  it("profileId (when present on state) survives next/back/setAnswers", () => {
    let s: ReturnType<typeof start> = { ...start(), profileId: "profile-1" };
    s = setAnswers(s, { occasion: "birthday" });
    expect(s.profileId).toBe("profile-1");
    s = next(s);
    expect(s.profileId).toBe("profile-1");
    s = back(s);
    expect(s.profileId).toBe("profile-1");
  });

  it("next() on last step is a no-op (completion handled by caller)", () => {
    const s = filled();
    expect(s.stepIndex).toBe(QUIZ_STEPS.length - 1);
    expect(next(s).stepIndex).toBe(QUIZ_STEPS.length - 1);
  });
});

describe("completion", () => {
  it("isComplete only when every step validates", () => {
    expect(isComplete(start())).toBe(false);
    expect(isComplete(filled())).toBe(true);
  });

  it("toQuizAnswers returns full object when complete, null otherwise", () => {
    expect(toQuizAnswers(start())).toBeNull();
    const a = toQuizAnswers(filled());
    expect(a).not.toBeNull();
    expect(a!).toMatchObject({
      occasion: "birthday",
      ageBand: "25-34",
      relationship: "friend",
      interests: ["coffee", "reading"],
      budget: 50,
      currency: "GBP",
      urgency: "normal",
      exclusions: ["mug"],
      country: "GB",
    });
  });
});

describe("progress", () => {
  it("is 0 at start and (len-1)/len on last step", () => {
    expect(progress(start())).toBe(0);
    expect(progress(filled())).toBeCloseTo((QUIZ_STEPS.length - 1) / QUIZ_STEPS.length);
  });
});
