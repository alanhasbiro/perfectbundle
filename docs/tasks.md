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
- [ ] P0 Event: retailer_link_clicked — deferred to results UI sprint (link builder itself doesn't fire events; the click handler will)

### Bundle Results UI (F2/F4)
- [ ] P0 3-bundle results page: theme, items, "why this fits", est. totals vs budget
- [ ] P0 Item swap ("show me another") — single-slot engine call
- [ ] P0 Whole-bundle regenerate
- [ ] P0 Loading/error/retry states (never dead-ends)
- [ ] P0 Events: item_swapped, bundle_regenerated

### Share (F5)
- [ ] P0 Persist bundle → public `/b/<id>` page (no auth required)
- [ ] P0 OG meta tags for social previews
- [ ] P0 Events: bundle_shared, shared_bundle_viewed

### Trending (F6)
- [ ] P0 Trending page listing curated bundles
- [ ] P0 Admin script: generate curated candidates via engine → owner approves into curatedBundles
- [ ] P0 Seed 20–30 curated bundles before launch
- [ ] P0 Events: trending_viewed, curated_bundle_opened

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
- [ ] P1 Clerk integration (Google + email)
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

- [ ] P0 Playwright E2E: quiz → bundles → link click
- [ ] P0 Playwright E2E: share flow (create + open public link)
- [ ] P1 Playwright E2E: signup → save → profile → regenerate
- [ ] P0 Golden-fixture engine suite in CI
- [ ] P0 Cross-browser + mobile viewport pass
- [ ] P1 Lighthouse ≥90 (performance, a11y) on quiz + results
- [ ] P1 Accessibility audit (keyboard nav, contrast, labels)

**Dependencies:** Milestones 1–4

---

## Milestone 6: Launch
**Timeline:** Week 8
**Definition of Done:** Public URL, indexed, monitored; launch posts out.

- [ ] P0 Production env vars audit (no secrets client-side)
- [ ] P1 Custom domain (only cost allowed: ~$10/yr domain — optional, can launch on vercel.app for $0)
- [ ] P0 SEO basics: meta, sitemap, robots; OG images
- [ ] P0 Uptime monitoring (UptimeRobot free)
- [ ] P1 Launch posts (Reddit/X/Product Hunt) with UTM links
- [ ] P0 48-hour post-launch watch: quota usage, errors, funnel

**Dependencies:** Milestone 5

---

## Backlog (Future Phases)
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
