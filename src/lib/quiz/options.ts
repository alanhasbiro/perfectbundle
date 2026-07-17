// NOTE: keep this file free of React/Next imports — reused by mobile later.
// Single source of truth for the quiz's choice lists. The recipient-profiles
// form reuses these so a saved profile's values always map back onto the quiz
// (prefill relies on exact string equality).

export const RELATIONSHIPS = [
  "Partner",
  "Friend",
  "Mum",
  "Dad",
  "Sibling",
  "Child",
  "Grandparent",
  "Colleague",
  "Other",
] as const;

export const AGE_BANDS = [
  "0-12",
  "13-17",
  "18-24",
  "25-34",
  "35-44",
  "45-54",
  "55-64",
  "65+",
] as const;

export const GENDERS = ["Female", "Male", "Prefer not to say"] as const;

export const INTERESTS = [
  "Cooking",
  "Coffee & tea",
  "Reading",
  "Gaming",
  "Fitness",
  "Outdoors & hiking",
  "Gardening",
  "Music",
  "Art & crafts",
  "Tech & gadgets",
  "Beauty & skincare",
  "Fashion",
  "Travel",
  "Pets",
  "Home & cozy",
  "Sports",
  "Movies & TV",
  "Wellness",
] as const;
