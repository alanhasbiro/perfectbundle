"use client";

export function ChoiceChip({
  label,
  selected,
  onToggle,
}: {
  label: string;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={selected}
      className={`rounded-full border px-4 py-2 text-sm transition ${
        selected
          ? "border-accent-solid bg-accent-solid text-white"
          : "border-foreground/20 hover:border-foreground/50"
      }`}
    >
      {label}
    </button>
  );
}
