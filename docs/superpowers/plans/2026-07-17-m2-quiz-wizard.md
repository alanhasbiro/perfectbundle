# M2 Sprint 1 — Quiz Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A guest-friendly 6-step quiz wizard (occasion → recipient → interests → budget → urgency → exclusions) that collects a complete `QuizAnswers` object and hands off to a results stub, with back-nav, country auto-detect, Framer Motion transitions, and analytics events.

**Architecture:** Pure, UI-independent quiz state machine in `src/lib/quiz/` (mobile-reusable, fully unit-tested) driven by a thin client-component wizard in `src/components/quiz/`. Answers persist to `sessionStorage` so refresh/back-nav never loses data. The final step routes to `/quiz/results` (stub this sprint; the Gemini engine consumes `QuizAnswers` next sprint).

**Tech Stack:** Next.js 16 App Router (client components for the wizard), TypeScript strict, Tailwind, Framer Motion, Vitest.

## Global Constraints

- **$0 cost** — no new services; no paid anything.
- `src/lib/quiz/` MUST be free of React/Next imports (reused by Expo mobile later) — same rule as `src/lib/engine/`.
- Analytics event names only from `docs/prd.md` §2.3: this sprint uses `quiz_started`, `quiz_step_completed`, `quiz_completed` via `track()` from `src/lib/analytics.ts`.
- `QuizAnswers` field names MUST match the Convex `bundles.quiz` validator in `convex/schema.ts` exactly (occasion, ageBand, gender?, relationship, interests, freeText?, budget, currency, urgency, exclusions, country).
- Mobile-first: every step usable at 360px width.
- TypeScript strict; components PascalCase, files kebab-case.
- Per AGENTS.md: consult `node_modules/next/dist/docs/01-app/` guides if any Next.js API behaves unexpectedly (verified: client-component patterns are standard in this version).

---

### Task 1: Quiz domain types + state machine (pure, TDD)

**Files:**
- Create: `src/lib/quiz/types.ts`
- Create: `src/lib/quiz/machine.ts`
- Test: `src/lib/quiz/machine.test.ts`

**Interfaces:**
- Produces:
  - `QuizAnswers` (types.ts): `{ occasion: string; ageBand: string; gender?: string; relationship: string; interests: string[]; freeText?: string; budget: number; currency: string; urgency: "fast" | "normal" | "no_rush"; exclusions: string[]; country: string }`
  - `QuizState` (types.ts): `{ stepIndex: number; answers: PartialAnswers }` where `PartialAnswers = Partial<QuizAnswers> & { interests: string[]; exclusions: string[]; urgency: QuizAnswers["urgency"]; currency: string; country: string }`
  - `QUIZ_STEPS: readonly ["occasion", "recipient", "interests", "budget", "urgency", "exclusions"]` and `QuizStepId` union (machine.ts)
  - `emptyQuizState(country: string, currency: string): QuizState`
  - `currentStep(state: QuizState): QuizStepId`
  - `canAdvance(state: QuizState): boolean`
  - `next(state: QuizState): QuizState` (no-op when `!canAdvance` or on last step)
  - `back(state: QuizState): QuizState` (no-op on first step)
  - `setAnswers(state: QuizState, patch: Partial<QuizAnswers>): QuizState`
  - `isComplete(state: QuizState): boolean` (all steps valid)
  - `toQuizAnswers(state: QuizState): QuizAnswers | null` (null unless complete)
  - `progress(state: QuizState): number` (0–1, fraction of steps passed)

- [ ] **Step 1: Write the failing test — `src/lib/quiz/machine.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import {
  QUIZ_STEPS,
  emptyQuizState,
  currentStep,
  canAdvance,
  next,
  back,
  setAnswers,
  isComplete,
  toQuizAnswers,
  progress,
} from "./machine";

const start = () => emptyQuizState("GB", "GBP");

// Helper: a state advanced through all steps with valid answers.
const filled = () => {
  let s = start();
  s = setAnswers(s, { occasion: "birthday" });
  s = next(s);
  s = setAnswers(s, { ageBand: "25-34", relationship: "friend" });
  s = next(s);
  s = setAnswers(s, { interests: ["coffee", "reading"] });
  s = next(s);
  s = setAnswers(s, { budget: 50 });
  s = next(s);
  s = setAnswers(s, { urgency: "normal" });
  s = next(s);
  s = setAnswers(s, { exclusions: ["mug"] });
  return s;
};

describe("emptyQuizState", () => {
  it("starts at step 0 with seeded country/currency and empty arrays", () => {
    const s = start();
    expect(s.stepIndex).toBe(0);
    expect(currentStep(s)).toBe("occasion");
    expect(s.answers.country).toBe("GB");
    expect(s.answers.currency).toBe("GBP");
    expect(s.answers.interests).toEqual([]);
    expect(s.answers.exclusions).toEqual([]);
    expect(s.answers.urgency).toBe("normal");
  });
});

describe("step validation (canAdvance)", () => {
  it("occasion step requires occasion", () => {
    const s = start();
    expect(canAdvance(s)).toBe(false);
    expect(canAdvance(setAnswers(s, { occasion: "birthday" }))).toBe(true);
  });

  it("recipient step requires ageBand and relationship, gender optional", () => {
    let s = next(setAnswers(start(), { occasion: "birthday" }));
    expect(currentStep(s)).toBe("recipient");
    expect(canAdvance(s)).toBe(false);
    s = setAnswers(s, { ageBand: "25-34" });
    expect(canAdvance(s)).toBe(false);
    s = setAnswers(s, { relationship: "friend" });
    expect(canAdvance(s)).toBe(true);
  });

  it("interests step requires at least one interest OR free text", () => {
    let s = next(setAnswers(start(), { occasion: "birthday" }));
    s = next(setAnswers(s, { ageBand: "25-34", relationship: "friend" }));
    expect(currentStep(s)).toBe("interests");
    expect(canAdvance(s)).toBe(false);
    expect(canAdvance(setAnswers(s, { interests: ["coffee"] }))).toBe(true);
    expect(canAdvance(setAnswers(s, { freeText: "loves hiking" }))).toBe(true);
  });

  it("budget step requires budget > 0", () => {
    let s = filled();
    // rewind to budget step
    s = back(back(s));
    expect(currentStep(s)).toBe("budget");
    expect(canAdvance(setAnswers(s, { budget: 0 }))).toBe(false);
    expect(canAdvance(setAnswers(s, { budget: 30 }))).toBe(true);
  });

  it("urgency and exclusions steps are always advanceable (defaults ok)", () => {
    let s = filled();
    s = back(s);
    expect(currentStep(s)).toBe("urgency");
    expect(canAdvance(s)).toBe(true);
    s = next(s);
    expect(currentStep(s)).toBe("exclusions");
    expect(canAdvance(s)).toBe(true);
  });
});

describe("navigation", () => {
  it("next() is a no-op when invalid", () => {
    const s = start();
    expect(next(s).stepIndex).toBe(0);
  });

  it("back() preserves answers and is a no-op on first step", () => {
    let s = next(setAnswers(start(), { occasion: "birthday" }));
    s = back(s);
    expect(s.stepIndex).toBe(0);
    expect(s.answers.occasion).toBe("birthday");
    expect(back(s).stepIndex).toBe(0);
  });

  it("next() on last step is a no-op (completion handled by caller)", () => {
    const s = filled();
    expect(s.stepIndex).toBe(QUIZ_STEPS.length - 1);
    expect(next(s).stepIndex).toBe(QUIZ_STEPS.length - 1);
  });
});

describe("completion", () => {
  it("isComplete only when every step validates", () => {
    expect(isComplete(start())).toBe(false);
    expect(isComplete(filled())).toBe(true);
  });

  it("toQuizAnswers returns full object when complete, null otherwise", () => {
    expect(toQuizAnswers(start())).toBeNull();
    const a = toQuizAnswers(filled());
    expect(a).not.toBeNull();
    expect(a!).toMatchObject({
      occasion: "birthday",
      ageBand: "25-34",
      relationship: "friend",
      interests: ["coffee", "reading"],
      budget: 50,
      currency: "GBP",
      urgency: "normal",
      exclusions: ["mug"],
      country: "GB",
    });
  });
});

describe("progress", () => {
  it("is 0 at start and (len-1)/len on last step", () => {
    expect(progress(start())).toBe(0);
    expect(progress(filled())).toBeCloseTo((QUIZ_STEPS.length - 1) / QUIZ_STEPS.length);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — cannot resolve `./machine`.

- [ ] **Step 3: Write `src/lib/quiz/types.ts`**

```typescript
// NOTE: keep this file free of React/Next imports — reused by mobile later.
// Field names must match convex/schema.ts bundles.quiz validator exactly.

export type Urgency = "fast" | "normal" | "no_rush";

export interface QuizAnswers {
  occasion: string;
  ageBand: string;
  gender?: string;
  relationship: string;
  interests: string[];
  freeText?: string;
  budget: number;
  currency: string;
  urgency: Urgency;
  exclusions: string[];
  country: string;
}

export type PartialAnswers = Partial<QuizAnswers> & {
  interests: string[];
  exclusions: string[];
  urgency: Urgency;
  currency: string;
  country: string;
};

export interface QuizState {
  stepIndex: number;
  answers: PartialAnswers;
}
```

- [ ] **Step 4: Write `src/lib/quiz/machine.ts`**

```typescript
// NOTE: keep this file free of React/Next imports — reused by mobile later.
import type { PartialAnswers, QuizAnswers, QuizState } from "./types";

export const QUIZ_STEPS = [
  "occasion",
  "recipient",
  "interests",
  "budget",
  "urgency",
  "exclusions",
] as const;

export type QuizStepId = (typeof QUIZ_STEPS)[number];

export function emptyQuizState(country: string, currency: string): QuizState {
  return {
    stepIndex: 0,
    answers: { interests: [], exclusions: [], urgency: "normal", currency, country },
  };
}

export function currentStep(state: QuizState): QuizStepId {
  return QUIZ_STEPS[state.stepIndex];
}

function stepValid(step: QuizStepId, a: PartialAnswers): boolean {
  switch (step) {
    case "occasion":
      return !!a.occasion?.trim();
    case "recipient":
      return !!a.ageBand?.trim() && !!a.relationship?.trim();
    case "interests":
      return a.interests.length > 0 || !!a.freeText?.trim();
    case "budget":
      return typeof a.budget === "number" && a.budget > 0;
    case "urgency":
    case "exclusions":
      return true;
  }
}

export function canAdvance(state: QuizState): boolean {
  return stepValid(currentStep(state), state.answers);
}

export function next(state: QuizState): QuizState {
  if (!canAdvance(state) || state.stepIndex >= QUIZ_STEPS.length - 1) return state;
  return { ...state, stepIndex: state.stepIndex + 1 };
}

export function back(state: QuizState): QuizState {
  if (state.stepIndex === 0) return state;
  return { ...state, stepIndex: state.stepIndex - 1 };
}

export function setAnswers(state: QuizState, patch: Partial<QuizAnswers>): QuizState {
  return { ...state, answers: { ...state.answers, ...patch } };
}

export function isComplete(state: QuizState): boolean {
  return QUIZ_STEPS.every((step) => stepValid(step, state.answers));
}

export function toQuizAnswers(state: QuizState): QuizAnswers | null {
  if (!isComplete(state)) return null;
  const a = state.answers;
  return {
    occasion: a.occasion!,
    ageBand: a.ageBand!,
    ...(a.gender ? { gender: a.gender } : {}),
    relationship: a.relationship!,
    interests: a.interests,
    ...(a.freeText?.trim() ? { freeText: a.freeText } : {}),
    budget: a.budget!,
    currency: a.currency,
    urgency: a.urgency,
    exclusions: a.exclusions,
    country: a.country,
  };
}

export function progress(state: QuizState): number {
  return state.stepIndex / QUIZ_STEPS.length;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test`
Expected: PASS (machine tests + existing 6 schema tests).

- [ ] **Step 6: Commit**

```powershell
git add src/lib/quiz; git commit -m "feat(quiz): pure quiz state machine with per-step validation (TDD)"
```

---

### Task 2: Country detection + currency mapping (pure, TDD)

**Files:**
- Create: `src/lib/quiz/country.ts`
- Test: `src/lib/quiz/country.test.ts`

**Interfaces:**
- Produces:
  - `detectCountry(locale: string | undefined): string` — parses BCP-47 locale ("en-GB" → "GB"); returns "US" when absent/unparseable.
  - `currencyForCountry(country: string): string` — mapped currency, "USD" fallback.
  - `COUNTRIES: readonly { code: string; name: string }[]` — override dropdown options (20 entries, includes all currency-mapped codes).
- Consumed by Task 3's wizard shell: `emptyQuizState(detectCountry(navigator.language), currencyForCountry(...))`.

- [ ] **Step 1: Write the failing test — `src/lib/quiz/country.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { detectCountry, currencyForCountry, COUNTRIES } from "./country";

describe("detectCountry", () => {
  it("extracts region from BCP-47 locales", () => {
    expect(detectCountry("en-GB")).toBe("GB");
    expect(detectCountry("de-DE")).toBe("DE");
    expect(detectCountry("en_AU")).toBe("AU"); // underscore variant
  });
  it("falls back to US when locale has no region or is missing", () => {
    expect(detectCountry("en")).toBe("US");
    expect(detectCountry(undefined)).toBe("US");
    expect(detectCountry("")).toBe("US");
  });
});

describe("currencyForCountry", () => {
  it("maps major countries", () => {
    expect(currencyForCountry("US")).toBe("USD");
    expect(currencyForCountry("GB")).toBe("GBP");
    expect(currencyForCountry("DE")).toBe("EUR");
    expect(currencyForCountry("JP")).toBe("JPY");
  });
  it("falls back to USD for unmapped countries", () => {
    expect(currencyForCountry("ZZ")).toBe("USD");
  });
});

describe("COUNTRIES", () => {
  it("has 20 entries with unique codes, and every code maps to a currency deliberately", () => {
    expect(COUNTRIES).toHaveLength(20);
    const codes = COUNTRIES.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — cannot resolve `./country`.

- [ ] **Step 3: Write `src/lib/quiz/country.ts`**

```typescript
// NOTE: keep this file free of React/Next imports — reused by mobile later.

export const COUNTRIES = [
  { code: "US", name: "United States" },
  { code: "GB", name: "United Kingdom" },
  { code: "CA", name: "Canada" },
  { code: "AU", name: "Australia" },
  { code: "DE", name: "Germany" },
  { code: "FR", name: "France" },
  { code: "IT", name: "Italy" },
  { code: "ES", name: "Spain" },
  { code: "NL", name: "Netherlands" },
  { code: "SE", name: "Sweden" },
  { code: "IE", name: "Ireland" },
  { code: "JP", name: "Japan" },
  { code: "SG", name: "Singapore" },
  { code: "AE", name: "United Arab Emirates" },
  { code: "SA", name: "Saudi Arabia" },
  { code: "IN", name: "India" },
  { code: "BR", name: "Brazil" },
  { code: "MX", name: "Mexico" },
  { code: "PL", name: "Poland" },
  { code: "TR", name: "Turkey" },
] as const;

const CURRENCY_BY_COUNTRY: Record<string, string> = {
  US: "USD",
  GB: "GBP",
  CA: "CAD",
  AU: "AUD",
  DE: "EUR",
  FR: "EUR",
  IT: "EUR",
  ES: "EUR",
  NL: "EUR",
  IE: "EUR",
  SE: "SEK",
  JP: "JPY",
  SG: "SGD",
  AE: "AED",
  SA: "SAR",
  IN: "INR",
  BR: "BRL",
  MX: "MXN",
  PL: "PLN",
  TR: "TRY",
};

export function detectCountry(locale: string | undefined): string {
  if (!locale) return "US";
  const region = locale.replace("_", "-").split("-")[1];
  if (region && /^[A-Za-z]{2}$/.test(region)) return region.toUpperCase();
  return "US";
}

export function currencyForCountry(country: string): string {
  return CURRENCY_BY_COUNTRY[country] ?? "USD";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/quiz; git commit -m "feat(quiz): country detection + currency mapping (TDD)"
```

---

### Task 3: Wizard shell — state hook, persistence, transitions, analytics

**Files:**
- Create: `src/components/quiz/use-quiz.ts` (client hook: reducer + sessionStorage + analytics)
- Create: `src/components/quiz/quiz-wizard.tsx` (shell: progress bar, step frame, back/next, AnimatePresence)
- Create: `src/components/quiz/step-shell.tsx` (shared step layout: title, subtitle, children)

**Interfaces:**
- Consumes: everything from Tasks 1–2; `track()` from `src/lib/analytics.ts`.
- Produces:
  - `useQuiz()` hook returning `{ state: QuizState, step: QuizStepId, patch: (p: Partial<QuizAnswers>) => void, goNext: () => void, goBack: () => void, canGoNext: boolean, submit: () => void, progressValue: number }`. `submit()` (only meaningful on last step): stores final `QuizAnswers` JSON at sessionStorage key `"pb.quizAnswers"`, fires `quiz_completed` with `{ duration_s }`, and `router.push("/quiz/results")`.
  - `<QuizWizard steps={Record<QuizStepId, ReactNode-rendering component>}>` — Task 4/5 step components plug in via a props object.
  - `<StepShell title subtitle?>{children}</StepShell>`.
- sessionStorage keys: `"pb.quizState"` (live state), `"pb.quizStartedAt"` (epoch ms, for duration), `"pb.quizAnswers"` (final payload read by results page).
- Analytics: `quiz_started` fired once per fresh quiz (when no stored state existed); `quiz_step_completed` `{ step }` on every successful `goNext`; `quiz_completed` `{ duration_s }` in `submit()`.

- [ ] **Step 1: Write `src/components/quiz/use-quiz.ts`**

```typescript
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { QuizAnswers, QuizState } from "@/lib/quiz/types";
import {
  QUIZ_STEPS,
  back,
  canAdvance,
  currentStep,
  emptyQuizState,
  next,
  progress,
  setAnswers,
  toQuizAnswers,
} from "@/lib/quiz/machine";
import { detectCountry, currencyForCountry } from "@/lib/quiz/country";
import { track } from "@/lib/analytics";

const STATE_KEY = "pb.quizState";
const STARTED_KEY = "pb.quizStartedAt";
const ANSWERS_KEY = "pb.quizAnswers";

function loadInitial(): { state: QuizState; fresh: boolean } {
  const country = detectCountry(
    typeof navigator !== "undefined" ? navigator.language : undefined
  );
  const fallback = emptyQuizState(country, currencyForCountry(country));
  try {
    const raw = sessionStorage.getItem(STATE_KEY);
    if (raw) return { state: JSON.parse(raw) as QuizState, fresh: false };
  } catch {
    // ignore corrupt storage — start fresh
  }
  return { state: fallback, fresh: true };
}

export function useQuiz() {
  const router = useRouter();
  // Lazy init only on client; useState initializer runs once.
  const [state, setState] = useState<QuizState | null>(null);
  const freshRef = useRef(false);

  useEffect(() => {
    const { state: initial, fresh } = loadInitial();
    freshRef.current = fresh;
    if (fresh) {
      sessionStorage.setItem(STARTED_KEY, String(Date.now()));
      track("quiz_started");
    }
    setState(initial);
  }, []);

  useEffect(() => {
    if (state) sessionStorage.setItem(STATE_KEY, JSON.stringify(state));
  }, [state]);

  const patch = useCallback((p: Partial<QuizAnswers>) => {
    setState((s) => (s ? setAnswers(s, p) : s));
  }, []);

  const goNext = useCallback(() => {
    setState((s) => {
      if (!s || !canAdvance(s)) return s;
      track("quiz_step_completed", { step: currentStep(s) });
      return next(s);
    });
  }, []);

  const goBack = useCallback(() => {
    setState((s) => (s ? back(s) : s));
  }, []);

  const submit = useCallback(() => {
    setState((s) => {
      if (!s) return s;
      const answers = toQuizAnswers(s);
      if (!answers) return s;
      track("quiz_step_completed", { step: currentStep(s) });
      const startedAt = Number(sessionStorage.getItem(STARTED_KEY) ?? Date.now());
      track("quiz_completed", {
        duration_s: Math.round((Date.now() - startedAt) / 1000),
      });
      sessionStorage.setItem(ANSWERS_KEY, JSON.stringify(answers));
      sessionStorage.removeItem(STATE_KEY);
      router.push("/quiz/results");
      return s;
    });
  }, [router]);

  const step = state ? currentStep(state) : QUIZ_STEPS[0];
  const canGoNext = state ? canAdvance(state) : false;
  const progressValue = state ? progress(state) : 0;
  const isLastStep = state ? state.stepIndex === QUIZ_STEPS.length - 1 : false;

  return useMemo(
    () => ({ state, step, patch, goNext, goBack, submit, canGoNext, progressValue, isLastStep }),
    [state, step, patch, goNext, goBack, submit, canGoNext, progressValue, isLastStep]
  );
}
```

- [ ] **Step 2: Write `src/components/quiz/step-shell.tsx`**

```tsx
import { ReactNode } from "react";

export function StepShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex w-full flex-col gap-6">
      <div>
        <h2 className="text-2xl font-semibold sm:text-3xl">{title}</h2>
        {subtitle ? <p className="mt-2 text-sm opacity-70">{subtitle}</p> : null}
      </div>
      {children}
    </div>
  );
}
```

- [ ] **Step 3: Write `src/components/quiz/quiz-wizard.tsx`**

```tsx
"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { ComponentType } from "react";
import type { QuizAnswers, QuizState } from "@/lib/quiz/types";
import type { QuizStepId } from "@/lib/quiz/machine";
import { useQuiz } from "./use-quiz";

export interface StepProps {
  state: QuizState;
  patch: (p: Partial<QuizAnswers>) => void;
}

export function QuizWizard({ steps }: { steps: Record<QuizStepId, ComponentType<StepProps>> }) {
  const { state, step, patch, goNext, goBack, submit, canGoNext, progressValue, isLastStep } =
    useQuiz();

  if (!state) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="opacity-60">Loading…</p>
      </main>
    );
  }

  const StepComponent = steps[step];

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col px-6 py-10">
      <div className="mb-8 h-1.5 w-full overflow-hidden rounded-full bg-foreground/10">
        <motion.div
          className="h-full rounded-full bg-foreground"
          animate={{ width: `${Math.max(progressValue * 100, 4)}%` }}
          transition={{ duration: 0.4 }}
        />
      </div>

      <div className="flex flex-1 flex-col">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.3 }}
            className="flex-1"
          >
            <StepComponent state={state} patch={patch} />
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="mt-10 flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={goBack}
          disabled={state.stepIndex === 0}
          className="rounded-full px-5 py-2.5 text-sm opacity-70 transition hover:opacity-100 disabled:invisible"
        >
          ← Back
        </button>
        <button
          type="button"
          onClick={isLastStep ? submit : goNext}
          disabled={!canGoNext}
          className="rounded-full bg-foreground px-8 py-3 text-background transition hover:opacity-85 disabled:opacity-30"
        >
          {isLastStep ? "Build my bundles" : "Next"}
        </button>
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Verify typecheck/lint/build**

Run: `npm run typecheck; npm run lint; npm run build`
Expected: all PASS (wizard not yet routed — that's Task 6).

- [ ] **Step 5: Commit**

```powershell
git add src/components/quiz; git commit -m "feat(quiz): wizard shell with persistence, transitions, analytics"
```

---

### Task 4: Step components — occasion, recipient, interests

**Files:**
- Create: `src/components/quiz/steps/occasion-step.tsx`
- Create: `src/components/quiz/steps/recipient-step.tsx`
- Create: `src/components/quiz/steps/interests-step.tsx`
- Create: `src/components/quiz/choice-chip.tsx` (shared selectable chip)

**Interfaces:**
- Consumes: `StepProps` from `quiz-wizard.tsx`, `StepShell`, `COUNTRIES` (country override lives in recipient step).
- Produces: three components matching `ComponentType<StepProps>`, exported as `OccasionStep`, `RecipientStep`, `InterestsStep`.

- [ ] **Step 1: Write `src/components/quiz/choice-chip.tsx`**

```tsx
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
          ? "border-foreground bg-foreground text-background"
          : "border-foreground/20 hover:border-foreground/50"
      }`}
    >
      {label}
    </button>
  );
}
```

- [ ] **Step 2: Write `src/components/quiz/steps/occasion-step.tsx`**

```tsx
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
```

- [ ] **Step 3: Write `src/components/quiz/steps/recipient-step.tsx`**

```tsx
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
          <p className="mb-2 text-sm font-medium">They're your…</p>
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
```

- [ ] **Step 4: Write `src/components/quiz/steps/interests-step.tsx`**

```tsx
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
```

- [ ] **Step 5: Verify typecheck/lint**

Run: `npm run typecheck; npm run lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add src/components/quiz; git commit -m "feat(quiz): occasion, recipient, interests steps"
```

---

### Task 5: Step components — budget, urgency, exclusions

**Files:**
- Create: `src/components/quiz/steps/budget-step.tsx`
- Create: `src/components/quiz/steps/urgency-step.tsx`
- Create: `src/components/quiz/steps/exclusions-step.tsx`

**Interfaces:**
- Consumes: `StepProps`, `StepShell`, `ChoiceChip`.
- Produces: `BudgetStep`, `UrgencyStep`, `ExclusionsStep` matching `ComponentType<StepProps>`.

- [ ] **Step 1: Write `src/components/quiz/steps/budget-step.tsx`**

```tsx
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
```

- [ ] **Step 2: Write `src/components/quiz/steps/urgency-step.tsx`**

```tsx
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
                ? "border-foreground bg-foreground/5"
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
```

- [ ] **Step 3: Write `src/components/quiz/steps/exclusions-step.tsx`**

```tsx
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
```

- [ ] **Step 4: Verify typecheck/lint**

Run: `npm run typecheck; npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/components/quiz; git commit -m "feat(quiz): budget, urgency, exclusions steps"
```

---

### Task 6: Route the wizard + results stub + verify + docs

**Files:**
- Modify: `src/app/quiz/page.tsx` (replace placeholder)
- Create: `src/app/quiz/results/page.tsx` (stub reading sessionStorage)
- Modify: `docs/tasks.md`, `docs/checkpoint.md`

**Interfaces:**
- Consumes: `QuizWizard` + all six step components; sessionStorage key `"pb.quizAnswers"`.
- Produces: working `/quiz` flow ending at `/quiz/results` stub. Next sprint's engine replaces the stub's body and reads the same `"pb.quizAnswers"` payload.

- [ ] **Step 1: Replace `src/app/quiz/page.tsx`**

```tsx
import { QuizWizard } from "@/components/quiz/quiz-wizard";
import { OccasionStep } from "@/components/quiz/steps/occasion-step";
import { RecipientStep } from "@/components/quiz/steps/recipient-step";
import { InterestsStep } from "@/components/quiz/steps/interests-step";
import { BudgetStep } from "@/components/quiz/steps/budget-step";
import { UrgencyStep } from "@/components/quiz/steps/urgency-step";
import { ExclusionsStep } from "@/components/quiz/steps/exclusions-step";

export const metadata = { title: "The gift quiz — PerfectBundle" };

export default function QuizPage() {
  return (
    <QuizWizard
      steps={{
        occasion: OccasionStep,
        recipient: RecipientStep,
        interests: InterestsStep,
        budget: BudgetStep,
        urgency: UrgencyStep,
        exclusions: ExclusionsStep,
      }}
    />
  );
}
```

- [ ] **Step 2: Create `src/app/quiz/results/page.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { QuizAnswers } from "@/lib/quiz/types";

export default function ResultsPage() {
  const [answers, setAnswers] = useState<QuizAnswers | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("pb.quizAnswers");
      if (raw) setAnswers(JSON.parse(raw) as QuizAnswers);
    } catch {
      // corrupt storage — treat as no answers
    }
    setLoaded(true);
  }, []);

  if (!loaded) return null;

  if (!answers) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="opacity-70">No quiz answers found.</p>
        <Link href="/quiz" className="rounded-full bg-foreground px-6 py-2.5 text-background">
          Take the quiz
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center gap-4 px-6 py-10">
      <h1 className="text-3xl font-semibold">Got it! 🎁</h1>
      <p className="opacity-70">
        A {answers.occasion.toLowerCase()} gift for your {answers.relationship.toLowerCase()} (
        {answers.ageBand}), around {answers.budget} {answers.currency}, into{" "}
        {answers.interests.slice(0, 3).join(", ").toLowerCase() || "what you described"}.
      </p>
      <p className="rounded-xl border border-foreground/15 p-4 text-sm opacity-70">
        Bundle generation is coming in the next sprint — this page will show 3 themed bundles built
        just for them.
      </p>
      <Link href="/quiz" className="text-sm underline opacity-70 hover:opacity-100">
        ← Change my answers
      </Link>
    </main>
  );
}
```

Note: `/quiz` links back into the wizard; because `submit()` cleared `"pb.quizState"`, "Change my answers" starts a fresh quiz — acceptable for the stub (the engine sprint adds real regeneration).

- [ ] **Step 3: Full verification suite**

Run: `npm run typecheck; npm run lint; npm test; npm run build`
Expected: all PASS; build lists `/quiz` and `/quiz/results` routes.

- [ ] **Step 4: Manual smoke test**

Run `npm run dev`, open http://localhost:3000/quiz and verify: chips select; Next disabled until each step valid; Back preserves answers; refresh mid-quiz restores state; final step button reads "Build my bundles" and lands on the results summary. Check a 360px viewport in devtools.

- [ ] **Step 5: Update docs + commit + push**

In `docs/tasks.md` flip the five M2 "Quiz Wizard (F1)" checkboxes to `[x]`. In `docs/checkpoint.md`: progress, completed items, current focus (next: bundle engine sprint), change log.

```powershell
git add -A; git commit -m "feat(quiz): route wizard + results stub; M2 quiz wizard complete"; git push
```

---

## Self-Review Notes

- **Spec coverage:** tasks.md Quiz Wizard items → state model/back-nav (T1, T3), six steps (T4, T5), country auto-detect + override (T2, T4 recipient step), mobile + Framer Motion (T3 shell, T6 smoke test), events (T3 hook). PRD F1 acceptance: <90s completable (chip-first design), progress indicator (T3), back-nav preserves (T1 test), no sign-up (no auth anywhere), 360px (T6 step 4).
- **Type consistency:** `StepProps` defined once in quiz-wizard.tsx and imported by all steps; `QuizAnswers` field names verified against `convex/schema.ts` quiz validator; sessionStorage keys consistent (`pb.quizState`/`pb.quizStartedAt`/`pb.quizAnswers`) across use-quiz.ts and results page.
- **Placeholder scan:** clean — every code step has complete code.
- **Deliberate deferrals:** Playwright E2E for the quiz lands in M5 per tasks.md; engine consumes `"pb.quizAnswers"` next sprint.
