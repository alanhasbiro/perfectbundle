# Warm & Bold Visual Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace PerfectBundle's current pure black/white UI with the approved "warm base, bold accents" visual system (cream/terracotta backgrounds, orange→pink gradient CTAs) across every page, with zero functional/routing/data changes.

**Architecture:** A small set of new CSS custom properties + three reusable Tailwind `@layer components` classes (`.btn-primary`, `.btn-secondary`, `.card-surface`) defined once in `src/app/globals.css`. Because the codebase already channels nearly all color through the two semantic Tailwind tokens `background`/`foreground` (e.g. `bg-foreground`, `text-background`, `border-foreground/20`, `opacity-NN`), most files inherit the new palette automatically just from the token value change — the remaining per-file work is swapping flat black "primary action" buttons for `.btn-primary`, swapping plain-bordered cards for `.card-surface`, and re-theming Clerk's own UI to match.

**Tech Stack:** Next.js App Router, Tailwind CSS v4 (`@theme inline`, `@layer components`), Clerk `appearance` API, Playwright, Vitest.

## Global Constraints

- $0 operating cost — this plan adds no new dependencies, fonts, or services (source: root `CLAUDE.md`).
- No data model, routing, or Convex changes — CSS/component-class edits only (source: spec "Scope").
- Every text/background color pair actually used in the app must be ≥4.5:1 WCAG contrast; this is enforced by a new automated test in Task 1, not left to manual judgment (source: spec "Design Tokens").
- Keep Framer Motion transitions and the existing `prefers-reduced-motion` support in `motion-config-provider.tsx` untouched — this is a palette/component pass, not a new animation system (source: spec "Components & Motion").
- Do not change any visible text, ARIA role, or `data-testid` — the existing Playwright suite (71 passed/6 skipped) asserts against `getByRole`/text content, not class names, and is the primary regression net for this plan (source: spec "Testing/Verification"; confirmed by reading `tests/e2e/landing.spec.ts`).
- AdSense `<ins class="adsbygoogle">` markup itself is untouched (Google-controlled internals) — only the surrounding card spacing may change (source: spec "Scope").

---

### Task 1: Design tokens, contrast test, and reusable component classes

**Files:**
- Modify: `src/app/globals.css` (full replacement of the `:root`, `@theme inline`, dark-mode, and `body` blocks; new `@layer components` block)
- Create: `src/lib/design/contrast.ts`
- Test: `src/lib/design/contrast.test.ts`

**Interfaces:**
- Produces: `contrastRatio(hexA: string, hexB: string): number` (pure function, exported from `src/lib/design/contrast.ts`) — used only by this task's test, not imported elsewhere.
- Produces (CSS): custom properties `--background`, `--foreground`, `--bg-alt`, `--fg-muted`, `--accent-from`, `--accent-to`, `--accent-solid`, `--border`, each exposed as a Tailwind utility-generating theme color (`--color-background`, `--color-bg-alt`, `--color-fg-muted`, `--color-accent-from`, `--color-accent-to`, `--color-accent-solid`, `--color-border`) via `@theme inline`. Produces component classes `.btn-primary`, `.btn-secondary`, `.card-surface` — every later task in this plan uses these three class names and these Tailwind utility names (`bg-bg-alt`, `text-fg-muted`, `text-accent-solid`, `border-accent-solid`, `border-border`, `bg-gradient-to-r from-accent-from to-accent-to`).

All hex values below were verified by WCAG relative-luminance calculation (Node script, not eyeballed) against every real text/background pairing this redesign uses. Do not substitute different hex values without re-running the same check — the first-draft values in early spec review failed this (e.g. white button text on `#F97316` measured 2.80:1, well under the 4.5:1 bar).

- [ ] **Step 1: Write the failing contrast test**

Create `src/lib/design/contrast.test.ts`:

```typescript
import { describe, expect, test } from "vitest";
import { contrastRatio } from "./contrast";

describe("contrastRatio", () => {
  test("white on black is the maximum ratio (21:1)", () => {
    expect(contrastRatio("#FFFFFF", "#000000")).toBeCloseTo(21, 1);
  });

  test("identical colors have a ratio of 1", () => {
    expect(contrastRatio("#FFFBF5", "#FFFBF5")).toBeCloseTo(1, 5);
  });

  test("is symmetric regardless of argument order", () => {
    expect(contrastRatio("#FFFBF5", "#3D2B1F")).toBeCloseTo(
      contrastRatio("#3D2B1F", "#FFFBF5"),
      5
    );
  });
});

describe("PerfectBundle warm palette meets WCAG 4.5:1 for text pairs", () => {
  const AA_TEXT = 4.5;

  const pairs: Array<[label: string, bg: string, fg: string]> = [
    ["light bg / fg", "#FFFBF5", "#3D2B1F"],
    ["light bg-alt / fg", "#FFF1E0", "#3D2B1F"],
    ["light bg / fg-muted", "#FFFBF5", "#7A5C3E"],
    ["light bg-alt / fg-muted", "#FFF1E0", "#7A5C3E"],
    ["light bg / accent-solid", "#FFFBF5", "#C2410C"],
    ["light bg-alt / accent-solid", "#FFF1E0", "#C2410C"],
    ["dark bg / fg", "#1A1210", "#FBE9D8"],
    ["dark bg-alt / fg", "#241813", "#FBE9D8"],
    ["dark bg / fg-muted", "#1A1210", "#C9A47C"],
    ["dark bg-alt / fg-muted", "#241813", "#C9A47C"],
    ["dark bg / accent-solid", "#1A1210", "#FB923C"],
    ["dark bg-alt / accent-solid", "#241813", "#FB923C"],
    ["btn-primary: white text / accent-from", "#FFFFFF", "#C2410C"],
    ["btn-primary: white text / accent-to", "#FFFFFF", "#BE185D"],
  ];

  test.each(pairs)("%s is >= 4.5:1", (_label, bg, fg) => {
    expect(contrastRatio(bg, fg)).toBeGreaterThanOrEqual(AA_TEXT);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/lib/design/contrast.test.ts`
Expected: FAIL — `Cannot find module './contrast'` (the module doesn't exist yet).

- [ ] **Step 3: Implement `contrastRatio`**

Create `src/lib/design/contrast.ts`:

```typescript
function srgbChannelToLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function relativeLuminance(hex: string): number {
  const normalized = hex.replace("#", "");
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return (
    0.2126 * srgbChannelToLinear(r) +
    0.7152 * srgbChannelToLinear(g) +
    0.0722 * srgbChannelToLinear(b)
  );
}

/** WCAG 2.x contrast ratio between two hex colors, in the range [1, 21]. */
export function contrastRatio(hexA: string, hexB: string): number {
  const lumA = relativeLuminance(hexA);
  const lumB = relativeLuminance(hexB);
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return (lighter + 0.05) / (darker + 0.05);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/lib/design/contrast.test.ts`
Expected: PASS — all cases green, including every pair in the `test.each` table.

- [ ] **Step 5: Replace `src/app/globals.css`**

Full file contents:

```css
@import "tailwindcss";

:root {
  --background: #FFFBF5;
  --foreground: #3D2B1F;
  --bg-alt: #FFF1E0;
  --fg-muted: #7A5C3E;
  --accent-from: #C2410C;
  --accent-to: #BE185D;
  --accent-solid: #C2410C;
  --border: #FFE0BE;
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-bg-alt: var(--bg-alt);
  --color-fg-muted: var(--fg-muted);
  --color-accent-from: var(--accent-from);
  --color-accent-to: var(--accent-to);
  --color-accent-solid: var(--accent-solid);
  --color-border: var(--border);
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
}

@media (prefers-color-scheme: dark) {
  :root {
    --background: #1A1210;
    --foreground: #FBE9D8;
    --bg-alt: #241813;
    --fg-muted: #C9A47C;
    --accent-solid: #FB923C;
    --border: #3A2A20;
  }
}

body {
  background: var(--background);
  color: var(--foreground);
  font-family: var(--font-sans), Arial, Helvetica, sans-serif;
}

@layer components {
  .btn-primary {
    @apply rounded-full px-6 py-3 text-sm font-bold text-white shadow-md transition hover:opacity-90 disabled:opacity-40;
    background-image: linear-gradient(135deg, var(--accent-from), var(--accent-to));
  }

  .btn-secondary {
    @apply rounded-full border border-border px-4 py-1.5 text-xs font-medium text-accent-solid transition hover:border-accent-solid disabled:opacity-40;
  }

  .card-surface {
    @apply rounded-2xl border border-border bg-bg-alt;
  }
}
```

Note: `body` previously hardcoded `font-family: Arial, Helvetica, sans-serif`, silently overriding the Geist Sans variable loaded via `next/font` in `layout.tsx`. This fixes that — `var(--font-sans)` now resolves first.

- [ ] **Step 6: Manually verify the dev server renders without CSS errors**

Run: `npm run dev` (if not already running), then load `http://localhost:3000/` in a browser.
Expected: page loads with the new cream background and warm brown text — no Tailwind build errors in the terminal, no unstyled-content flash.

- [ ] **Step 7: Commit**

```bash
git add src/app/globals.css src/lib/design/contrast.ts src/lib/design/contrast.test.ts
git commit -m "feat(design): add warm palette tokens, component classes, contrast test"
```

---

### Task 2: Landing page + site header

**Files:**
- Modify: `src/app/page.tsx` (full file)
- Modify: `src/components/site-header.tsx` (full file)

**Interfaces:**
- Consumes: `.btn-primary` class from Task 1.

- [ ] **Step 1: Update the landing page's CTA to `.btn-primary`**

In `src/app/page.tsx`, replace the `Link` for "Start the quiz":

```tsx
        <Link
          href="/quiz"
          className="btn-primary"
        >
          Start the quiz
        </Link>
```

(Was: `className="rounded-full bg-foreground px-8 py-3 text-background transition hover:opacity-85"`.)

- [ ] **Step 2: Update the site header's Sign up button to `.btn-primary`**

In `src/components/site-header.tsx`, replace the `SignUpButton`'s inner `button`:

```tsx
          <SignUpButton>
            <button className="btn-primary px-4 py-1.5 text-xs">
              Sign up
            </button>
          </SignUpButton>
```

(Was: `className="rounded-full bg-foreground px-4 py-1.5 text-background transition hover:opacity-85"`. The `px-4 py-1.5 text-xs` after `btn-primary` override that class's default padding/size for this smaller nav-bar context — later utility classes win ties in Tailwind's cascade layer when both are in `@layer components`/utilities, but to guarantee this, order the class string with `btn-primary` first as shown.)

- [ ] **Step 3: Update the site header's signed-in nav links to use `accent-solid` on hover**

In `src/components/site-header.tsx`, update the two `Link`s inside `<Show when="signed-in">`:

```tsx
          <Link href="/my-bundles" className="opacity-70 transition hover:text-accent-solid hover:opacity-100">
            My bundles
          </Link>
          <Link href="/profiles" className="opacity-70 transition hover:text-accent-solid hover:opacity-100">
            Profiles
          </Link>
```

(Was: `className="opacity-70 hover:opacity-100"` on both — adding `transition hover:text-accent-solid` gives the new accent color a visible role in navigation, not just buttons.)

- [ ] **Step 4: Run the landing E2E test to confirm no regression**

Run: `npx playwright test tests/e2e/landing.spec.ts`
Expected: PASS — all 3 tests green (these assert on heading text and link roles, unaffected by class changes).

- [ ] **Step 5: Commit**

```bash
git add src/app/page.tsx src/components/site-header.tsx
git commit -m "feat(design): apply warm CTA styling to landing page and header"
```

---

### Task 3: Quiz wizard, step shell, and choice chip

**Files:**
- Modify: `src/components/quiz/quiz-wizard.tsx:30-36,53-70` (progress bar + Next/Back buttons)
- Modify: `src/components/quiz/choice-chip.tsx` (full file)
- Modify: `src/components/quiz/steps/urgency-step.tsx:23-27` (selected-state styling)

**Interfaces:**
- Consumes: `.btn-primary` class, `bg-gradient-to-r from-accent-from to-accent-to`, `border-accent-solid`/`bg-accent-solid` utilities from Task 1.

- [ ] **Step 1: Update the quiz progress bar fill to the gradient**

In `src/components/quiz/quiz-wizard.tsx`, replace the progress bar `motion.div`:

```tsx
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-accent-from to-accent-to"
          animate={{ width: `${Math.max(progressValue * 100, 4)}%` }}
          transition={{ duration: 0.4 }}
        />
```

(Was: `className="h-full rounded-full bg-foreground"`. The track div above it, `className="mb-8 h-1.5 w-full overflow-hidden rounded-full bg-foreground/10"`, is left unchanged — it inherits the new warm foreground automatically via the token change in Task 1.)

- [ ] **Step 2: Update the "Next"/"Build my bundles" button to `.btn-primary`**

In `src/components/quiz/quiz-wizard.tsx`, replace the second button in the bottom nav row:

```tsx
        <button
          type="button"
          onClick={isLastStep ? submit : goNext}
          disabled={!canGoNext}
          className="btn-primary px-8 py-3"
        >
          {isLastStep ? "Build my bundles" : "Next"}
        </button>
```

(Was: `className="rounded-full bg-foreground px-8 py-3 text-background transition hover:opacity-85 disabled:opacity-30"`. The "← Back" button above it is left unchanged — `className="rounded-full px-5 py-2.5 text-sm opacity-70 transition hover:opacity-100 disabled:invisible"` already has no hardcoded color, so it inherits the warm foreground automatically.)

- [ ] **Step 3: Update `ChoiceChip`'s selected state to use `accent-solid`**

Replace `src/components/quiz/choice-chip.tsx` in full:

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
          ? "border-accent-solid bg-accent-solid text-white"
          : "border-foreground/20 hover:border-foreground/50"
      }`}
    >
      {label}
    </button>
  );
}
```

(Was: `selected ? "border-foreground bg-foreground text-background" : ...`.)

- [ ] **Step 4: Update `UrgencyStep`'s selected-option styling to match**

In `src/components/quiz/steps/urgency-step.tsx`, update the `className` template inside the `.map`:

```tsx
            className={`rounded-xl border px-4 py-3 text-left transition ${
              state.answers.urgency === o.value
                ? "border-accent-solid bg-accent-solid/10"
                : "border-foreground/20 hover:border-foreground/50"
            }`}
```

(Was: `state.answers.urgency === o.value ? "border-foreground bg-foreground/5" : ...`. This keeps `UrgencyStep`'s own custom selected-state pattern — it doesn't use `ChoiceChip` — visually consistent with the new accent language used everywhere else a "selected" state exists.)

- [ ] **Step 5: Run the quiz flow E2E test to confirm no regression**

Run: `npx playwright test tests/e2e/quiz-flow.spec.ts`
Expected: PASS — 8/8 (this test drives the quiz via visible labels/roles, not classes).

- [ ] **Step 6: Commit**

```bash
git add src/components/quiz/quiz-wizard.tsx src/components/quiz/choice-chip.tsx src/components/quiz/steps/urgency-step.tsx
git commit -m "feat(design): apply warm accent styling to quiz wizard, chips, and urgency step"
```

---

### Task 4: BundleCard and SaveButton

**Files:**
- Modify: `src/components/bundles/bundle-card.tsx:104-241`
- Modify: `src/components/bundles/save-button.tsx:56-69`

**Interfaces:**
- Consumes: `.btn-primary`, `.btn-secondary`, `.card-surface` classes from Task 1.
- No signature changes — both components keep their existing props.

- [ ] **Step 1: Update the outer card and inner item styling in `BundleCard`**

In `src/components/bundles/bundle-card.tsx`, update the `<article>` wrapper:

```tsx
    <article
      data-testid={bundleId ? `bundle-card-${bundleId}` : undefined}
      className="card-surface flex flex-col gap-4 p-6"
    >
```

(Was: `className="flex flex-col gap-4 rounded-2xl border border-foreground/15 p-6"`.)

Update the inner item `<li>` (inside the `.map`) so it visually nests inside the now-tinted card instead of matching it exactly:

```tsx
            <li key={item.name} className="rounded-xl border border-border bg-background p-4">
```

(Was: `className="rounded-xl border border-foreground/10 p-4"`. `bg-background` — the page's base cream, lighter than the card's `--bg-alt` — creates a visible card-in-card layer instead of a flat single tint.)

- [ ] **Step 2: Update the Share/Regenerate buttons to `.btn-secondary`**

Replace the Share button:

```tsx
            <button
              type="button"
              onClick={handleShare}
              disabled={shareState === "sharing"}
              className="btn-secondary"
            >
              {shareState === "copied" ? "Link copied!" : "Share"}
            </button>
```

Replace the Regenerate button:

```tsx
            <button
              type="button"
              onClick={handleRegenerate}
              disabled={regenerating}
              className="btn-secondary"
            >
              {regenerating ? "Regenerating…" : "🔄 Regenerate"}
            </button>
```

(Both were `className="rounded-full border border-foreground/20 px-3 py-1.5 text-xs transition hover:border-foreground/50 [disabled:opacity-50]"` — `.btn-secondary` already includes matching padding/border/disabled-opacity, so no extra utility classes are needed here.)

- [ ] **Step 3: Update the primary "Buy" link to `.btn-primary`**

```tsx
                {item.productUrl ? (
                  <a
                    href={item.productUrl}
                    target="_blank"
                    rel="noopener noreferrer sponsored"
                    onClick={() => onLinkClick?.(item.productMerchant ?? "sovrn", item)}
                    className="btn-primary px-3 py-1.5 text-xs"
                  >
                    Buy{item.productMerchant ? ` at ${item.productMerchant}` : ""}
                  </a>
                ) : null}
```

(Was: `className="rounded-full bg-foreground px-3 py-1.5 text-xs text-background transition hover:opacity-85"`.)

- [ ] **Step 4: Update the fallback retailer links and "Show me another" button to `.btn-secondary`**

```tsx
                {links.map((link) => (
                  <a
                    key={link.retailer}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => onLinkClick?.(link.retailer, item)}
                    className="btn-secondary"
                  >
                    {item.productUrl ? `Or ${link.label}` : link.label}
                  </a>
                ))}
                {bundleId ? (
                  <button
                    type="button"
                    onClick={() => handleSwapItem(bundleId, itemIndex, item.name)}
                    disabled={swappingIndex === itemIndex}
                    className="btn-secondary"
                  >
                    {swappingIndex === itemIndex ? "Swapping…" : "🔄 Show me another"}
                  </button>
                ) : null}
```

(Retailer links were `className="rounded-full border border-foreground/20 px-3 py-1.5 text-xs transition hover:border-foreground/50"`; the swap button was the same plus `opacity-70 ... hover:opacity-100 disabled:opacity-40` — dropping the extra opacity dimming since `.btn-secondary` already reads as visually secondary via its outline style, matching how Share/Regenerate now look.)

- [ ] **Step 5: Update `SaveButton`'s saved (`✓`) state to use `accent-solid`**

In `src/components/bundles/save-button.tsx`, update the `SavedToggle` button's `className`:

```tsx
      className={`${BASE_CLASS} ${
        saved
          ? "border-accent-solid bg-accent-solid text-white"
          : "border-foreground/20 hover:border-foreground/50"
      }`}
```

(Was: `saved ? "border-foreground/50 bg-foreground text-background" : ...`. The signed-out `SignInButton`-wrapped variant above it, `className={`${BASE_CLASS} border-foreground/20 hover:border-foreground/50`}`, is left unchanged — it already matches the unsaved styling.)

- [ ] **Step 6: Run the affiliate-buy and saved-bundles E2E tests to confirm no regression**

Run: `npx playwright test tests/e2e/affiliate-buy.spec.ts tests/e2e/saved-bundles.spec.ts`
Expected: PASS — these exercise the Buy button and Save toggle by role/text, unaffected by class changes.

- [ ] **Step 7: Commit**

```bash
git add src/components/bundles/bundle-card.tsx src/components/bundles/save-button.tsx
git commit -m "feat(design): apply warm card/button styling to BundleCard and SaveButton"
```

---

### Task 5: Results, trending, and popular pages

**Files:**
- Modify: `src/app/quiz/results/page.tsx:55,169` (two `bg-foreground` CTA links)
- Modify: `src/app/trending/page.tsx` (no direct button changes needed — verify only)
- Modify: `src/app/popular/page.tsx` (no direct button changes needed — verify only)

**Interfaces:**
- Consumes: `.btn-primary` class from Task 1. `BundleCard` (Task 4) already covers every card rendered by these three pages.

These three pages render bundles exclusively through `BundleCard` (already restyled in Task 4) and use `opacity-NN`/plain text for their own copy, which inherits the new palette automatically from Task 1's token change — no edits needed there. The only two hardcoded-black elements outside `BundleCard` on these pages are both on the results page.

- [ ] **Step 1: Update the "no answers found" CTA on `/quiz/results`**

In `src/app/quiz/results/page.tsx`, inside `ResultsPage`'s early-return block:

```tsx
        <Link href="/quiz" className="btn-primary">
          Take the quiz
        </Link>
```

(Was: `className="rounded-full bg-foreground px-6 py-2.5 text-background"`.)

- [ ] **Step 2: Update the `<h1>` on the success state to use the accent-aware default (no-op verification)**

`<h1 className="text-3xl font-semibold">Your gift bundles 🎁</h1>` at line 178 needs no class change — it has no hardcoded color, so it already renders in the new warm foreground. Confirm this visually in Step 4 below rather than editing.

- [ ] **Step 3: Verify `trending/page.tsx` and `popular/page.tsx` need no direct edits**

Read both files' full `<main>` JSX and confirm every element either (a) renders through `BundleCard` (restyled in Task 4), (b) is an `AdUnit` (explicitly out of scope), or (c) uses only `opacity-NN`/unstyled text (inherits automatically). If any hardcoded `bg-foreground`/`text-background`/`border-foreground` pattern is found outside those categories, apply the same `.btn-primary`/`.btn-secondary` substitution pattern used in Task 4 Steps 2–4 before proceeding.

- [ ] **Step 4: Manually verify all three pages in the browser**

Run: `npm run dev` (if not already running).
Visit `/quiz/results` (with no `sessionStorage` answers set, to see the empty state), `/trending`, and `/popular`.
Expected: cream/warm backgrounds throughout, gradient CTA on the results empty-state link, `BundleCard`s show the new card-surface/nested-item styling from Task 4.

- [ ] **Step 5: Run the trending and popular E2E tests to confirm no regression**

Run: `npx playwright test tests/e2e/trending.spec.ts tests/e2e/popular.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/quiz/results/page.tsx
git commit -m "feat(design): apply warm CTA styling to quiz results empty state"
```

(If Step 3 found edits needed in `trending/page.tsx` or `popular/page.tsx`, `git add` those files too before committing.)

---

### Task 6: Share page, profiles, and my-bundles

**Files:**
- Modify: `src/app/b/[id]/page.tsx:48,59` (not-found CTA + heading verification)
- Modify: `src/app/profiles/page.tsx:53-63,65-172`
- Modify: `src/app/my-bundles/page.tsx:17-29,41-49`

**Interfaces:**
- Consumes: `.btn-primary`, `.card-surface` classes from Task 1.

- [ ] **Step 1: Update the share page's "not found" and "build your own" CTAs**

In `src/app/b/[id]/page.tsx`, the not-found block:

```tsx
        <Link href="/quiz" className="btn-primary">
          Build your own
        </Link>
```

(Was: `className="rounded-full bg-foreground px-6 py-2.5 text-background"`. The success-state `<h1>` and the "Build your own bundle →" text link below the card both use only `opacity-NN`/no hardcoded color, so they need no edit — verify visually in Step 6.)

- [ ] **Step 2: Update `profiles/page.tsx`'s three sign-in/create/new-bundles buttons to `.btn-primary`**

Signed-out sign-in button:

```tsx
        <SignInButton mode="modal">
          <button className="btn-primary">
            Sign in
          </button>
        </SignInButton>
```

"+ New profile" button:

```tsx
          <button
            type="button"
            onClick={() => {
              setAdding(true);
              setEditingId(null);
            }}
            className="btn-primary px-4 py-2 text-sm"
          >
            + New profile
          </button>
```

"New bundles for {p.name}" button:

```tsx
                <button
                  type="button"
                  onClick={() => startBundlesFor(p)}
                  className="btn-primary px-4 py-1.5 text-xs"
                >
                  New bundles for {p.name}
                </button>
```

- [ ] **Step 3: Update `profiles/page.tsx`'s Edit/Delete buttons to `.btn-secondary`**

```tsx
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(p._id);
                    setAdding(false);
                  }}
                  className="btn-secondary"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => remove({ id: p._id })}
                  className="btn-secondary"
                >
                  Delete
                </button>
```

(Both were `className="rounded-full border border-foreground/20 px-4 py-1.5 text-xs transition hover:border-foreground/50 [opacity-70 hover:opacity-100 on Delete]"`.)

- [ ] **Step 4: Update `profiles/page.tsx`'s profile card to `.card-surface`**

```tsx
            <article
              key={p._id}
              className="card-surface flex flex-col gap-3 p-6"
            >
```

(Was: `className="flex flex-col gap-3 rounded-2xl border border-foreground/15 p-6"`.)

- [ ] **Step 5: Update `my-bundles/page.tsx`'s sign-in and empty-state CTAs to `.btn-primary`**

Signed-out sign-in button:

```tsx
        <SignInButton mode="modal">
          <button className="btn-primary">
            Sign in
          </button>
        </SignInButton>
```

Empty-state "Take the quiz" link:

```tsx
          <Link
            href="/quiz"
            className="btn-primary"
          >
            Take the quiz
          </Link>
```

- [ ] **Step 6: Manually verify all three pages in the browser**

Run: `npm run dev` (if not already running).
Visit `/b/some-invalid-id` (not-found state), `/profiles` (both signed-out and signed-in, including the "+ New profile" form and an existing profile card), `/my-bundles` (both signed-out and empty signed-in states).
Expected: gradient CTAs, `.card-surface`-styled profile cards, warm background throughout — no layout breakage.

- [ ] **Step 7: Run the profiles and saved-bundles E2E tests to confirm no regression**

Run: `npx playwright test tests/e2e/profiles.spec.ts tests/e2e/saved-bundles.spec.ts tests/e2e/share.spec.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add "src/app/b/[id]/page.tsx" src/app/profiles/page.tsx src/app/my-bundles/page.tsx
git commit -m "feat(design): apply warm styling to share, profiles, and my-bundles pages"
```

---

### Task 7: Clerk auth UI theming

**Files:**
- Modify: `src/app/layout.tsx:51` (`<ClerkProvider>` → add `appearance` prop)

**Interfaces:**
- Consumes: none new — references the same CSS custom properties from Task 1 via `var(...)` strings, which resolve through the live cascade so light/dark mode stay automatically in sync (same mechanism the rest of the site already relies on).

- [ ] **Step 1: Add an `appearance` prop to `ClerkProvider`**

In `src/app/layout.tsx`, change:

```tsx
        <ClerkProvider>
```

to:

```tsx
        <ClerkProvider
          appearance={{
            variables: {
              colorPrimary: "var(--accent-solid)",
              colorBackground: "var(--background)",
              colorText: "var(--foreground)",
              colorTextSecondary: "var(--fg-muted)",
              colorInputBackground: "var(--background)",
              colorInputText: "var(--foreground)",
              borderRadius: "0.75rem",
            },
          }}
        >
```

- [ ] **Step 2: Manually verify Clerk's UI picks up the theme**

Run: `npm run dev` (if not already running).
Visit `/sign-in` and `/sign-up`, and open the `UserButton` menu while signed in.
Expected: Clerk's form background/text match the site's cream/warm-brown palette, and its primary button (e.g. "Continue") uses the orange accent instead of Clerk's default indigo. Toggle OS dark mode and confirm it switches too (same `var()` reference resolves against the updated `:root` values).

- [ ] **Step 3: Run the auth-flow E2E test to confirm no regression**

Run: `npx playwright test tests/e2e/auth-flow.spec.ts`
Expected: PASS — this test drives Clerk's sign-in via `@clerk/testing`'s API-level helper, not visual assertions, so restyling Clerk's own components doesn't affect it.

- [ ] **Step 4: Commit**

```bash
git add src/app/layout.tsx
git commit -m "feat(design): theme Clerk auth UI to match the warm palette"
```

---

### Task 8: Full verification pass

**Files:** none (verification only — no code changes expected; if any step below surfaces a real regression, fix it in the relevant file from Tasks 1–7 and re-run from that step)

- [ ] **Step 1: Run the full Vitest suite**

Run: `npm test`
Expected: PASS, 132+ tests (132 pre-existing + the new contrast tests from Task 1).

- [ ] **Step 2: Run `tsc` to confirm no type errors**

Run: `npx tsc --noEmit`
Expected: no output (clean).

- [ ] **Step 3: Run the full Playwright suite**

Run: `npx playwright test`
Expected: PASS at the pre-existing bar — 71 passed / 6 skipped (same counts as the last verified baseline; investigate any new failure before proceeding).

- [ ] **Step 4: Re-run the Lighthouse mobile audit against a production build**

Run: `npm run build && npm run start` (in one terminal, leave running), then in another terminal use the same Puppeteer + Lighthouse Node API approach documented in `docs/handover.md` §3 ("Lighthouse's CLI always audits in a fresh, storage-isolated browsing context") to audit `/`, `/quiz`, and `/quiz/results`.
Expected: Accessibility stays at 100 on `/quiz/results` and `/quiz`. Performance does not regress below the existing baseline (94 on `/quiz/results`, 74 on `/quiz` — the `/quiz` ceiling is Clerk-dev-keys-related and untouched by this plan, so it should hold, not drop further).

- [ ] **Step 5: Update `docs/checkpoint.md` and `docs/handover.md`**

Per `CLAUDE.md`'s "ALWAYS update `docs/checkpoint.md` before commits" rule and `docs/handover.md` §0's standing instruction: add an entry to `docs/checkpoint.md`'s change log describing the redesign (palette tokens, component classes, pages touched, verification results from Steps 1–4), and refresh `docs/handover.md` §1 ("What's built and live") with a one-line summary plus a pointer to this plan and the spec.

- [ ] **Step 6: Commit the docs update**

```bash
git add docs/checkpoint.md docs/handover.md
git commit -m "docs: record warm & bold visual redesign completion"
```

---

## Self-Review Notes

- **Spec coverage:** Design tokens (Task 1), components/motion (Tasks 2–7, motion explicitly untouched per Global Constraints), scope — every page listed in the spec's "Scope" section has a task (landing/header: Task 2; quiz wizard: Task 3; BundleCard, propagating to results/trending/popular/share/my-bundles: Task 4; results/trending/popular page-level elements: Task 5; share/profiles/my-bundles page-level elements: Task 6; Clerk: Task 7), verification (Task 8) — all covered.
- **Placeholder scan:** no TBD/TODO; every step shows complete before/after code, not descriptions.
- **Type consistency:** `contrastRatio(hexA: string, hexB: string): number` signature is identical between its Task 1 implementation and its only consumer (the Task 1 test) — no other task imports it. Class names (`btn-primary`, `btn-secondary`, `card-surface`) are used identically (exact string match) across Tasks 2–7.
