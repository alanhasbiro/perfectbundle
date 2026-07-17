"use client";

import { StepShell } from "../step-shell";
import { ChoiceChip } from "../choice-chip";
import type { StepProps } from "../quiz-wizard";

const PRESETS = [25, 50, 100, 200];

export function BudgetStep({ state, patch }: StepProps) {
  return (
    <StepShell
      title="What's the total budget?"
      subtitle={`For the whole bundle, in ${state.answers.currency}. Prices will be estimates.`}
    >
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <ChoiceChip
            key={p}
            label={`~${p} ${state.answers.currency}`}
            selected={state.answers.budget === p}
            onToggle={() => patch({ budget: p })}
          />
        ))}
      </div>
      <div>
        <label htmlFor="budget" className="mb-2 block text-sm font-medium">
          Or enter your own
        </label>
        <input
          id="budget"
          type="number"
          min={1}
          value={state.answers.budget ?? ""}
          onChange={(e) => {
            const n = Number(e.target.value);
            patch({ budget: Number.isFinite(n) && n > 0 ? n : undefined });
          }}
          placeholder="e.g. 75"
          className="w-full rounded-lg border border-foreground/20 bg-transparent px-3 py-2.5 text-sm"
        />
      </div>
    </StepShell>
  );
}
