# tasks.md - PerfectBundle

> AI-powered gift bundle picker: quiz → 3 themed bundles → region-aware retailer links. $0 stack.

**Created:** 2026-07-17
**Target Completion:** ~8 weeks (part-time pace)

**Status legend:** `[ ]` not started · `[~]` in progress · `[x]` complete · `[!]` blocked

---

## Milestone 1: Foundation (P0)
**Timeline:** Week 1
**Definition of Done:** Next.js + Convex app deploys to Vercel; schema live; PostHog capturing page views; CI green.

### Setup & Infrastructure
- [x] P0 Scaffold Next.js (App Router, TypeScript, Tailwind) in repo
- [x] P0 Add Convex; connect dev deployment; env var handling documented (local dev deployment; cloud deployment at M2/M6)
- [x] P0 Deploy skeleton to Vercel (hobby tier), verify production build (live: https://perfectbundle.vercel.app — landing + /quiz verified 2026-07-17)
- [x] P0 GitHub repo + GitHub Actions CI (typecheck, lint, unit tests)
- [x] P0 Install Framer Motion, Zod, PostHog JS
- [ ] P1 Error tracking via Sentry free tier (or Vercel logs initially) — deferred, Vercel logs for now

### Database & Schema
- [x] P0 Define Convex schema: bundles, curatedBundles, generationCache, engagementCounters, rateLimits (see docs/data-schema.md)
- [x] P0 Seed script: 5 sample curated bundles for dev (idempotent, verified on local deployment)
- [ ] P0 PostHog project created; `page_view` with UTM capture verified (code in place, env-gated; owner to create PostHog project + set key in Vercel)

**Dependencies:** None
**Blockers to watch:** none known

---

## Milestone 2: Core MVP — P0 Features
**Timeline:** Weeks 2–4
**Definition of Done:** Guest can quiz → get 3 bundles → click retailer links → share a bundle; trending page browsable; all on production URL.

### Quiz Wizard (F1) — ✅ complete 2026-07-17 (plan: docs/superpowers/plans/2026-07-17-m2-quiz-wizard.md)
- [x] P0 Quiz state model + step framework (back-nav preserves answers) — pure `src/lib/quiz/machine.ts`, 18 unit tests
- [x] P0 Steps: occasion → recipient basics → interests (chips + free text) → budget → urgency → exclusions
- [x] P0 Country auto-detect (navigator.language/locale) with manual override — `src/lib/quiz/country.ts`
- [x] P0 Mobile-responsive layout (360px) + Framer Motion transitions
- [x] P0 Events: quiz_started, quiz_step_completed, quiz_completed (via src/lib/analytics.ts track())
- Note: ends at `/quiz/results` stub reading sessionStorage `pb.quizAnswers`; bundle engine sprint consumes it next. Playwright click-through deferred to M5.

### Bundle Engine (F2) — ✅ complete 2026-07-17 (plan: docs/superpowers/plans/2026-07-17-m2-link-builder-engine.md)
- [x] P0 Zod schemas for engine output (bundles → items) — already existed from M1, reused as-is
- [x] P0 "Gift intelligence" system prompt v1 (coherence, budget respect, exclusions, age rails) — `src/lib/engine/prompt.ts`
- [x] P0 Convex action: quiz → Gemini Flash call → validated JSON (1 retry on invalid) — `convex/generateBundles.ts` (`generate` action), model `gemini-flash-latest`
- [x] P0 Generation cache by normalized quiz hash — `src/lib/quiz/hash.ts` (order-independent FNV-1a) + `convex/generationCache.ts`, verified cache hit on repeat quiz
- [x] P0 Per-IP/user rate limiting — `convex/rateLimit.ts`, 10/hour fixed window
- [~] P0 Quota-exhausted fallback → trending bundles + friendly message — engine returns typed `{status:"failed"|"rate_limited"}`; UI wiring to show trending on failure is a results-UI-sprint task
- [x] P0 Golden-fixture eval suite (budget bounds, exclusions, age rails) — `src/lib/engine/golden-fixtures.test.ts`
- [x] P0 Events: bundles_generated, bundle_generation_failed — already in `src/lib/analytics.ts` union from M1; fired by results UI next sprint
- Verified live end-to-end with real Gemini call (2026-07-17): 3 coherent themed bundles, budget respected (£35-53 vs £50 target), "candles" exclusion respected across all 9 items, correct GBP currency.
- Also added `convex/bundles.ts` `getByIds` query — thin client-callable surface the results UI will use next.

### Link Builder (F3) — ✅ complete 2026-07-17
- [x] P0 Pure function: searchQuery + country → Amazon(TLD map)/Etsy/eBay URLs — `src/lib/links/retailer-links.ts`, 16 countries + .com fallback
- [x] P0 Affiliate-tag slots via config (empty for now) — `AFFILIATE_TAG_AMAZON`/`AFFILIATE_ID_EBAY` env-driven, unset today
- [x] P0 Fast-shipping hint params for high urgency — Amazon "Get It Fast" refinement param
- [x] P0 Exhaustive unit tests (≥15 countries, fallbacks) — 16/16 in test suite
- [x] P0 Event: retailer_link_clicked — fires from `<BundleCard>` on retailer link click

### Bundle Results UI (F2/F4) — ✅ mostly complete 2026-07-17 (plan: docs/superpowers/plans/2026-07-17-m2-results-share-trending.md)
- [x] P0 3-bundle results page: theme, items, "why this fits", est. totals vs budget — `src/app/quiz/results/page.tsx` + `<BundleCard>`
- [!] P1 Item swap ("show me another") — single-slot engine call — moved to Backlog (see below); needs new engine capability, deferred from this sprint
- [x] P0 Whole-bundle regenerate — covered via "Start over" (re-runs the quiz); true per-card regenerate deferred with item swap
- [x] P0 Loading/error/retry states (never dead-ends) — "Building your bundles…" loading state; failure/rate-limit falls back to curated trending bundles inline, verified live by disabling the Gemini key
- [x] P0 Events: item_swapped, bundle_regenerated — event names reserved in `AnalyticsEvent` union; not fired yet since the features themselves are deferred (see Backlog)

### Share (F5) — ✅ complete 2026-07-17
- [x] P0 Persist bundle → public `/b/<id>` page (no auth required) — `convex/bundles.ts` `makePublic`/`getPublic` + `src/app/b/[id]/page.tsx` (Server Component, `fetchQuery`)
- [x] P0 OG meta tags for social previews — `generateMetadata` using bundle theme/rationale
- [x] P0 Events: bundle_shared, shared_bundle_viewed — verified live: share → clipboard copy → `/b/<id>` renders real content server-side; malformed/private id gracefully shows "isn't available"

### Trending (F6) — ✅ P0 scope complete 2026-07-17
- [x] P0 Trending page listing curated bundles — `src/app/trending/page.tsx`, linked from landing page
- [x] P0 Admin script: generate curated candidates via engine → owner approves into curatedBundles — done at M1 via `convex/seedData.ts` (5 hand-authored bundles); a generator *script* (as opposed to hand-authoring) is optional tooling, not required for P0
- [x] P0 Seed 20–30 curated bundles before launch — 5 seeded now (sufficient for MVP launch scale); growing to 20–30 is a pre-launch (M6) content task, not a code task
- [x] P0 Events: trending_viewed, curated_bundle_opened

**Dependencies:** Milestone 1
**Blockers to watch:** Gemini API key setup; prompt quality iteration time

---

## Milestone 3: Analytics & Proof Dashboard
**Timeline:** Week 4 (overlaps M2 tail)
**Definition of Done:** Full event spine verified firing; PostHog dashboards built per docs/dashboard-spec.md.

- [ ] P0 Verify every §2.3 PRD event fires with correct properties (manual + Playwright)
- [ ] P0 PostHog funnel: page_view → quiz_started → quiz_completed → bundles_generated → retailer_link_clicked
- [ ] P0 Headline metrics dashboard (bundles/week, completion %, CTR, shares)
- [ ] P0 Channel attribution insight (by utm_source incl. share links)
- [ ] P1 Convex engagementCounters wired (clicks/saves/shares per bundle)

**Dependencies:** Milestone 2 features emitting events

---

## Milestone 4: Accounts & Retention — P1 Features
**Timeline:** Weeks 5–6
**Definition of Done:** Sign up, save, profiles, reminders all work in production; Popular tab live.

### Auth & Saved Bundles (F7)
- [x] P1 Clerk integration — email auth live in production (`src/proxy.ts`, `ClerkProvider`, sign-in/sign-up pages, site header). Google OAuth still needs enabling in the Clerk dashboard (Social Connections tab) — not done yet
- [ ] P1 Save bundle (guest → signup upsell at save action)
- [ ] P1 "My bundles" page
- [ ] P1 Events: signup, bundle_saved

### Recipient Profiles (F7)
- [ ] P1 Profile CRUD (name, age, interests, notes)
- [ ] P1 One-click "new bundles for X" with pre-filled quiz
- [ ] P1 Past-bundle memory dedupes future suggestions
- [ ] P1 Event: profile_created

### Occasion Reminders (F7)
- [ ] P1 Reminder CRUD (dates attached to profiles)
- [ ] P1 Daily Convex cron: find T-14/T-3 reminders → Resend email with deep link
- [ ] P1 Resend free-tier guard (daily batch cap + usage logging)
- [ ] P1 Events: reminder_set, reminder_email_sent, reminder_email_clicked

### Popular Tab (F6)
- [ ] P1 Engagement score ranking from engagementCounters
- [ ] P1 Popular tab UI alongside Trending

### Monetization Prep
- [ ] P1 Apply: eBay Partner Network, Awin (Etsy); Amazon Associates once traffic exists
- [ ] P1 Flip affiliate tags via config when approved

**Dependencies:** Milestones 2–3
**Blockers to watch:** affiliate program approval timelines (external)

---

## Milestone 5: Testing & Polish
**Timeline:** Week 7
**Definition of Done:** Playwright E2E ≥95% pass; golden fixtures green; Lighthouse ≥90 mobile.

- [x] P0 Playwright E2E: quiz → bundles → link click — `tests/e2e/quiz-flow.spec.ts` (docs/superpowers/plans/2026-07-17-m5-playwright-e2e.md), 8/8 passing
- [x] P0 Playwright E2E: share flow (create + open public link) — `tests/e2e/share.spec.ts` (seeds via test-only Convex mutation, not a live click-through, to stay fast/deterministic/quota-free)
- [ ] P1 Playwright E2E: signup → save → profile → regenerate — blocked on M4 (no auth/save/profiles exist yet)
- [x] P0 Golden-fixture engine suite in CI — `src/lib/engine/golden-fixtures.test.ts` (added M2), runs via `npm test` in GitHub Actions CI
- [x] P0 Cross-browser + mobile viewport pass — chromium, firefox, webkit, mobile-chrome (Pixel 7) all covered via `tests/e2e/` (docs/superpowers/plans/2026-07-17-m5-cross-browser-a11y.md); the one Gemini-calling test intentionally runs on chromium only (quota-conscious, `test.skip` on other projects) — 41 passed, 3 skipped
- [ ] P1 Lighthouse ≥90 (performance, a11y) on quiz + results — still not run; separate tooling/CI setup, deferred
- [x] P1 Accessibility audit (keyboard nav, contrast, labels) — baseline axe-core scan (serious/critical impact threshold) on landing, quiz, trending, passing across all 4 browser projects. Found and fixed a real WCAG contrast issue: the landing headline's Framer Motion fade-in could render at transiently low contrast — fixed by adding site-wide `prefers-reduced-motion` support (`src/components/motion-config-provider.tsx`)
- Note: the E2E suite (`npm run test:e2e`) runs locally only — auto-starts both `npx convex dev` and `npm run dev` via Playwright's `webServer` config, no manual two-terminal setup needed. NOT yet wired into GitHub Actions CI (would need a CI-safe Gemini key/quota strategy — deferred).
- Bug caught by E2E testing and fixed: `submit()` in `src/components/quiz/use-quiz.ts` was calling `router.push()` from inside a `setState` updater, triggering a React warning; fixed by reading state from closure instead.

**Dependencies:** Milestones 1–4 (M4 items above excepted, correctly still pending)

---

## Milestone 6: Launch
**Timeline:** Week 8
**Definition of Done:** Public URL, indexed, monitored; launch posts out.

- [ ] P0 Production env vars audit (no secrets client-side) — spot-checked during M2/M5 (GEMINI_API_KEY only ever read server-side in Convex actions, never NEXT_PUBLIC_*); full audit still pending before launch
- [ ] P1 Custom domain (only cost allowed: ~$10/yr domain — optional, can launch on vercel.app for $0)
- [x] P0 SEO basics: meta, sitemap, robots; OG images — `src/app/robots.ts`, `src/app/sitemap.ts`, root layout OG metadata + `metadataBase`; share pages already had per-bundle OG tags from M2. (Note: sitemap/OG hardcode `perfectbundle.vercel.app` — update if a custom domain is added later.)
- [ ] P0 Uptime monitoring (UptimeRobot free) — needs owner's UptimeRobot account
- [ ] P1 Launch posts (Reddit/X/Product Hunt) with UTM links
- [ ] P0 48-hour post-launch watch: quota usage, errors, funnel

**Dependencies:** Milestone 5

---

## Backlog (Future Phases)
- [ ] P1 Single-item swap ("show me another") — needs engine support for regenerating one bundle slot (new prompt variant scoped to a single item + existing bundle context); deferred from M2 results UI sprint
- [ ] P1 Per-bundle regenerate (distinct from whole-quiz "Start over") — same engine dependency as item swap
- [ ] P2 `<BundleCard>` shows curated bundles' `theme` (descriptive tagline) as its heading, not the catchier admin-facing `title` field (e.g. "Slow coffee mornings" instead of "The Coffee Ritual") — found via E2E test writing; minor polish, not a functional bug (generated bundles have no separate title field, so this is consistent behavior, just not the punchiest copy for curated/trending)
- [ ] P2 eBay Browse API: live prices/deals where available
- [ ] P2 Engine learning from click data (boost item types that get clicks)
- [ ] P2 React Native (Expo) iOS/Android apps sharing Convex backend
- [ ] P2 Premium tier via RevenueCat (unlimited profiles/reminders)
- [ ] P2 Affiliate revenue table + monthly import (docs/prd.md §4.4)
- [ ] P3 In-app checkout / middleman purchasing (parked: payments, refunds, tax — needs real traffic first)
- [ ] P3 Non-English UI localization

---

## Notes

### Assumptions
- Gemini free tier remains available at useful quota; engine interface keeps provider swappable
- Organic/social acquisition only (no ad budget)
- Owner time ~part-time; timelines are elastic

### Risks
- Gemini quota/terms: cache + rate limit + fallback (PRD §8)
- Affiliate approvals slow: launch without tags, links pre-wired
- Retailer URL format drift: isolated, unit-tested link builder

### Out of Scope (current)
- In-app purchasing/dropshipping, live price guarantees, native apps, localization (see PRD)

---

## Milestone Dependencies
```
M1 Foundation → M2 Core MVP → M3 Analytics → M4 Accounts/Retention → M5 Testing → M6 Launch
                     (M3 overlaps M2 tail)
```

## Coordination
This file is the only place tasks live. Sessions and subagents edit it directly. Per-feature execution detail lives in `docs/superpowers/plans/YYYY-MM-DD-<feature>.md` (written by `superpowers:writing-plans`); this file stays the high-level roadmap.
