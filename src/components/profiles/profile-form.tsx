"use client";

import { useState } from "react";
import { ChoiceChip } from "@/components/quiz/choice-chip";
import { RELATIONSHIPS, AGE_BANDS, GENDERS, INTERESTS } from "@/lib/quiz/options";

export interface ProfileDraft {
  name: string;
  relationship: string;
  ageBand: string;
  gender?: string;
  interests: string[];
  notes?: string;
}

const EMPTY: ProfileDraft = {
  name: "",
  relationship: "",
  ageBand: "",
  interests: [],
};

export function ProfileForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: ProfileDraft;
  submitLabel: string;
  onSubmit: (draft: ProfileDraft) => Promise<void> | void;
  onCancel?: () => void;
}) {
  const [draft, setDraft] = useState<ProfileDraft>(initial ?? EMPTY);
  const [saving, setSaving] = useState(false);

  const valid =
    draft.name.trim() !== "" &&
    draft.relationship !== "" &&
    draft.ageBand !== "" &&
    (draft.interests.length > 0 || (draft.notes?.trim() ?? "") !== "");

  const toggleInterest = (i: string) =>
    setDraft((d) => ({
      ...d,
      interests: d.interests.includes(i)
        ? d.interests.filter((x) => x !== i)
        : [...d.interests, i],
    }));

  const handleSubmit = async () => {
    if (!valid || saving) return;
    setSaving(true);
    try {
      await onSubmit({
        ...draft,
        name: draft.name.trim(),
        notes: draft.notes?.trim() ? draft.notes.trim() : undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card-surface flex flex-col gap-5 p-6">
      <div>
        <label htmlFor="pname" className="mb-2 block text-sm font-medium">
          Name or nickname
        </label>
        <input
          id="pname"
          value={draft.name}
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          placeholder="e.g. Mum, Alex, my running buddy"
          className="w-full rounded-lg border border-foreground/20 bg-transparent px-3 py-2.5 text-sm"
        />
      </div>

      <div>
        <p className="mb-2 text-sm font-medium">They&apos;re your…</p>
        <div className="flex flex-wrap gap-2">
          {RELATIONSHIPS.map((r) => (
            <ChoiceChip
              key={r}
              label={r}
              selected={draft.relationship === r}
              onToggle={() => setDraft((d) => ({ ...d, relationship: r }))}
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
              selected={draft.ageBand === a}
              onToggle={() => setDraft((d) => ({ ...d, ageBand: a }))}
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
              selected={draft.gender === g}
              onToggle={() =>
                setDraft((d) => ({ ...d, gender: d.gender === g ? undefined : g }))
              }
            />
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium">What are they into?</p>
        <div className="flex flex-wrap gap-2">
          {INTERESTS.map((i) => (
            <ChoiceChip
              key={i}
              label={i}
              selected={draft.interests.includes(i)}
              onToggle={() => toggleInterest(i)}
            />
          ))}
        </div>
      </div>

      <div>
        <label htmlFor="pnotes" className="mb-2 block text-sm font-medium">
          Notes (optional)
        </label>
        <textarea
          id="pnotes"
          value={draft.notes ?? ""}
          onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
          placeholder="Anything else — e.g. “just got a puppy, loves true crime”"
          rows={2}
          className="w-full rounded-lg border border-foreground/20 bg-transparent px-3 py-2.5 text-sm"
        />
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!valid || saving}
          className="btn-primary px-6 py-2.5 text-sm"
        >
          {saving ? "Saving…" : submitLabel}
        </button>
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="btn-secondary px-6 py-2.5 text-sm"
          >
            Cancel
          </button>
        ) : null}
      </div>
    </div>
  );
}
