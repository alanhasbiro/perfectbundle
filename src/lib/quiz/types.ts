// NOTE: keep this file free of React/Next imports — reused by mobile later.
// Field names must match convex/schema.ts bundles.quiz validator exactly.

export type Urgency = "fast" | "normal" | "no_rush";

export interface QuizAnswers {
  occasion: string;
  ageBand: string;
  gender?: string;
  relationship: string;
  interests: string[];
  freeText?: string;
  budget: number;
  currency: string;
  urgency: Urgency;
  exclusions: string[];
  country: string;
}

export type PartialAnswers = Partial<QuizAnswers> & {
  interests: string[];
  exclusions: string[];
  urgency: Urgency;
  currency: string;
  country: string;
};

export interface QuizState {
  stepIndex: number;
  answers: PartialAnswers;
}
