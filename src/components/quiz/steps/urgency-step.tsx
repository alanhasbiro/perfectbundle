"use client";

import { StepShell } from "../step-shell";
import type { StepProps } from "../quiz-wizard";
import type { Urgency } from "@/lib/quiz/types";

const OPTIONS: { value: Urgency; label: string; hint: string }[] = [
  { value: "fast", label: "Need it fast", hint: "Days away — we'll favour quick-shipping retailers" },
  { value: "normal", label: "Within a couple of weeks", hint: "The usual — a healthy mix" },
  { value: "no_rush", label: "No rush", hint: "Unlocks handmade & personalised finds" },
];

export function UrgencyStep({ state, patch }: StepProps) {
  return (
    <StepShell title="When do you need it?">
      <div className="flex flex-col gap-3">
        {OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => patch({ urgency: o.value })}
            aria-pressed={state.answers.urgency === o.value}
            className={`rounded-xl border px-4 py-3 text-left transition ${
              state.answers.urgency === o.value
                ? "border-accent-solid bg-accent-solid/10"
                : "border-foreground/20 hover:border-foreground/50"
            }`}
          >
            <span className="block font-medium">{o.label}</span>
            <span className="block text-sm opacity-60">{o.hint}</span>
          </button>
        ))}
      </div>
    </StepShell>
  );
}
