"use client";

import { StepShell } from "../step-shell";
import { ChoiceChip } from "../choice-chip";
import type { StepProps } from "../quiz-wizard";

const OCCASIONS = [
  "Birthday",
  "Christmas",
  "Anniversary",
  "Valentine's Day",
  "Mother's Day",
  "Father's Day",
  "Wedding",
  "New baby",
  "Graduation",
  "Housewarming",
  "Thank you",
  "Just because",
];

export function OccasionStep({ state, patch }: StepProps) {
  return (
    <StepShell title="What's the occasion?">
      <div className="flex flex-wrap gap-2">
        {OCCASIONS.map((o) => (
          <ChoiceChip
            key={o}
            label={o}
            selected={state.answers.occasion === o}
            onToggle={() => patch({ occasion: o })}
          />
        ))}
      </div>
    </StepShell>
  );
}
