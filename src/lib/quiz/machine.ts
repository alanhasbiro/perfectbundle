// NOTE: keep this file free of React/Next imports — reused by mobile later.
import type { PartialAnswers, QuizAnswers, QuizState } from "./types";

export const QUIZ_STEPS = [
  "occasion",
  "recipient",
  "interests",
  "budget",
  "urgency",
  "exclusions",
] as const;

export type QuizStepId = (typeof QUIZ_STEPS)[number];

export function emptyQuizState(country: string, currency: string): QuizState {
  return {
    stepIndex: 0,
    answers: { interests: [], exclusions: [], urgency: "normal", currency, country },
  };
}

export function currentStep(state: QuizState): QuizStepId {
  return QUIZ_STEPS[state.stepIndex];
}

function stepValid(step: QuizStepId, a: PartialAnswers): boolean {
  switch (step) {
    case "occasion":
      return !!a.occasion?.trim();
    case "recipient":
      return !!a.ageBand?.trim() && !!a.relationship?.trim();
    case "interests":
      return a.interests.length > 0 || !!a.freeText?.trim();
    case "budget":
      return typeof a.budget === "number" && a.budget > 0;
    case "urgency":
    case "exclusions":
      return true;
  }
}

export function canAdvance(state: QuizState): boolean {
  return stepValid(currentStep(state), state.answers);
}

export function next(state: QuizState): QuizState {
  if (!canAdvance(state) || state.stepIndex >= QUIZ_STEPS.length - 1) return state;
  return { ...state, stepIndex: state.stepIndex + 1 };
}

export function back(state: QuizState): QuizState {
  if (state.stepIndex === 0) return state;
  return { ...state, stepIndex: state.stepIndex - 1 };
}

export function setAnswers(state: QuizState, patch: Partial<QuizAnswers>): QuizState {
  return { ...state, answers: { ...state.answers, ...patch } };
}

export function isComplete(state: QuizState): boolean {
  return QUIZ_STEPS.every((step) => stepValid(step, state.answers));
}

export function toQuizAnswers(state: QuizState): QuizAnswers | null {
  if (!isComplete(state)) return null;
  const a = state.answers;
  return {
    occasion: a.occasion!,
    ageBand: a.ageBand!,
    ...(a.gender ? { gender: a.gender } : {}),
    relationship: a.relationship!,
    interests: a.interests,
    ...(a.freeText?.trim() ? { freeText: a.freeText } : {}),
    budget: a.budget!,
    currency: a.currency,
    urgency: a.urgency,
    exclusions: a.exclusions,
    country: a.country,
  };
}

export function progress(state: QuizState): number {
  return state.stepIndex / QUIZ_STEPS.length;
}
