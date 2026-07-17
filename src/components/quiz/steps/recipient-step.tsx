"use client";

import { StepShell } from "../step-shell";
import { ChoiceChip } from "../choice-chip";
import { COUNTRIES, currencyForCountry } from "@/lib/quiz/country";
import type { StepProps } from "../quiz-wizard";

const AGE_BANDS = ["0-12", "13-17", "18-24", "25-34", "35-44", "45-54", "55-64", "65+"];
const RELATIONSHIPS = [
  "Partner",
  "Friend",
  "Mum",
  "Dad",
  "Sibling",
  "Child",
  "Grandparent",
  "Colleague",
  "Other",
];
const GENDERS = ["Female", "Male", "Prefer not to say"];

export function RecipientStep({ state, patch }: StepProps) {
  return (
    <StepShell title="Who's it for?" subtitle="A little about them helps a lot.">
      <div className="flex flex-col gap-6">
        <div>
          <p className="mb-2 text-sm font-medium">They&apos;re your…</p>
          <div className="flex flex-wrap gap-2">
            {RELATIONSHIPS.map((r) => (
              <ChoiceChip
                key={r}
                label={r}
                selected={state.answers.relationship === r}
                onToggle={() => patch({ relationship: r })}
              />
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-sm font-medium">Age</p>
          <div className="flex flex-wrap gap-2">
            {AGE_BANDS.map((a) => (
              <ChoiceChip
                key={a}
                label={a}
                selected={state.answers.ageBand === a}
                onToggle={() => patch({ ageBand: a })}
              />
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-sm font-medium">Gender (optional)</p>
          <div className="flex flex-wrap gap-2">
            {GENDERS.map((g) => (
              <ChoiceChip
                key={g}
                label={g}
                selected={state.answers.gender === g}
                onToggle={() => patch({ gender: state.answers.gender === g ? undefined : g })}
              />
            ))}
          </div>
        </div>
        <div>
          <label htmlFor="country" className="mb-2 block text-sm font-medium">
            Where will you shop? (we detected this)
          </label>
          <select
            id="country"
            value={state.answers.country}
            onChange={(e) =>
              patch({ country: e.target.value, currency: currencyForCountry(e.target.value) })
            }
            className="w-full rounded-lg border border-foreground/20 bg-transparent px-3 py-2.5 text-sm"
          >
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>
    </StepShell>
  );
}
