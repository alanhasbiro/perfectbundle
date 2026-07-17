// NOTE: keep this file free of React/Next imports — reused by mobile later.
import type { QuizState } from "./types";

// The person-level fields a recipient profile carries into a fresh quiz. The
// per-gift fields (occasion, budget, urgency) are intentionally left blank so
// the user answers them anew each time they make a gift for this person.
export interface ProfileForPrefill {
  relationship: string;
  ageBand: string;
  gender?: string;
  interests: string[];
  notes?: string;
}

// Builds a quiz state pre-seeded with a saved recipient's details, positioned
// at the first step so the user still picks occasion/budget/etc. Country and
// currency come from the current session (detected client-side), not the
// profile — where you shop can differ from who you're shopping for.
export function profileToQuizState(
  profile: ProfileForPrefill,
  country: string,
  currency: string
): QuizState {
  return {
    stepIndex: 0,
    answers: {
      relationship: profile.relationship,
      ageBand: profile.ageBand,
      ...(profile.gender ? { gender: profile.gender } : {}),
      interests: [...profile.interests],
      ...(profile.notes?.trim() ? { freeText: profile.notes } : {}),
      exclusions: [],
      urgency: "normal",
      currency,
      country,
    },
  };
}
