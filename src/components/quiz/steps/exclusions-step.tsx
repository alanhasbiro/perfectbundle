"use client";

import { useState } from "react";
import { StepShell } from "../step-shell";
import type { StepProps } from "../quiz-wizard";

export function ExclusionsStep({ state, patch }: StepProps) {
  const [draft, setDraft] = useState("");

  const add = () => {
    const v = draft.trim();
    if (!v || state.answers.exclusions.includes(v)) return;
    patch({ exclusions: [...state.answers.exclusions, v] });
    setDraft("");
  };

  return (
    <StepShell
      title="Anything to avoid?"
      subtitle="Things they already have, dislike, or that are off-limits. Optional."
    >
      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder="e.g. candles, alcohol, another mug…"
          className="flex-1 rounded-lg border border-foreground/20 bg-transparent px-3 py-2.5 text-sm"
        />
        <button
          type="button"
          onClick={add}
          className="rounded-lg border border-foreground/20 px-4 text-sm transition hover:border-foreground/50"
        >
          Add
        </button>
      </div>
      {state.answers.exclusions.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {state.answers.exclusions.map((x) => (
            <li key={x}>
              <button
                type="button"
                onClick={() =>
                  patch({ exclusions: state.answers.exclusions.filter((e) => e !== x) })
                }
                className="rounded-full border border-foreground/20 px-3 py-1.5 text-sm transition hover:border-red-400 hover:text-red-500"
              >
                {x} ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </StepShell>
  );
}
