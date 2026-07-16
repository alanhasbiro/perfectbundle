# M1 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A deployed Next.js + Convex skeleton on Vercel with the data schema live, 5 seeded curated bundles, PostHog page-view analytics, and green CI.

**Architecture:** Next.js App Router frontend on Vercel; Convex hosts the DB/schema; Zod schemas in `src/lib/engine/` define bundle shapes shared by (future) engine and seed data; PostHog initialized via `instrumentation-client.ts`, env-gated so the app runs with zero keys configured.

**Tech Stack:** Next.js (App Router, TS, Tailwind), Convex, Zod, posthog-js, Framer Motion, Vitest, GitHub Actions, Vercel.

## Global Constraints

- **$0 cost:** every service on permanent free tier (Vercel hobby, Convex free, PostHog free). No paid anything.
- All env-dependent code must degrade gracefully when keys are absent (app builds and runs with no `.env.local`).
- `src/lib/engine/` and (later) `src/lib/links/` must stay free of React/Next imports (mobile reuse).
- Analytics event names come only from `docs/prd.md` §2.3.
- Commit `convex/_generated/` to the repo (CI typechecks without Convex CLI auth).
- Windows dev machine: commands below are PowerShell-safe.
- **USER CHECKPOINT** steps need the owner's browser/accounts (Convex login, GitHub repo, Vercel) — pause and ask.

---

### Task 1: Scaffold Next.js app into the existing repo

**Files:**
- Create: entire Next.js scaffold (`src/app/*`, `package.json`, `tsconfig.json`, `next.config.ts`, `.gitignore`, …) at repo root
- Repo already contains `docs/`, `CLAUDE.md`, `.git/` — must survive untouched.

**Interfaces:**
- Produces: working `npm run dev` / `npm run build`; `@/*` path alias to `src/*`.

- [ ] **Step 1: Scaffold into temp dir (create-next-app refuses non-empty dirs)**

```powershell
npx create-next-app@latest tmp-scaffold --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm
```
Accept defaults for any remaining prompts (Turbopack: yes is fine).

- [ ] **Step 2: Move scaffold contents to repo root**

```powershell
robocopy tmp-scaffold . /E /MOVE /NFL /NDL
```
Note: robocopy exit codes 0–7 are success (1 = files copied). Confirm `tmp-scaffold` is gone and `package.json` is at root.

- [ ] **Step 3: Verify build**

```powershell
npm install; npm run build
```
Expected: build succeeds.

- [ ] **Step 4: Add typecheck script**

In `package.json` scripts add:
```json
"typecheck": "tsc --noEmit"
```
Run `npm run typecheck` — expected: passes.

- [ ] **Step 5: Commit**

```powershell
git add -A; git commit -m "feat: scaffold Next.js app (App Router, TS, Tailwind)"
```

---

### Task 2: Vitest test infrastructure

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json` (test script, devDependency)

**Interfaces:**
- Produces: `npm test` runs all `src/**/*.test.ts` + `convex/**/*.test.ts` in node env.

- [ ] **Step 1: Install**

```powershell
npm install -D vitest
```

- [ ] **Step 2: Create `vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "convex/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
});
```

- [ ] **Step 3: Add script**

In `package.json` scripts:
```json
"test": "vitest run"
```

- [ ] **Step 4: Verify runner works (expect "no test files found" failure)**

Run: `npm test`
Expected: exits non-zero with "No test files found" — that's correct; first real test arrives in Task 3. Add `--passWithNoTests` to the script so CI is green until then:
```json
"test": "vitest run --passWithNoTests"
```
Re-run `npm test` — expected: PASS (0 tests).

- [ ] **Step 5: Commit**

```powershell
git add -A; git commit -m "chore: add Vitest test infrastructure"
```

---

### Task 3: Bundle Zod schemas + curated seed data (TDD)

**Files:**
- Create: `src/lib/engine/schemas.ts`, `src/lib/engine/schemas.test.ts`, `convex/seedData.ts`

**Interfaces:**
- Produces: `bundleItemSchema`, `bundleContentSchema` (theme/rationale/estTotal/items[3..6]), `curatedBundleSchema` (extends content with title, season?, priceBand, approved, sortWeight); `seedCuratedBundles: CuratedBundle[]` (5 entries). Later tasks (M2 engine) parse Gemini output with `bundleContentSchema`.

- [ ] **Step 1: Install Zod**

```powershell
npm install zod
```

- [ ] **Step 2: Write the failing test — `src/lib/engine/schemas.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { bundleItemSchema, bundleContentSchema, curatedBundleSchema } from "./schemas";
import { seedCuratedBundles } from "../../../convex/seedData";

const validItem = {
  name: "Ceramic pour-over set",
  description: "A simple one-cup ceramic dripper with matching mug.",
  why: "Slows the morning down — perfect for a coffee-lover who savors ritual.",
  estPriceRange: "$18–25",
  searchQuery: "ceramic pour over coffee dripper set",
  tags: ["coffee", "home"],
};

const validContent = {
  theme: "The Coffee Ritual",
  rationale: "Everything needed for a slow, luxurious coffee morning.",
  estTotal: "$45–60",
  items: [validItem, validItem, validItem],
};

describe("bundleItemSchema", () => {
  it("accepts a valid item", () => {
    expect(bundleItemSchema.safeParse(validItem).success).toBe(true);
  });
  it("rejects an empty searchQuery", () => {
    expect(bundleItemSchema.safeParse({ ...validItem, searchQuery: "" }).success).toBe(false);
  });
});

describe("bundleContentSchema", () => {
  it("accepts 3–6 items", () => {
    expect(bundleContentSchema.safeParse(validContent).success).toBe(true);
  });
  it("rejects fewer than 3 items", () => {
    expect(bundleContentSchema.safeParse({ ...validContent, items: [validItem, validItem] }).success).toBe(false);
  });
  it("rejects more than 6 items", () => {
    expect(bundleContentSchema.safeParse({ ...validContent, items: Array(7).fill(validItem) }).success).toBe(false);
  });
});

describe("seed data", () => {
  it("contains 5 curated bundles, all valid and approved", () => {
    expect(seedCuratedBundles).toHaveLength(5);
    for (const b of seedCuratedBundles) {
      const parsed = curatedBundleSchema.safeParse(b);
      expect(parsed.success, `invalid: ${b.title} ${JSON.stringify(parsed.success ? "" : parsed.error.issues)}`).toBe(true);
      expect(b.approved).toBe(true);
    }
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — cannot resolve `./schemas` / `seedData`.

- [ ] **Step 4: Write `src/lib/engine/schemas.ts`**

```typescript
import { z } from "zod";

// NOTE: keep this file free of React/Next imports — reused by mobile later.

export const bundleItemSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  why: z.string().min(1),
  estPriceRange: z.string().min(1),
  searchQuery: z.string().min(1),
  tags: z.array(z.string().min(1)).min(1),
});

export const bundleContentSchema = z.object({
  theme: z.string().min(1),
  rationale: z.string().min(1),
  estTotal: z.string().min(1),
  items: z.array(bundleItemSchema).min(3).max(6),
});

export const curatedBundleSchema = bundleContentSchema.extend({
  title: z.string().min(1),
  season: z.string().optional(),
  priceBand: z.string().min(1),
  approved: z.boolean(),
  sortWeight: z.number(),
});

export type BundleItem = z.infer<typeof bundleItemSchema>;
export type BundleContent = z.infer<typeof bundleContentSchema>;
export type CuratedBundle = z.infer<typeof curatedBundleSchema>;
```

- [ ] **Step 5: Write `convex/seedData.ts`** — 5 dev curated bundles (3 items each, terse honest copy):

```typescript
import type { CuratedBundle } from "../src/lib/engine/schemas";

export const seedCuratedBundles: CuratedBundle[] = [
  {
    title: "The Coffee Ritual",
    theme: "Slow coffee mornings",
    rationale: "For someone who treats coffee as a ceremony, not caffeine delivery.",
    estTotal: "$45–60",
    priceBand: "under-75",
    approved: true,
    sortWeight: 100,
    items: [
      { name: "Ceramic pour-over dripper set", description: "One-cup ceramic dripper with matching mug.", why: "Turns the morning cup into a ritual.", estPriceRange: "$18–25", searchQuery: "ceramic pour over coffee dripper set", tags: ["coffee", "home"] },
      { name: "Single-origin coffee sampler", description: "Three small bags from different regions.", why: "Lets them taste their way around the world.", estPriceRange: "$15–20", searchQuery: "single origin coffee sampler gift", tags: ["coffee", "food"] },
      { name: "Gooseneck pouring kettle", description: "Small stovetop kettle with precision spout.", why: "The tool that makes pour-over actually work.", estPriceRange: "$20–30", searchQuery: "gooseneck pour over kettle stovetop", tags: ["coffee", "kitchen"] },
    ],
  },
  {
    title: "The Cozy Reader",
    theme: "A perfect reading night in",
    rationale: "Everything a book lover needs to disappear for an evening.",
    estTotal: "$40–55",
    priceBand: "under-75",
    approved: true,
    sortWeight: 90,
    items: [
      { name: "Rechargeable book light", description: "Clip-on warm-light lamp for reading in bed.", why: "Reading after everyone's asleep, guilt-free.", estPriceRange: "$12–18", searchQuery: "rechargeable clip on book reading light warm", tags: ["reading", "gadgets"] },
      { name: "Herbal tea gift tin", description: "Caffeine-free evening blends in a keepsake tin.", why: "The right companion for a long chapter.", estPriceRange: "$14–20", searchQuery: "herbal tea sampler gift tin", tags: ["tea", "food"] },
      { name: "Chunky knit throw blanket", description: "Soft oversized blanket for the reading chair.", why: "Cozy is a requirement, not a luxury.", estPriceRange: "$25–35", searchQuery: "chunky knit throw blanket soft", tags: ["home", "cozy"] },
    ],
  },
  {
    title: "New Parent Survival Kit",
    theme: "Comfort for exhausted new parents",
    rationale: "Gifts for the parents, not the baby — they need it more.",
    estTotal: "$50–70",
    priceBand: "under-75",
    approved: true,
    sortWeight: 80,
    items: [
      { name: "Insulated self-heating mug", description: "Temperature-holding mug for forgotten coffees.", why: "Every new parent drinks cold coffee. Not anymore.", estPriceRange: "$20–30", searchQuery: "temperature control insulated smart mug", tags: ["parents", "gadgets"] },
      { name: "Silk sleep eye mask", description: "Blackout silk mask for daytime naps.", why: "Sleep is the most precious gift now.", estPriceRange: "$12–18", searchQuery: "silk sleep eye mask blackout", tags: ["sleep", "selfcare"] },
      { name: "One-handed snack box", description: "Assorted eat-with-one-hand snacks.", why: "The other hand is holding a baby.", estPriceRange: "$18–25", searchQuery: "healthy snack box gift assortment", tags: ["food", "parents"] },
    ],
  },
  {
    title: "Desk Upgrade, Under $50",
    theme: "Office Secret Santa that doesn't feel generic",
    rationale: "Small desk luxuries that colleagues actually keep.",
    estTotal: "$35–50",
    priceBand: "under-50",
    approved: true,
    sortWeight: 70,
    items: [
      { name: "Desktop mini plant kit", description: "Low-maintenance succulent in a ceramic pot.", why: "A living thing that survives office lighting.", estPriceRange: "$12–16", searchQuery: "desk succulent plant ceramic pot kit", tags: ["office", "plants"] },
      { name: "Magnetic cable organizer", description: "Silicone magnetic ties that end cable chaos.", why: "Solves a daily annoyance they'd never fix themselves.", estPriceRange: "$8–12", searchQuery: "magnetic cable organizer desk silicone", tags: ["office", "gadgets"] },
      { name: "Premium gel pen set", description: "Smooth-writing pens in a gift case.", why: "People who love good pens really love good pens.", estPriceRange: "$14–20", searchQuery: "premium gel pen gift set smooth", tags: ["office", "stationery"] },
    ],
  },
  {
    title: "The Home Chef's Edge",
    theme: "Level up a keen cook's kitchen",
    rationale: "Sharp, useful upgrades — no gimmick gadgets.",
    estTotal: "$55–75",
    priceBand: "under-75",
    approved: true,
    sortWeight: 60,
    items: [
      { name: "Flaky finishing salt", description: "Sea salt flakes in a wooden serving box.", why: "The 'restaurant secret' every cook appreciates.", estPriceRange: "$10–15", searchQuery: "maldon flaky sea salt gift box", tags: ["cooking", "food"] },
      { name: "Cast iron mini skillet", description: "Pre-seasoned skillet for single servings.", why: "Perfect for the one-pan cookie they deserve.", estPriceRange: "$15–22", searchQuery: "mini cast iron skillet pre seasoned", tags: ["cooking", "kitchen"] },
      { name: "Digital instant-read thermometer", description: "Fast probe thermometer for meat and baking.", why: "The single biggest cooking accuracy upgrade.", estPriceRange: "$18–28", searchQuery: "instant read digital meat thermometer", tags: ["cooking", "gadgets"] },
    ],
  },
];
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test`
Expected: PASS (all schema + seed tests).

- [ ] **Step 7: Commit**

```powershell
git add -A; git commit -m "feat: bundle Zod schemas + 5 curated seed bundles (TDD)"
```

---

### Task 4: Convex setup, schema, seed mutation — includes USER CHECKPOINT

**Files:**
- Create: `convex/schema.ts`, `convex/seed.ts`, `convex/curated.ts`, `convex/_generated/*` (committed)
- Modify: `.gitignore` (ensure `_generated` NOT ignored), `package.json`

**Interfaces:**
- Consumes: `seedCuratedBundles` from Task 3.
- Produces: Convex tables per `docs/data-schema.md` (M1–M3 tables only — users/profiles/reminders are M4, YAGNI); `api.curated.listApproved` query returning approved curated bundles sorted by `sortWeight` desc.

- [ ] **Step 1: Install Convex**

```powershell
npm install convex
```

- [ ] **Step 2: Write `convex/schema.ts`**

```typescript
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const bundleItem = v.object({
  name: v.string(),
  description: v.string(),
  why: v.string(),
  estPriceRange: v.string(),
  searchQuery: v.string(),
  tags: v.array(v.string()),
});

export default defineSchema({
  bundles: defineTable({
    createdAt: v.number(),
    quizHash: v.string(),
    quiz: v.object({
      occasion: v.string(),
      ageBand: v.string(),
      gender: v.optional(v.string()),
      relationship: v.string(),
      interests: v.array(v.string()),
      freeText: v.optional(v.string()),
      budget: v.number(),
      currency: v.string(),
      urgency: v.union(v.literal("fast"), v.literal("normal"), v.literal("no_rush")),
      exclusions: v.array(v.string()),
      country: v.string(),
    }),
    theme: v.string(),
    rationale: v.string(),
    estTotal: v.string(),
    items: v.array(bundleItem),
    isPublic: v.boolean(),
    ownerId: v.optional(v.string()),
  })
    .index("by_quizHash", ["quizHash"])
    .index("by_ownerId", ["ownerId"]),

  curatedBundles: defineTable({
    title: v.string(),
    theme: v.string(),
    rationale: v.string(),
    estTotal: v.string(),
    items: v.array(bundleItem),
    season: v.optional(v.string()),
    priceBand: v.string(),
    approved: v.boolean(),
    sortWeight: v.number(),
  }),

  generationCache: defineTable({
    quizHash: v.string(),
    bundleIds: v.array(v.id("bundles")),
    createdAt: v.number(),
    ttl: v.number(),
  }).index("by_quizHash", ["quizHash"]),

  engagementCounters: defineTable({
    bundleId: v.string(),
    kind: v.union(v.literal("curated"), v.literal("generated")),
    linkClicks: v.number(),
    saves: v.number(),
    shares: v.number(),
    views: v.number(),
  }).index("by_bundleId", ["bundleId"]),

  rateLimits: defineTable({
    key: v.string(),
    windowStart: v.number(),
    count: v.number(),
  }).index("by_key", ["key"]),
});
```

- [ ] **Step 3: Write `convex/seed.ts`**

```typescript
import { internalMutation } from "./_generated/server";
import { seedCuratedBundles } from "./seedData";

export const seedCurated = internalMutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("curatedBundles").first();
    if (existing !== null) return "already seeded — skipping";
    for (const bundle of seedCuratedBundles) {
      await ctx.db.insert("curatedBundles", bundle);
    }
    return `seeded ${seedCuratedBundles.length} curated bundles`;
  },
});
```

- [ ] **Step 4: Write `convex/curated.ts`**

```typescript
import { query } from "./_generated/server";

export const listApproved = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("curatedBundles").collect();
    return all
      .filter((b) => b.approved)
      .sort((a, b) => b.sortWeight - a.sortWeight);
  },
});
```

- [ ] **Step 5: USER CHECKPOINT — Convex account + dev deployment**

Ask the owner to run in their terminal (browser login flow):
```powershell
npx convex dev --once
```
This logs in / creates a free Convex account, creates the project, writes `NEXT_PUBLIC_CONVEX_URL` + `CONVEX_DEPLOYMENT` to `.env.local`, generates `convex/_generated/`, and pushes the schema. **Do not proceed until this succeeds.**

- [ ] **Step 6: Ensure `_generated` is committed**

Check `.gitignore` — remove any `convex/_generated` entry if present (Convex may add one; we commit it per `docs/planning.md` so CI typechecks).

- [ ] **Step 7: Seed and verify**

```powershell
npx convex run seed:seedCurated
```
Expected output: `seeded 5 curated bundles`. Run again — expected: `already seeded — skipping`.

- [ ] **Step 8: Typecheck + test + commit**

```powershell
npm run typecheck; npm test
git add -A; git commit -m "feat: Convex schema (bundles, curated, cache, counters, rate limits) + seed"
```
Verify `.env.local` is NOT in the commit (`git show --stat HEAD`).

---

### Task 5: Convex client provider + env example

**Files:**
- Create: `src/components/convex-client-provider.tsx`, `.env.local.example`
- Modify: `src/app/layout.tsx`

**Interfaces:**
- Produces: `<ConvexClientProvider>` wrapping the app; renders children unwrapped when `NEXT_PUBLIC_CONVEX_URL` is absent (graceful degradation, keeps CI builds green).

- [ ] **Step 1: Write `src/components/convex-client-provider.tsx`**

```tsx
"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import { ReactNode } from "react";

const url = process.env.NEXT_PUBLIC_CONVEX_URL;
const client = url ? new ConvexReactClient(url) : null;

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  if (client === null) return <>{children}</>;
  return <ConvexProvider client={client}>{children}</ConvexProvider>;
}
```

- [ ] **Step 2: Wrap layout** — in `src/app/layout.tsx`, import and wrap `{children}`:

```tsx
import { ConvexClientProvider } from "@/components/convex-client-provider";
// inside <body>:
<ConvexClientProvider>{children}</ConvexClientProvider>
```

- [ ] **Step 3: Create `.env.local.example`**

```
# Convex (written automatically by `npx convex dev`)
CONVEX_DEPLOYMENT=
NEXT_PUBLIC_CONVEX_URL=

# PostHog (free tier project settings)
NEXT_PUBLIC_POSTHOG_KEY=
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com

# Affiliate tags (empty until programs approved — see docs/planning.md)
AFFILIATE_TAG_AMAZON=
AFFILIATE_ID_EBAY=
AFFILIATE_ID_AWIN=
```

- [ ] **Step 4: Verify graceful degradation**

```powershell
Rename-Item .env.local .env.local.bak; npm run build; Rename-Item .env.local.bak .env.local
```
Expected: build succeeds without env vars.

- [ ] **Step 5: Commit**

```powershell
git add -A; git commit -m "feat: Convex client provider (env-gated) + env example"
```

---

### Task 6: PostHog analytics init + typed track helper

**Files:**
- Create: `instrumentation-client.ts` (repo root), `src/lib/analytics.ts`

**Interfaces:**
- Produces: `track(event: AnalyticsEvent, properties?)` — the ONLY way app code sends events; `AnalyticsEvent` union enumerates PRD §2.3 client events. Page views + UTM capture are automatic via posthog-js defaults.

- [ ] **Step 1: Install**

```powershell
npm install posthog-js
```

- [ ] **Step 2: Write `instrumentation-client.ts`** (Next.js auto-loads this on the client)

```typescript
import posthog from "posthog-js";

if (process.env.NEXT_PUBLIC_POSTHOG_KEY) {
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
    defaults: "2025-05-24", // auto pageview capture incl. UTM params
  });
}
```

- [ ] **Step 3: Write `src/lib/analytics.ts`**

```typescript
import posthog from "posthog-js";

// Event names are canonical in docs/prd.md §2.3 — never invent variants.
export type AnalyticsEvent =
  | "quiz_started"
  | "quiz_step_completed"
  | "quiz_completed"
  | "bundles_generated"
  | "bundle_generation_failed"
  | "retailer_link_clicked"
  | "item_swapped"
  | "bundle_regenerated"
  | "bundle_saved"
  | "bundle_shared"
  | "shared_bundle_viewed"
  | "trending_viewed"
  | "curated_bundle_opened";

export function track(event: AnalyticsEvent, properties?: Record<string, unknown>): void {
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return; // no-op without key
  posthog.capture(event, properties);
}
```

- [ ] **Step 4: Verify build + USER CHECKPOINT (optional now)**

`npm run build` — expected: PASS.
Ask owner: create free PostHog project at posthog.com → paste `NEXT_PUBLIC_POSTHOG_KEY` into `.env.local` (can be deferred to Vercel setup; app no-ops without it).

- [ ] **Step 5: Commit**

```powershell
git add -A; git commit -m "feat: PostHog init (env-gated) + typed track() helper"
```

---

### Task 7: Landing page shell

**Files:**
- Modify: `src/app/page.tsx`, `src/app/layout.tsx` (metadata)
- Create: `src/app/quiz/page.tsx` (placeholder route)

**Interfaces:**
- Produces: `/` landing with "Start the quiz" CTA → `/quiz` placeholder. Real quiz UI is M2 (with frontend-design skill) — keep this minimal, no throwaway polish.

- [ ] **Step 1: Install Framer Motion**

```powershell
npm install framer-motion
```

- [ ] **Step 2: Set metadata in `src/app/layout.tsx`**

```tsx
export const metadata: Metadata = {
  title: "PerfectBundle — gift bundles picked for the person",
  description: "Answer a short quiz about them; get themed gift bundles with links to buy every item.",
};
```

- [ ] **Step 3: Replace `src/app/page.tsx`**

```tsx
"use client";

import Link from "next/link";
import { motion } from "framer-motion";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
      <motion.h1
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="text-4xl font-semibold sm:text-6xl"
      >
        Never wonder what to gift again.
      </motion.h1>
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.3 }}
        className="max-w-xl text-lg opacity-80"
      >
        Tell us about them — we build the perfect gift bundle, with links to buy every item.
      </motion.p>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, delay: 0.6 }}>
        <Link
          href="/quiz"
          className="rounded-full bg-foreground px-8 py-3 text-background transition hover:opacity-85"
        >
          Start the quiz
        </Link>
      </motion.div>
    </main>
  );
}
```

- [ ] **Step 4: Create `src/app/quiz/page.tsx` placeholder**

```tsx
export default function QuizPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 text-center">
      <p className="text-lg opacity-70">The gift quiz is coming in Milestone 2.</p>
    </main>
  );
}
```

- [ ] **Step 5: Verify + commit**

```powershell
npm run build; npm run lint
git add -A; git commit -m "feat: landing page shell + quiz placeholder route"
```

---

### Task 8: GitHub Actions CI

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Produces: CI running typecheck, lint, unit tests, build on every push/PR. No secrets needed (env-gated code builds without keys).

- [ ] **Step 1: Write `.github/workflows/ci.yml`**

```yaml
name: CI
on:
  push:
    branches: [master]
  pull_request:

jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run typecheck
      - run: npm run lint
      - run: npm test
      - run: npm run build
```

- [ ] **Step 2: Verify everything CI runs passes locally**

```powershell
npm run typecheck; npm run lint; npm test; npm run build
```
Expected: all PASS.

- [ ] **Step 3: Commit**

```powershell
git add -A; git commit -m "chore: GitHub Actions CI (typecheck, lint, test, build)"
```

- [ ] **Step 4: USER CHECKPOINT — GitHub repo**

Ask owner: create a free GitHub repo (private is fine) named `perfectbundle`, then:
```powershell
git remote add origin https://github.com/<owner>/perfectbundle.git
git push -u origin master
```
(If `gh` CLI is authenticated, `gh repo create perfectbundle --private --source . --push` does it in one step.)
Verify: Actions tab shows the CI run green.

---

### Task 9: Vercel deploy + docs update — USER CHECKPOINT

**Files:**
- Modify: `docs/tasks.md`, `docs/checkpoint.md`

**Interfaces:**
- Produces: live production URL on vercel.app; M1 checked off in docs.

- [ ] **Step 1: USER CHECKPOINT — Vercel**

Ask owner (browser): vercel.com → sign up free (hobby) with GitHub → "Add New Project" → import `perfectbundle` → framework auto-detected (Next.js) → add env vars `NEXT_PUBLIC_CONVEX_URL` (from `.env.local`) and, if created, `NEXT_PUBLIC_POSTHOG_KEY` + `NEXT_PUBLIC_POSTHOG_HOST` → Deploy.
Note: Convex prod vs dev — for M1 the dev deployment URL is acceptable; production Convex deployment (`npx convex deploy`) is set up at launch (M6).

- [ ] **Step 2: Verify production**

Open the vercel.app URL: landing renders, "Start the quiz" navigates to `/quiz` placeholder. If PostHog key set: check PostHog Activity for a `$pageview`.

- [ ] **Step 3: Update docs**

In `docs/tasks.md`: flip completed M1 checkboxes to `[x]` (Sentry task may remain open — it's P1, defer). In `docs/checkpoint.md`: progress by milestone (M1 → 100% or actual), completed items, next actions (M2 quiz wizard plan), change log entry.

- [ ] **Step 4: Final commit + push**

```powershell
git add -A; git commit -m "docs: M1 foundation complete — checkpoint + tasks updated"; git push
```

---

## Self-Review Notes

- **Spec coverage:** tasks.md M1 items all mapped (scaffold→T1, Convex+env→T4/T5, Vercel→T9, CI→T8, libs→T3/T6/T7, schema→T4, seed→T3/T4, PostHog page_view+UTM→T6). Sentry (P1) intentionally deferred — recorded in T9 Step 3.
- **M4 tables** (users, recipientProfiles, reminders) deliberately excluded from `convex/schema.ts` — YAGNI; added by the M4 plan.
- **Type consistency:** `CuratedBundle` (T3) matches `curatedBundles` table validators (T4) field-for-field; seed insert type-checks against schema at `npx convex dev` push.
- **User checkpoints:** Convex login (T4S5), PostHog key (T6S4, deferrable), GitHub repo (T8S4), Vercel (T9S1).
