"use client";

import { StepShell } from "../step-shell";
import { ChoiceChip } from "../choice-chip";
import type { StepProps } from "../quiz-wizard";

const INTERESTS = [
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
];

export function InterestsStep({ state, patch }: StepProps) {
  const toggle = (interest: string) => {
    const has = state.answers.interests.includes(interest);
    patch({
      interests: has
        ? state.answers.interests.filter((i) => i !== interest)
        : [...state.answers.interests, interest],
    });
  };

  return (
    <StepShell title="What are they into?" subtitle="Pick a few — or tell us in your own words.">
      <div className="flex flex-wrap gap-2">
        {INTERESTS.map((i) => (
          <ChoiceChip
            key={i}
            label={i}
            selected={state.answers.interests.includes(i)}
            onToggle={() => toggle(i)}
          />
        ))}
      </div>
      <textarea
        value={state.answers.freeText ?? ""}
        onChange={(e) => patch({ freeText: e.target.value })}
        placeholder="Anything else? e.g. “obsessed with their new puppy, loves true crime podcasts”"
        rows={3}
        className="w-full rounded-lg border border-foreground/20 bg-transparent px-3 py-2.5 text-sm"
      />
    </StepShell>
  );
}
