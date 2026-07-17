// NOTE: keep this file free of React/Next imports — reused by mobile later.
import type { QuizAnswers } from "./types";

// Small, dependency-free deterministic string hash (FNV-1a). Not cryptographic —
// only used as a cache key, collisions just cause an extra Gemini call.
function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function hashQuizAnswers(answers: QuizAnswers): string {
  const normalized = {
    occasion: answers.occasion.trim().toLowerCase(),
    ageBand: answers.ageBand,
    gender: answers.gender?.trim().toLowerCase() ?? "",
    relationship: answers.relationship.trim().toLowerCase(),
    interests: [...answers.interests].map((i) => i.trim().toLowerCase()).sort(),
    freeText: answers.freeText?.trim().toLowerCase() ?? "",
    budget: answers.budget,
    currency: answers.currency,
    urgency: answers.urgency,
    exclusions: [...answers.exclusions].map((e) => e.trim().toLowerCase()).sort(),
    country: answers.country,
  };
  return fnv1a(JSON.stringify(normalized));
}
