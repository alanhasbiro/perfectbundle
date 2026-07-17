# Past-Bundle Memory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a signed-in user generates bundles via "New bundles for X" on a recipient profile, the engine avoids repeating items it already suggested for that same person, and remembers new suggestions for next time.

**Architecture:** A recipient profile gains a `pastItemNames: string[]` memory field. The quiz carries an optional `profileId` alongside (not inside) its answers, kept out of `QuizAnswers`/the cache hash so the profile-less path is untouched. `generateBundles.generate` accepts `profileId`, verifies ownership server-side, fetches that profile's past item names, folds them into the Gemini prompt as an "avoid repeating" instruction, folds `profileId` into the generation-cache key (so a cache hit can never bypass a live profile's dedup exclusion), and — on a fresh (non-cached) generation — appends the newly suggested item names back onto the profile.

**Tech Stack:** Convex (schema, query, mutation, action), TypeScript, Zod-free (Convex validators only), Vitest for pure-function unit tests.

## Global Constraints

- **$0 operating cost** — no new services; this is pure Convex + existing Gemini free tier.
- Keep `src/lib/quiz/*.ts` and `src/lib/engine/prompt.ts` free of React/Next imports (mobile reuse).
- `QuizAnswers` (and the Convex `bundles.quiz` validator it mirrors) must NOT gain a `profileId` field — it must stay exactly what it is today, so `hashQuizAnswers` and the stored `bundles.quiz` shape are unaffected for the no-profile path (existing golden fixtures / prompt tests must keep passing unmodified in their existing assertions).
- Follow existing project convention: Convex functions (schema, queries, mutations, actions) have no dedicated unit-test harness in this repo (no `convex-test` package installed) — they're verified via TypeScript/Convex typecheck, `npx convex dev` schema push, and a manual live click-through (same pattern used for every prior Clerk-gated M4 feature). Pure-function logic (`prompt.ts`, `prefill.ts`, `machine.ts`) DOES get TDD'd with Vitest, per existing test files for those modules.
- Cap remembered item names per profile at 50 (`MAX_PAST_ITEMS`), keeping the most recent ones, so the prompt never grows unbounded.

---

## Task 1: Schema field + Convex profile functions for past-item memory

**Files:**
- Modify: `convex/schema.ts:67-76` (recipientProfiles table)
- Modify: `convex/recipientProfiles.ts`
- Modify: `docs/data-schema.md:43` (already documents `pastItemNames` — verify wording still matches; update if needed)

**Interfaces:**
- Produces: `recipientProfiles.pastItemNames?: string[]` schema field (optional, so existing rows without it don't break); `create` mutation now initializes it to `[]`; new `internalQuery getByIdInternal({id}) -> Doc<"recipientProfiles"> | null`; new `internalMutation appendPastItemsInternal({id, itemNames: string[]}) -> null` that dedupes and caps to the most recent 50 entries.

- [ ] **Step 1: Add the schema field**

In `convex/schema.ts`, inside the `recipientProfiles` table definition (currently lines 67-76), add the new optional field after `notes`:

```ts
  recipientProfiles: defineTable({
    userId: v.string(),
    name: v.string(),
    relationship: v.string(),
    ageBand: v.string(),
    gender: v.optional(v.string()),
    interests: v.array(v.string()),
    notes: v.optional(v.string()),
    pastItemNames: v.optional(v.array(v.string())),
    createdAt: v.number(),
  }).index("by_user", ["userId"]),
```

It's `v.optional` (not required) so existing profile documents created before this change remain valid without a backfill migration.

- [ ] **Step 2: Initialize `pastItemNames: []` on profile creation**

In `convex/recipientProfiles.ts`, update the `create` mutation (currently lines 17-28):

```ts
export const create = mutation({
  args: profileFields,
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) throw new Error("Not authenticated");
    return await ctx.db.insert("recipientProfiles", {
      userId: identity.subject,
      createdAt: Date.now(),
      pastItemNames: [],
      ...args,
    });
  },
});
```

- [ ] **Step 3: Add `getByIdInternal` and `appendPastItemsInternal`**

Add these to `convex/recipientProfiles.ts`, and add `internalMutation, internalQuery` to the existing import from `./_generated/server` (line 2):

```ts
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
```

Then, at the end of the file:

```ts
const MAX_PAST_ITEMS = 50;

// Internal-only: the generateBundles action uses this to verify ownership of
// a profileId passed in from the client before trusting its past-item memory.
export const getByIdInternal = internalQuery({
  args: { id: v.id("recipientProfiles") },
  handler: async (ctx, { id }) => {
    return await ctx.db.get("recipientProfiles", id);
  },
});

// Internal-only: called by generateBundles after a fresh (non-cached)
// generation to remember what was just suggested, so future generations for
// the same profile avoid repeating it. Dedupes and keeps only the most
// recent MAX_PAST_ITEMS names.
export const appendPastItemsInternal = internalMutation({
  args: { id: v.id("recipientProfiles"), itemNames: v.array(v.string()) },
  handler: async (ctx, { id, itemNames }) => {
    const existing = await ctx.db.get("recipientProfiles", id);
    if (!existing) return null;
    const merged = Array.from(new Set([...(existing.pastItemNames ?? []), ...itemNames]));
    const capped = merged.slice(-MAX_PAST_ITEMS);
    await ctx.db.patch("recipientProfiles", id, { pastItemNames: capped });
    return null;
  },
});
```

- [ ] **Step 4: Typecheck**

Run: `npx convex dev --once`
Expected: schema pushes cleanly, no validator errors, `convex/_generated/api.d.ts` regenerates with the two new internal functions.

- [ ] **Step 5: Commit**

```bash
git add convex/schema.ts convex/recipientProfiles.ts
git commit -m "feat(m4): add past-item memory field + internal profile lookups"
```

---

## Task 2: Engine prompt — "avoid repeating" instruction

**Files:**
- Modify: `src/lib/engine/prompt.ts`
- Test: `src/lib/engine/prompt.test.ts`

**Interfaces:**
- Consumes: nothing new from other tasks.
- Produces: `buildBundlePrompt(answers: QuizAnswers, pastItemNames?: string[]): string` — second parameter is optional and defaults to `[]`, so every existing call site (`convex/generateBundles.ts:124`, currently `buildBundlePrompt(quiz)`) keeps compiling unchanged until Task 6 updates it.

- [ ] **Step 1: Write the failing tests**

Add to the end of `src/lib/engine/prompt.test.ts` (inside the existing `describe("buildBundlePrompt", ...)` block, after the last `it(...)`):

```ts
  it("omits any past-items instruction when none are given", () => {
    const p = buildBundlePrompt(answers);
    expect(p.toLowerCase()).not.toContain("previously suggested");
  });

  it("instructs avoiding previously suggested items when given", () => {
    const p = buildBundlePrompt(answers, ["Ceramic mug", "French press"]);
    expect(p).toMatch(/previously suggested/i);
    expect(p).toContain("Ceramic mug");
    expect(p).toContain("French press");
    expect(p).toMatch(/avoid repeating|do not repeat/i);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/engine/prompt.test.ts`
Expected: FAIL — 2 failing tests, `buildBundlePrompt` doesn't accept a second argument / prompt doesn't contain the new text.

- [ ] **Step 3: Implement**

In `src/lib/engine/prompt.ts`, change the function signature and insert a new prompt line after the existing exclusions line (currently lines 25-29), plus a new numbered rule after rule 7 (currently line 51):

```ts
export function buildBundlePrompt(answers: QuizAnswers, pastItemNames: string[] = []): string {
  const lines: string[] = [];
  lines.push(
    "You are a thoughtful professional gift consultant. Design gift bundles for the following recipient."
  );
  lines.push("");
  lines.push("RECIPIENT:");
  lines.push(`- Occasion: ${answers.occasion}`);
  lines.push(`- Age band: ${answers.ageBand}`);
  if (answers.gender) lines.push(`- Gender: ${answers.gender}`);
  lines.push(`- Relationship to gift-giver: ${answers.relationship}`);
  lines.push(`- Interests: ${answers.interests.join(", ") || "none specified"}`);
  if (answers.freeText) lines.push(`- Additional notes from the gift-giver: ${answers.freeText}`);
  lines.push(`- Total bundle budget: ${answers.budget} ${answers.currency}`);
  lines.push(`- Delivery urgency: ${URGENCY_COPY[answers.urgency]}`);
  lines.push(
    `- Exclusions (NEVER include these, or close synonyms of them): ${
      answers.exclusions.length ? answers.exclusions.join(", ") : "none"
    }`
  );
  if (pastItemNames.length) {
    lines.push(
      `- Previously suggested items for this recipient (avoid repeating these or close variants; suggest different ideas): ${pastItemNames.join(", ")}`
    );
  }
  lines.push(`- Shopping country: ${answers.country}`);
  lines.push("");
  lines.push("RULES:");
  lines.push(
    "1. Produce exactly 3 distinct gift bundles, each built around one clear, coherent theme."
  );
  lines.push(
    "2. Each bundle must contain between 3 and 6 items that genuinely complement each other under that theme."
  );
  lines.push(
    "3. Respect the total budget: the sum of the bundle's item price ranges must stay close to it (within about 20%), never wildly over."
  );
  lines.push(
    "4. NEVER suggest an excluded item, or a close synonym/variant of one, in any bundle."
  );
  lines.push(
    '5. Prices are always an ESTIMATE range (e.g. "$15-25"), never a specific live price or a claim of current availability.'
  );
  lines.push(
    "6. Apply age-appropriate safety rules: never suggest alcohol, tobacco, or age-restricted items unless the age band is clearly a legal adult for that item in a typical country, and prefer to avoid alcohol entirely unless interests explicitly mention it."
  );
  lines.push("7. Avoid generic, cliché gifts unless they genuinely fit the interests given.");
  if (pastItemNames.length) {
    lines.push(
      "8. Do not repeat any item from the 'previously suggested items' list above, or a near-identical variant of one — this recipient has already been offered those."
    );
  }
  lines.push("");
  lines.push("OUTPUT FORMAT:");
  lines.push(
    "Return JSON only, an array of exactly 3 objects. Each object has fields: " +
      '"theme" (string), "rationale" (string, 1-2 sentences on why this bundle fits), ' +
      '"estTotal" (string price range like "$45-60"), and "items" (array of 3 to 6 objects). ' +
      'Each item object has fields: "name" (string), "description" (string, 1 sentence), ' +
      '"why" (string, why this item fits the recipient), "estPriceRange" (string like "$15-25"), ' +
      '"searchQuery" (string, a good product-search phrase for a retailer search box), ' +
      '"tags" (array of 1-4 short lowercase strings).'
  );
  return lines.join("\n");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/engine/prompt.test.ts`
Expected: PASS — all tests (existing + 2 new) green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/engine/prompt.ts src/lib/engine/prompt.test.ts
git commit -m "feat(m4): prompt supports an avoid-repeating-past-items instruction"
```

---

## Task 3: Thread `profileId` through quiz state and prefill

**Files:**
- Modify: `src/lib/quiz/types.ts`
- Modify: `src/lib/quiz/prefill.ts`
- Test: `src/lib/quiz/prefill.test.ts`
- Test: `src/lib/quiz/machine.test.ts`

**Interfaces:**
- Consumes: nothing new from other tasks.
- Produces: `QuizState.profileId?: string` (top-level, sibling of `answers` — NOT part of `QuizAnswers`); `ProfileForPrefill.id: string` (required); `profileToQuizState(profile, country, currency)` now sets `profileId` on the returned state.

- [ ] **Step 1: Write the failing tests**

Update `src/lib/quiz/prefill.test.ts` — add `id: "profile-1"` to the `base` fixture and a new assertion:

```ts
import { describe, it, expect } from "vitest";
import { profileToQuizState } from "./prefill";

describe("profileToQuizState", () => {
  const base = {
    id: "profile-1",
    relationship: "Mum",
    ageBand: "55-64",
    interests: ["Cooking", "Gardening"],
  };

  it("seeds recipient fields and starts at the first step", () => {
    const state = profileToQuizState(base, "GB", "GBP");
    expect(state.stepIndex).toBe(0);
    expect(state.answers.relationship).toBe("Mum");
    expect(state.answers.ageBand).toBe("55-64");
    expect(state.answers.interests).toEqual(["Cooking", "Gardening"]);
    expect(state.answers.country).toBe("GB");
    expect(state.answers.currency).toBe("GBP");
  });

  it("carries the profile id on the returned state, outside answers", () => {
    const state = profileToQuizState(base, "GB", "GBP");
    expect(state.profileId).toBe("profile-1");
    expect((state.answers as Record<string, unknown>).profileId).toBeUndefined();
  });

  it("leaves per-gift fields blank for the user to fill", () => {
    const state = profileToQuizState(base, "US", "USD");
    expect(state.answers.occasion).toBeUndefined();
    expect(state.answers.budget).toBeUndefined();
    expect(state.answers.urgency).toBe("normal");
    expect(state.answers.exclusions).toEqual([]);
  });

  it("includes optional gender and notes only when present", () => {
    const withOptional = profileToQuizState(
      { ...base, gender: "Female", notes: "loves her allotment" },
      "US",
      "USD"
    );
    expect(withOptional.answers.gender).toBe("Female");
    expect(withOptional.answers.freeText).toBe("loves her allotment");

    const withoutOptional = profileToQuizState(base, "US", "USD");
    expect(withoutOptional.answers.gender).toBeUndefined();
    expect(withoutOptional.answers.freeText).toBeUndefined();
  });

  it("copies the interests array rather than sharing the reference", () => {
    const state = profileToQuizState(base, "US", "USD");
    state.answers.interests.push("Music");
    expect(base.interests).toEqual(["Cooking", "Gardening"]);
  });
});
```

Add to `src/lib/quiz/machine.test.ts`, inside the `describe("navigation", ...)` block (after the existing `it("back() preserves answers...")` test):

```ts
  it("profileId (when present on state) survives next/back/setAnswers", () => {
    let s = { ...start(), profileId: "profile-1" };
    s = setAnswers(s, { occasion: "birthday" });
    expect(s.profileId).toBe("profile-1");
    s = next(s);
    expect(s.profileId).toBe("profile-1");
    s = back(s);
    expect(s.profileId).toBe("profile-1");
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/quiz/prefill.test.ts src/lib/quiz/machine.test.ts`
Expected: FAIL — `ProfileForPrefill` has no `id` field (type error surfaces as a test failure once Step 3 types are checked via `npx tsc --noEmit`, but the runtime assertions on `state.profileId` fail directly since the field doesn't exist yet).

- [ ] **Step 3: Implement**

In `src/lib/quiz/types.ts`, add `profileId` to `QuizState` (currently lines 28-31):

```ts
export interface QuizState {
  stepIndex: number;
  profileId?: string;
  answers: PartialAnswers;
}
```

In `src/lib/quiz/prefill.ts`, add `id` to the interface and set `profileId` on the returned state:

```ts
// NOTE: keep this file free of React/Next imports — reused by mobile later.
import type { QuizState } from "./types";

// The person-level fields a recipient profile carries into a fresh quiz. The
// per-gift fields (occasion, budget, urgency) are intentionally left blank so
// the user answers them anew each time they make a gift for this person.
export interface ProfileForPrefill {
  id: string;
  relationship: string;
  ageBand: string;
  gender?: string;
  interests: string[];
  notes?: string;
}

// Builds a quiz state pre-seeded with a saved recipient's details, positioned
// at the first step so the user still picks occasion/budget/etc. Country and
// currency come from the current session (detected client-side), not the
// profile — where you shop can differ from who you're shopping for.
// `profileId` rides on the state itself (not `answers`) so it never becomes
// part of QuizAnswers/the generation cache hash — see generateBundles.ts for
// where it's picked back up and used.
export function profileToQuizState(
  profile: ProfileForPrefill,
  country: string,
  currency: string
): QuizState {
  return {
    stepIndex: 0,
    profileId: profile.id,
    answers: {
      relationship: profile.relationship,
      ageBand: profile.ageBand,
      ...(profile.gender ? { gender: profile.gender } : {}),
      interests: [...profile.interests],
      ...(profile.notes?.trim() ? { freeText: profile.notes } : {}),
      exclusions: [],
      urgency: "normal",
      currency,
      country,
    },
  };
}
```

`emptyQuizState()` in `src/lib/quiz/machine.ts` needs no change — it already only sets `stepIndex` and `answers`, so `profileId` is simply absent (undefined) for guest/no-profile quizzes, which is correct.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/quiz/prefill.test.ts src/lib/quiz/machine.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck the whole project (this touches a shared type)**

Run: `npx tsc --noEmit`
Expected: no new errors. (This will surface the `src/app/profiles/page.tsx` call site that still passes an object without `id` — that's fixed in Task 7. If Task 7 hasn't landed yet in a subagent-driven execution, note the expected pre-existing error there and don't treat it as a regression in Task 3 specifically; if executing tasks in order within one session, do Task 7 before this final typecheck, or accept the transient error and re-check after Task 7.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/quiz/types.ts src/lib/quiz/prefill.ts src/lib/quiz/prefill.test.ts src/lib/quiz/machine.test.ts
git commit -m "feat(m4): thread profileId through quiz state (outside QuizAnswers)"
```

---

## Task 4: Carry `profileId` from quiz submission into results

**Files:**
- Modify: `src/components/quiz/use-quiz.ts`
- Modify: `src/app/quiz/results/page.tsx`

**Interfaces:**
- Consumes: `QuizState.profileId` (Task 3).
- Produces: `PROFILE_ID_KEY` exported string constant from `use-quiz.ts` (sessionStorage key `"pb.quizProfileId"`); results page reads it and has a `profileId: string | null` available to pass into the `generate` action call (wired in Task 6).

- [ ] **Step 1: Update `use-quiz.ts` to persist profileId on submit**

In `src/components/quiz/use-quiz.ts`, add the new exported key near the existing ones (currently lines 22-24):

```ts
export const STATE_KEY = "pb.quizState";
export const STARTED_KEY = "pb.quizStartedAt";
export const PROFILE_ID_KEY = "pb.quizProfileId";
const ANSWERS_KEY = "pb.quizAnswers";
```

Update `submit()` (currently lines 81-98) to write or clear that key based on `state.profileId`:

```ts
  const submit = useCallback(() => {
    // No state mutation happens here (the quiz is done) — read `state` directly
    // from closure rather than going through a setState updater. Calling
    // router.push() from inside a setState updater triggers React's "cannot
    // update a component while rendering a different component" warning,
    // since the updater can run during the render phase.
    if (!state) return;
    const answers = toQuizAnswers(state);
    if (!answers) return;
    track("quiz_step_completed", { step: currentStep(state) });
    const startedAt = Number(sessionStorage.getItem(STARTED_KEY) ?? Date.now());
    track("quiz_completed", {
      duration_s: Math.round((Date.now() - startedAt) / 1000),
    });
    sessionStorage.setItem(ANSWERS_KEY, JSON.stringify(answers));
    if (state.profileId) {
      sessionStorage.setItem(PROFILE_ID_KEY, state.profileId);
    } else {
      sessionStorage.removeItem(PROFILE_ID_KEY);
    }
    sessionStorage.removeItem(STATE_KEY);
    router.push("/quiz/results");
  }, [state, router]);
```

This is a one-line-of-logic addition to an existing hand-tested flow (no pure function to unit test in isolation — `state.profileId` is already covered by Task 3's machine test, and the sessionStorage read-back is covered by the results-page change below, verified live in the final verification task).

- [ ] **Step 2: Update the results page to read it**

In `src/app/quiz/results/page.tsx`, import the new key and read it alongside answers:

```ts
import { PROFILE_ID_KEY } from "@/components/quiz/use-quiz";
```

Update `readAnswers`'s caller area — add a sibling reader and thread it through. Change the `ResultsPage` component (currently lines 27-51) to also read the profile id, and pass it down:

```ts
function readProfileId(): string | null {
  try {
    return sessionStorage.getItem(PROFILE_ID_KEY);
  } catch {
    return null;
  }
}

export default function ResultsPage() {
  const [answersState, setAnswersState] = useState<AnswersState>({ loaded: false });
  const [profileId, setProfileId] = useState<string | null>(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    if (mountedRef.current) return; // StrictMode double-invoke guard
    mountedRef.current = true;
    setAnswersState({ loaded: true, answers: readAnswers() });
    setProfileId(readProfileId());
  }, []);

  if (!answersState.loaded) return null;

  if (!answersState.answers) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="opacity-70">No quiz answers found.</p>
        <Link href="/quiz" className="rounded-full bg-foreground px-6 py-2.5 text-background">
          Take the quiz
        </Link>
      </main>
    );
  }

  return <ResultsForAnswers answers={answersState.answers} profileId={profileId} />;
}
```

Update `ResultsForAnswers`'s signature (currently line 53) to accept the new prop — full generation-call wiring (passing `profileId` into the `generate` action) happens in Task 6, so for now just accept and hold the prop:

```ts
function ResultsForAnswers({
  answers,
  profileId,
}: {
  answers: QuizAnswers;
  profileId: string | null;
}) {
```

(The `generate` action call inside this function's effect, currently `generate({ quiz: answers, rateLimitKey })`, is updated in Task 6 once the Convex action accepts the new argument — leaving it as-is here keeps this task's diff focused and compiling.)

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors (the `profileId` prop is accepted but not yet consumed by the `generate()` call — that's fine, TypeScript won't flag an unused destructured prop that's merely not passed further yet, since it IS referenced in the function signature).

- [ ] **Step 4: Commit**

```bash
git add src/components/quiz/use-quiz.ts src/app/quiz/results/page.tsx
git commit -m "feat(m4): carry profileId from quiz submission into the results page"
```

---

## Task 5: Wire `profileId` into `profiles/page.tsx`'s prefill call

**Files:**
- Modify: `src/app/profiles/page.tsx`

**Interfaces:**
- Consumes: `ProfileForPrefill.id` (Task 3) — the profile objects rendered on this page are full Convex docs with `_id: Id<"recipientProfiles">`, which satisfies `id: string` structurally once passed through.

- [ ] **Step 1: Update `startBundlesFor`'s parameter type and pass `_id`**

In `src/app/profiles/page.tsx`, update the `startBundlesFor` callback (currently lines 29-40):

```ts
  const startBundlesFor = useCallback(
    (p: {
      _id: Id<"recipientProfiles">;
      relationship: string;
      ageBand: string;
      gender?: string;
      interests: string[];
      notes?: string;
    }) => {
      const country = detectCountry(
        typeof navigator !== "undefined" ? navigator.language : undefined
      );
      const state = profileToQuizState({ id: p._id, ...p }, country, currencyForCountry(country));
      sessionStorage.setItem(STATE_KEY, JSON.stringify(state));
      sessionStorage.setItem(STARTED_KEY, String(Date.now()));
      router.push("/quiz");
    },
    [router]
  );
```

The call site (currently line 136, `onClick={() => startBundlesFor(p)}`) needs no change — `p` there is already the full profile doc from `listMine`, which has `_id`.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors — this was the call site flagged as a transient error at the end of Task 3; it should now be clean.

- [ ] **Step 3: Commit**

```bash
git add src/app/profiles/page.tsx
git commit -m "feat(m4): pass profile id into New-bundles-for-X prefill"
```

---

## Task 6: `generateBundles.generate` — ownership check, past-item lookup, cache-key fold-in, post-generation memory update

**Files:**
- Modify: `convex/generateBundles.ts`
- Modify: `src/app/quiz/results/page.tsx` (finish wiring `profileId` into the `generate()` call, deferred from Task 4)

**Interfaces:**
- Consumes: `internal.recipientProfiles.getByIdInternal`, `internal.recipientProfiles.appendPastItemsInternal` (Task 1); `buildBundlePrompt(answers, pastItemNames)` (Task 2); `profileId` prop on `ResultsForAnswers` (Task 4).
- Produces: `generate` action now accepts `{ quiz, rateLimitKey, profileId?: Id<"recipientProfiles"> }`.

- [ ] **Step 1: Update the action's args and handler**

In `convex/generateBundles.ts`, update the `generate` action (currently lines 104-157):

```ts
export const generate = action({
  args: {
    quiz: quizValidator,
    rateLimitKey: v.string(),
    profileId: v.optional(v.id("recipientProfiles")),
  },
  handler: async (ctx, args): Promise<GenerateResult> => {
    const quiz = args.quiz as QuizAnswers;

    const allowed: boolean = await ctx.runMutation(internal.rateLimit.checkAndConsume, {
      key: args.rateLimitKey,
      max: RATE_LIMIT_MAX,
      windowMs: RATE_LIMIT_WINDOW_MS,
    });
    if (!allowed) return { status: "rate_limited" };

    // If a profileId was supplied, verify the caller actually owns that
    // profile before trusting (or writing to) its past-item memory. A
    // mismatch or missing identity silently falls back to no-profile
    // behaviour rather than failing the whole generation — dedup memory is a
    // nice-to-have, not a security boundary for the bundle itself.
    let verifiedProfileId: Id<"recipientProfiles"> | null = null;
    let pastItemNames: string[] = [];
    if (args.profileId) {
      const identity = await ctx.auth.getUserIdentity();
      if (identity) {
        const profile = await ctx.runQuery(internal.recipientProfiles.getByIdInternal, {
          id: args.profileId,
        });
        if (profile && profile.userId === identity.subject) {
          verifiedProfileId = args.profileId;
          pastItemNames = profile.pastItemNames ?? [];
        }
      }
    }

    const quizHash = hashQuizAnswers(quiz);
    // Fold the profile id into the cache key so a cache hit can never return
    // bundles generated (and thus dedup-checked) for a different profile, or
    // skip a live profile's dedup exclusion — see plan doc for rationale.
    const cacheKey = verifiedProfileId ? `${quizHash}:${verifiedProfileId}` : quizHash;

    const cached = await ctx.runQuery(internal.generationCache.getFresh, {
      quizHash: cacheKey,
      maxAgeMs: CACHE_TTL_MS,
    });
    if (cached) return { status: "ok", bundleIds: cached.bundleIds, cacheHit: true };

    const prompt = buildBundlePrompt(quiz, pastItemNames);

    let raw = await callGemini(prompt);
    let parsed = raw
      ? parseBundleResponse(raw)
      : ({ ok: false, error: "No response from Gemini" } as const);

    if (!parsed.ok) {
      // One retry on invalid/unparseable JSON, per docs/prd.md F2.
      raw = await callGemini(prompt);
      parsed = raw
        ? parseBundleResponse(raw)
        : ({ ok: false, error: "No response from Gemini (retry)" } as const);
    }

    if (!parsed.ok) {
      return { status: "failed", reason: parsed.error };
    }

    const bundleIds: Id<"bundles">[] = await ctx.runMutation(internal.bundles.storeGenerated, {
      quizHash,
      quiz,
      bundles: parsed.bundles,
    });

    await ctx.runMutation(internal.generationCache.store, {
      quizHash: cacheKey,
      bundleIds,
      ttl: CACHE_TTL_MS,
    });

    if (verifiedProfileId) {
      const newItemNames = parsed.bundles.flatMap((b) => b.items.map((item) => item.name));
      await ctx.runMutation(internal.recipientProfiles.appendPastItemsInternal, {
        id: verifiedProfileId,
        itemNames: newItemNames,
      });
    }

    return { status: "ok", bundleIds, cacheHit: false };
  },
});
```

Note: `storeGenerated`'s own `quizHash` field (stored on the `bundles` row, used elsewhere for display/regeneration) intentionally stays the plain `quizHash`, not `cacheKey` — only the `generationCache` lookup/write uses the profile-folded key, since that's the only place a cross-profile collision would matter.

- [ ] **Step 2: Finish wiring the results page's `generate()` call**

In `src/app/quiz/results/page.tsx`, update the effect inside `ResultsForAnswers` (currently around line 68):

```ts
      const rateLimitKey = getOrCreateSessionId();
      const result = await generate({
        quiz: answers,
        rateLimitKey,
        ...(profileId ? { profileId: profileId as Id<"recipientProfiles"> } : {}),
      });
```

Add the `Id` import needed for the cast if not already present — `Id` is already imported at the top of this file (`import type { Id } from "../../../../convex/_generated/dataModel";`), so no new import is needed.

Also update the effect's dependency comment/lint-disable — it currently deliberately runs once on mount (`// eslint-disable-next-line react-hooks/exhaustive-deps`) referencing only `answers`/`generate` as intentionally-omitted deps; `profileId` is now also read inside the effect but is populated synchronously before this effect's first real run (it's set in the same mount effect pass as `answersState`, both fired from the parent's single mount effect before `ResultsForAnswers` receives non-null answers), so no additional dependency handling is needed — leave the existing comment as-is.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Convex schema/function push**

Run: `npx convex dev --once`
Expected: succeeds, no validator errors, generated API types include the updated `generate` args.

- [ ] **Step 5: Regression-check the existing engine/link/quiz unit suite**

Run: `npx vitest run`
Expected: all existing tests still pass (golden fixtures, prompt, hash, prefill, machine, link builder, etc.) — this task didn't touch any of those pure modules' contracts, so this is a pure regression check.

- [ ] **Step 6: Commit**

```bash
git add convex/generateBundles.ts src/app/quiz/results/page.tsx
git commit -m "feat(m4): wire profile-aware dedup into bundle generation"
```

---

## Task 7: Manual live verification + docs closeout

**Files:**
- Modify: `docs/tasks.md` (check off the past-bundle-memory line)
- Modify: `docs/checkpoint.md` (status, change log, next actions)

- [ ] **Step 1: Full automated regression pass**

Run: `npx vitest run` (expect all green) and `npx playwright test --project=chromium` (expect the existing pass rate — this feature adds no new Playwright coverage since, per `tests/e2e/profiles.spec.ts`'s existing note, authed profile flows aren't reachable in this suite without a wired Clerk test token; that gap predates this task and isn't being fixed here).

- [ ] **Step 2: Manual live click-through (documents an owner-or-agent-performed check, matching the pattern used for every other Clerk-gated M4 feature in this project)**

With `npm run dev` and `npx convex dev` both running and signed in as a real Clerk user:
1. Go to `/profiles`, create a profile (e.g. "Test Recipient", any relationship/age/interests).
2. Click "New bundles for Test Recipient", complete the quiz, reach results — 3 bundles generate.
3. Note the item names shown.
4. Go back to `/profiles`, click "New bundles for Test Recipient" again, complete the quiz with the same answers a second time.
5. Confirm the second generation's items don't repeat the first round's item names (a cache hit would incorrectly return the same bundles — the profile-folded cache key from Task 6 prevents that only if the two runs' `QuizAnswers` differ even slightly, e.g. different occasion; if answers are identical, a same-profile-same-answers second run replaying the exact same quiz IS expected to hit cache and return the same bundles, which is correct behavior — dedup applies across genuinely new generations, not identical repeats within the 24h cache window. To exercise the dedup path specifically, pick a different occasion/budget on the second run so it's a fresh Gemini call.)
6. Open the profile's Convex document (via Convex dashboard or `npx convex data recipientProfiles`) and confirm `pastItemNames` now contains item names from the first generation.

- [ ] **Step 3: Update `docs/tasks.md`**

In the "Recipient Profiles (F7)" section, change:

```
- [ ] P1 Past-bundle memory dedupes future suggestions — not started
```

to:

```
- [x] P1 Past-bundle memory dedupes future suggestions — `pastItemNames` on `recipientProfiles`, threaded via `QuizState.profileId` (kept out of `QuizAnswers`/cache hash), `generateBundles.generate` fetches+excludes past items in the prompt and appends new ones after a fresh (non-cached) generation; cache key folds in profileId to prevent a stale hit bypassing dedup
```

- [ ] **Step 4: Update `docs/checkpoint.md`**

In the "Progress by Milestone" table, update the M4 row's Notes cell to append: `; past-bundle memory now live — recipientProfiles.pastItemNames feeds an "avoid repeating" prompt instruction, updated after each fresh (non-cached) generation`.

Add a row to the Change Log table (top of the table, after the header separator):

```
| 2026-07-18 | pending | M4: past-bundle memory — pastItemNames schema field, profileId threaded through quiz state outside QuizAnswers, generateBundles dedup + cache-key fold-in |
```

Add a bullet under "Completed Items ✅" in a new `### This Session (2026-07-18)` section:

```
- [x] M4 past-bundle memory: `recipientProfiles.pastItemNames`, `getByIdInternal`/`appendPastItemsInternal`, `buildBundlePrompt` avoid-repeating instruction, `QuizState.profileId` threading, `generateBundles.generate` ownership-verified dedup + profile-folded cache key
```

- [ ] **Step 5: Final commit**

```bash
git add docs/tasks.md docs/checkpoint.md
git commit -m "docs: mark M4 past-bundle memory complete"
```
