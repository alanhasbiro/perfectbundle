# checkpoint.md - PerfectBundle

> **⚠️ UPDATE THIS FILE BEFORE EVERY COMMIT**

---

## Current Status

| Metric | Value |
|--------|-------|
| **Overall Progress** | ~77% (M1 + M2 P0 done; production Convex deployed; M5 E2E core + cross-browser + a11y green; M3 PostHog config fixed + engagementCounters wired; M4 auth/save/profiles + past-bundle memory + Popular tab + signup event done; real eBay product photos/links/prices live) |
| **Current Phase** | M4 accounts & retention (save, profiles, recipient prefill, past-bundle memory, Popular tab, signup event done; occasion reminders is the only remaining M4 item, blocked on owner's Resend key). Real product data (eBay) shipped and verified live. |
| **On Track?** | ✅ Yes |
| **Last Updated** | 2026-07-20 |
| **Last Commit** | see change log |

### Tasks Status

See `docs/tasks.md` for the live task list. Summary:

| Metric | Value |
|--------|-------|
| **Active Milestone** | M4 accounts & retention (save/profiles/past-bundle memory/Popular tab/signup event done; occasion reminders is the only item left, blocked on Resend key) |
| **Tasks Complete** | 54 / ~85 |
| **Tasks In Progress** | 0 |
| **Tasks Blocked** | 2 (M3 dashboards — manual PostHog UI setup only; occasion reminders — needs owner's Resend key) |
| **Active Plan** | `docs/superpowers/plans/2026-07-20-signup-event-clerk-webhook.md` (complete, pending owner's Clerk Dashboard webhook registration for live verification) |

### Progress by Milestone

| Milestone | Status | Progress | Notes |
|-----------|--------|----------|-------|
| 1. Foundation | ✅ Complete | 100% | Live at perfectbundle.vercel.app; **production Convex deployed** (was local-only, fixed this session); PostHog key + Sentry still deferred (non-blocking) |
| 2. Core MVP (P0) | ✅ Complete | 95% | Quiz, engine, links, results UI, share, trending all done and live-verified. Only deferred: item swap/per-bundle regenerate (P1, needs new engine capability — backlogged) |
| 3. Analytics | 🔄 In Progress | 40% | Fixed real bugs: PostHog project is on EU cloud but key/host in Vercel were wrong region (401s) — corrected and redeployed; confirmed `config.js` resolves 200 in production. Could NOT get a definitive automated (Playwright) confirmation that `posthog.capture()` reaches the network in this dev/build setup despite extensive debugging (SDK inits fine, consent optedIn, direct HTTP capture works) — needs one manual check: visit perfectbundle.vercel.app, then check PostHog → Activity → Events a few minutes later. Dashboard/funnel/attribution insights (P0) still need manual PostHog UI setup — no personal API key available to automate. **Convex engagementCounters now wired** (`convex/engagement.ts` — clicks/saves/shares/views per bundle, fired from all touchpoints; powers the Popular tab independently of PostHog) |
| — | Real product photos + direct links | ✅ Done (2026-07-19) | **Resolution of the 2026-07-18 strategy pivot.** Etsy's app was rejected and removed entirely from the codebase (link builder + tests). Amazon and **eBay were approved** the same evening, reopening the direct-retailer route — Sovrn (the aggregator fallback) is no longer needed as the primary path. Shipped: (1) representative stock images — **Unsplash primary + Pexels fallback**, env-gated, cached at generation, photographer-credited (Unsplash's terms require it); (2) **eBay Browse API wired as the real-product layer** — OAuth client-credentials token fetched once per generation, per-item search, real photo + direct buyable item link + real price via `chooseItemMedia`'s `realProduct` slot (generalized from the original Sovrn-specific `sovrn` param). **Verified live**: a real (uncached) generation returned genuine eBay photo+price+buy-link for every item across all 3 bundles. Also found and fixed a real pre-existing bug while flipping on Amazon's tag: `retailer-links.ts` read non-`NEXT_PUBLIC_` env vars from a client component, so the affiliate tag never reached the browser bundle — renamed to `NEXT_PUBLIC_AFFILIATE_TAG_AMAZON`/`NEXT_PUBLIC_AFFILIATE_ID_EBAY`, regression-tested. Sovrn env vars/docs remain in place, unused, as a documented future alternate source. |
| 4. Accounts & Retention | 🔄 In Progress | 65% | Clerk auth, save-bundle + guest→signup upsell, and "My bundles" page all live in production. Recipient profiles done: `convex/recipientProfiles.ts` CRUD (auth-gated + ownership-checked), `/profiles` page (create/edit/delete), and a unit-tested prefill helper (`src/lib/quiz/prefill.ts`) for "New bundles for X". Past-bundle memory now live — `recipientProfiles.pastItemNames` feeds an "avoid repeating" prompt instruction, updated after each fresh (non-cached) generation; `profileId` threads through `QuizState` (kept out of `QuizAnswers`/cache hash), and the generation-cache key folds in `profileId` so a stale hit can't bypass dedup. **Popular tab live** — `/popular` ranks publicly-shared user-generated bundles by engagement score (`convex/engagement.ts` `listPopular` + pure `popularityScore`), distinct from editorial `/trending`, cross-linked, with a cold-start empty state. Quiz's hardcoded option lists extracted to `src/lib/quiz/options.ts`. Still using Clerk **dev-mode keys** in production (no prod instance yet). `signup` PostHog event now wired via a Clerk `user.created` webhook (code-complete, pending owner's one-time Clerk Dashboard webhook registration — see Blocked). Still to build: occasion reminders (Resend cron, blocked on owner's Resend key) |
| 5. Testing & Polish | 🔄 In Progress | 80% | E2E suite: 41 passing across chromium/firefox/webkit/mobile-chrome (3 intentionally skipped off-chromium — quota control) + baseline a11y audit passing on all 4. Only Lighthouse performance scoring remains |
| 6. Launch | ⏳ Not Started | 0% | |

---

## Completed Items ✅

### This Session (2026-07-20)
- [x] **`signup` PostHog event wired via a Clerk `user.created` webhook** — `src/app/api/webhooks/clerk/route.ts` (the project's first Next.js Route Handler). Chose a server-side webhook over a client-side "just signed up" heuristic deliberately: PerfectBundle has three signup entry points (header `SignUpButton` modal, the save-action guest upsell modal, the dedicated `/sign-up` page), and Clerk only fires `user.created` once per account regardless of which one was used — so the webhook gives exactly-once semantics for free, with no localStorage/dedup logic needed on our side. Verifies the webhook signature with `@clerk/nextjs/webhooks`' `verifyWebhook` (no new dependency — it transitively uses `standardwebhooks`, already installed via `@clerk/nextjs`, not `svix`). Added `src/lib/analytics-server.ts` (`captureServerEvent`) as the server-side counterpart to `src/lib/analytics.ts`'s `track()`: `posthog-js` is browser-only, so this POSTs directly to PostHog's capture API (`{host}/i/v0/e/`) instead — same env vars/host fallback as `instrumentation-client.ts`, best-effort (swallows fetch errors so a PostHog outage can never fail the webhook ack to Clerk). Added `src/lib/webhooks/clerk-signup.ts` (`signupMethodFromExternalAccounts`) to map Clerk's `externalAccounts` shape to the PRD's `method` property (`"email"` when none, else the OAuth provider name with Clerk's `oauth_` prefix stripped). **Deliberately scoped out**: the PRD's `signup` event also lists a `bundle_id` property, but a Clerk webhook payload carries no UI-flow context to attach one — omitted rather than faked. Plan: `docs/superpowers/plans/2026-07-20-signup-event-clerk-webhook.md`. Verified: Vitest 111/111, `tsc --noEmit` clean, `next build` clean (new route appears at `/api/webhooks/clerk`). **Blocked on owner** for live verification: register the webhook in Clerk Dashboard (Webhooks → Add Endpoint → `https://perfectbundle.vercel.app/api/webhooks/clerk` → subscribe to `user.created`) and set `CLERK_WEBHOOK_SIGNING_SECRET` in Vercel from the endpoint's Signing Secret — see `docs/handover.md` §2/§4.

### This Session (2026-07-19)
- [x] **Real eBay product data live** — owner got approved on eBay + Amazon (Etsy rejected, now fully removed from the codebase with a regression test). Wired eBay's Browse API as the primary real-product layer: OAuth2 client-credentials token (`getEbayToken`, one fetch per generation, not per item — `btoa`-based Basic auth since Convex's default runtime has no Node `Buffer`), per-item search (`fetchEbayProduct`), pure response parsing (`parseEbayItemSummary`, `ebayMarketplaceForCountry`, `formatEbayPrice` in `src/lib/engine/media.ts`, TDD'd). `chooseItemMedia`'s `sovrn` parameter generalized to `realProduct` since eBay — not Sovrn — is the live provider (Sovrn stays as a documented, unused alternate behind the same seam). **Verified live** with a real uncached generation: every item across all 3 bundles got a genuine eBay photo, direct buyable item URL, and real price.
- [x] **Dual stock-image providers** — switched Phase 1 images from Pexels-only to **Unsplash primary + Pexels fallback** (more free-tier headroom), and added required photographer attribution ("Photo by X on Unsplash/Pexels") per Unsplash's API terms. Verified live: both providers actively serving real, correctly-credited images.
- [x] **Found and fixed a real pre-existing bug**: Amazon/eBay affiliate tags never reached outbound links because `src/lib/links/retailer-links.ts` (called from the `"use client"` `BundleCard`) read plain `AFFILIATE_TAG_AMAZON`/`AFFILIATE_ID_EBAY` — Next.js only inlines `NEXT_PUBLIC_`-prefixed vars into the browser bundle, so the tag was always `undefined` client-side regardless of what was set in Vercel. Renamed both, added a regression test, documented the client/server env-var split (a separate server-only `AFFILIATE_ID_EBAY` now also feeds the eBay Browse API's affiliate header).
- [x] Etsy fully removed from `src/lib/links/retailer-links.ts` (app rejected) — regression test asserts no Etsy link/URL can silently reappear.
- Plan: `docs/superpowers/plans/2026-07-19-ebay-real-products-affiliate-fix.md`. Verified: Vitest 100/100, `tsc --noEmit` clean, `next build` clean, Playwright chromium 18/18.

### This Session (2026-07-18)
- [x] Product-data strategy pivot + Phase 1 images: Etsy rejected the app (Amazon/eBay likely too), so instead of per-retailer approval we go through **Sovrn Commerce** — a free, day-one-approval aggregator whose Product API returns real photo + direct affiliate buy link + price + merchant across all major retailers. Brainstormed + spec'd (`docs/superpowers/specs/2026-07-18-product-data-and-images-design.md`). **Phase 1 shipped**: representative item images via free Pexels API (env-gated `PEXELS_API_KEY`, fetched+cached at generation, "Representative image" caption, best-effort/never-blocks), pure unit-tested `src/lib/engine/media.ts` with first-match-wins layering (Sovrn→stock→none) so Phase 2 is a drop-in. Plan: `docs/superpowers/plans/2026-07-18-phase1-representative-images.md`. Verified: Vitest 89/89, tsc/build clean, Playwright chromium 16/16 (new `bundle-images.spec`). Phase 2 pending owner's Sovrn key.
- [x] Phase 2 UI + key diagnosis: built the shape-independent half of Phase 2 — a primary "Buy at {merchant}" affiliate button, real price, and an FTC affiliate disclosure that appears whenever an item carries `productUrl` (`src/components/bundles/bundle-card.tsx`, `tests/e2e/affiliate-buy.spec.ts`). **Blocked findings (owner keys):** (1) the Pexels key in `.env.local` is invalid — Pexels returns "Invalid API key" for every fresh query (a cached "coffee" query masked it); it's 32 chars vs Pexels' ~56, so a wrong value was pasted. Phase 1 code is proven correct against a valid response. (2) Sovrn Product API returns 401 "Invalid Api Key" (campaign likely not yet approved; schema is unpublished), so the Sovrn fetch/parser can't be built until one authenticated call succeeds. Env var names corrected to `SOVRN_SITE_API_KEY` + `SOVRN_SECRET_KEY` (two values). Verified this increment: Vitest 89/89, tsc/build clean, Playwright chromium 17/17.
- [x] M3/M4 engagement counters + Popular tab: `convex/engagement.ts` `record` upserts per-bundle counters at every click/save/share/view touchpoint (curated + generated); pure unit-tested `popularityScore` (`src/lib/bundles/popularity.ts`); `convex/engagement.ts` `listPopular` ranks publicly-shared user-generated bundles; new `/popular` page (distinct from editorial `/trending`, cross-linked, cold-start empty state). Plan: `docs/superpowers/plans/2026-07-18-m4-popular-tab.md`. Verified: Vitest 82/82, tsc + build clean, Playwright chromium 15/15 (incl. new `popular.spec`). Closes the M3 P1 "engagementCounters wired" task and the M4 Popular tab.
- [x] M4 past-bundle memory: `recipientProfiles.pastItemNames` schema field + `getByIdInternal`/`appendPastItemsInternal` (cap 50, deduped); `buildBundlePrompt` gains an optional `pastItemNames` param → "avoid repeating" prompt line + rule; `QuizState.profileId` threaded through prefill → submit → results (deliberately outside `QuizAnswers` so the cache hash/stored quiz shape are unchanged for the no-profile path); `generateBundles.generate` verifies profile ownership server-side, excludes past items, folds `profileId` into the cache key, and appends new item names after a fresh generation. Plan: `docs/superpowers/plans/2026-07-18-m4-past-bundle-memory.md`. Verified: full Vitest suite 79/79 green, `tsc --noEmit` clean, `next build` clean, Playwright chromium 13/13 (incl. real-Gemini quiz→results completion).

### This Session (2026-07-17)
- [x] Brainstorming: design approved → `docs/superpowers/specs/2026-07-17-perfectbundle-design.md`
- [x] PRD written → `docs/prd.md`
- [x] Scaffold docs: `docs/tasks.md`, `docs/planning.md`, `docs/checkpoint.md`, `CLAUDE.md`, `docs/data-schema.md`, `docs/dashboard-spec.md`
- [x] Git repo initialized
- [x] M1 plan written → `docs/superpowers/plans/2026-07-17-m1-foundation.md`
- [x] Next.js 16 scaffold (App Router, TS, Tailwind) — build green
- [x] Vitest infra; Zod bundle schemas + 5 seed bundles (TDD, 6/6 tests)
- [x] Convex: schema pushed to local dev deployment, seed idempotent, `curated:listApproved` verified
- [x] Env-gated Convex provider + PostHog init + typed `track()` (builds with zero env vars)
- [x] Landing page shell + `/quiz` placeholder (Framer Motion)
- [x] GitHub Actions CI; pushed to github.com/alanhasbiro/perfectbundle
- [x] Convex agent skills installed (`.claude/skills/convex-*`)
- [x] M2 quiz wizard: pure state machine, country detection, wizard shell, 6 steps, routing (23 tests)
- [x] M2 link builder: Amazon/Etsy/eBay URL builder, 16 countries, affiliate slots, fast-shipping hint (TDD)
- [x] M2 bundle engine: prompt builder, response parser, quiz hashing, Convex `generate` action (Gemini + cache + rate limit + retry), golden-fixture suite — verified live with a real Gemini call
- [x] M2 results UI + share + trending: `<BundleCard>`, results page wired to the engine with trending fallback, `/b/[id]` share page (Server Component, OG tags), `/trending` browse page — full journey live-verified including the failure-fallback path
- [x] **Production Convex deployment**: `npx convex deploy` → `scintillating-cheetah-642.convex.cloud`, Gemini key set, curated bundles seeded (owner completed `npx convex login`)
- [x] M5 sprint 1: Playwright E2E installed + configured (auto-starts Convex + Next dev servers, no manual setup); 8 passing specs (landing, quiz back-nav, one full quiz→results completion, trending, share incl. not-found case)
- [x] Real bug caught and fixed by E2E testing: `submit()` calling `router.push()` inside a `setState` updater (React warning) — fixed in `src/components/quiz/use-quiz.ts`
- [x] SEO basics: `src/app/robots.ts`, `src/app/sitemap.ts`, landing page OG metadata + `metadataBase`
- [x] M5 sprint 2: cross-browser (firefox, webkit) + mobile viewport (Pixel 7) Playwright projects; the one real-Gemini test capped to chromium only via `test.skip`
- [x] Accessibility audit (axe-core): landing, quiz, trending — found and fixed a real WCAG contrast issue (headline fade-in transient low-contrast state); added site-wide `prefers-reduced-motion` support (`src/components/motion-config-provider.tsx`)
- [x] Convex AI guideline files updated (`npx convex ai-files update`)

---

## In Progress 🔄

### Current Focus
> **Milestone 2 P0 scope is done and Milestone 5 has a working core E2E suite.** Full user journey works end-to-end, live-verified against BOTH local dev and now a real production Convex deployment: landing → quiz (6 steps) → "Building your bundles…" → 3 real Gemini-generated themed bundles with working Amazon/Etsy/eBay buy links → Share button copies a working `/b/<id>` public page (Server Component, real OG tags) → `/trending` browse page works standalone with the 5 seeded curated bundles. Generation failure/rate-limit falls back to trending bundles inline, never a dead end (tested live by disabling the Gemini key). All P0 analytics events fire.
>
> Production Convex is now live at `scintillating-cheetah-642.convex.cloud` (Gemini key set, curated bundles seeded). **Owner still needs to** add `NEXT_PUBLIC_CONVEX_URL=https://scintillating-cheetah-642.convex.cloud` to Vercel's Production environment variables — the next push will then deploy a working production site (previously the live site was pointed at a local-only Convex backend Vercel could never reach).
>
> Playwright E2E suite (`npm run test:e2e`) is green across chromium, firefox, webkit, and mobile-chrome: 41 passed, 3 skipped (the one real-Gemini test intentionally runs on chromium only to conserve free-tier quota). Self-contained — auto-starts both dev servers, no manual setup. Also added a baseline accessibility audit (axe-core) on the three static-ish pages; it caught a real WCAG contrast issue in the landing headline's fade-in animation, which is now fixed with proper site-wide `prefers-reduced-motion` support. SEO basics (robots.txt, sitemap.xml, OG metadata) also done. Caught and fixed two real bugs today via this testing work (see Completed Items).
>
> Deferred to backlog (P1, needs new engine capability, not blocking launch): single-item swap and per-bundle regenerate. Only remaining M5 item: Lighthouse performance scoring (separate tooling, lower priority).
>
> **Both PostHog and Clerk account creation instructions were given to the owner this session** — M3 (PostHog dashboard) and M4 (Clerk accounts/saved bundles/profiles/reminders) are ready to build the moment those keys land in `.env.local`. Everything else buildable without those keys is now done.

---

## Blockers 🚫

| Blocker | Impact | Status | Resolution |
|---------|--------|--------|------------|
| — none — | | | |

**External dependencies to set up when M1 starts (all free):** Gemini API key, Convex account, Vercel account, PostHog account, GitHub repo.

---

## Next Actions 📋

### Immediate (Next Commit)
1. [ ] **Owner:** visit perfectbundle.vercel.app, then check PostHog → Activity → Events to confirm events are actually landing (couldn't get automated proof — see M3 row above)
2. [ ] Build M3 dashboard/funnel/attribution insights in PostHog UI (manual, ~10 min, no API access available to automate)
3. [ ] **Owner:** try signing up as the first test user at perfectbundle.vercel.app to confirm the Clerk flow works end to end
4. [ ] Build M4: save bundle action (guest→signup upsell), "My bundles" page, recipient profiles CRUD, occasion reminders
5. [ ] When ready to leave Clerk dev-mode: create a production instance in the Clerk dashboard (needs a verified custom domain) and re-run `clerk env pull --instance prod`

### Short-term
- [ ] Lighthouse performance pass (M5, last remaining item, needs separate tooling setup)
- [ ] Wire E2E suite into GitHub Actions CI once a CI-safe Gemini key/quota strategy is decided
- [ ] Convex `engagementCounters` (M3 P1, clicks/saves/shares per bundle) — not started

---

## Scope Changes 📝

| Date | Change | Reason | Impact |
|------|--------|--------|--------|
| — | | | |

---

## Technical Decisions Log 🔧

| Date | Decision | Rationale | Alternatives Considered |
|------|----------|-----------|------------------------|
| 2026-07-17 | AI-curated engine + retailer search deep-links (no retailer APIs in MVP) | Only truly $0 + global approach | Retailer APIs first (US-skewed, approval friction); hand-curated catalog (unsustainable) |
| 2026-07-17 | Convex + Next.js/Vercel + Clerk + Resend + PostHog + Gemini free tiers | $0 hard constraint | Supabase (viable; Convex chosen for cron/actions/realtime + mobile reuse) |
| 2026-07-17 | Guest-first, auth deferred to M4 | Conversion + smaller MVP | Auth-from-day-1 |
| 2026-07-17 | In-app checkout/dropshipping parked to Phase 4+ | Payments/refunds/tax overhead unjustified pre-traffic | Building marketplace first |
| 2026-07-17 | Gemini model: `gemini-flash-latest` (resolves to gemini-3.5-flash) | `gemini-2.5-flash`/`-lite` returned 404 "no longer available to new users" on live test; `-latest` alias self-updates, avoiding future breakage | Pinning an explicit version (more predictable but needs manual updates as Google deprecates models) |
| 2026-07-17 | E2E share-page test seeds data via a dedicated `convex/testSupport.ts` mutation, not a full quiz→share click-through | Zero Gemini cost, fast, deterministic; a live click-through already exercises share via quiz-flow.spec.ts indirectly | Mocking the Convex action at the network layer (more setup, less confidence in real integration) |
| 2026-07-17 | Playwright E2E runs serially (`workers: 1`), not wired into CI yet | Suite shares one local Convex backend + rate limiter; CI would need a dedicated Gemini quota strategy not yet decided | Parallel workers (tried first, worked by luck — not relied upon) |
| 2026-07-17 | PostHog project confirmed on EU cloud (`eu.i.posthog.com`/`eu-assets.i.posthog.com`), not US | Direct API test against `app.posthog.com` (legacy US alias) returned 401/404; switching host to `eu.i.posthog.com` fixed config load | Assumed US region by default (wrong) |
| 2026-07-17 | Kept `instrumentation-client.ts` as the single PostHog init site; did not add a second React-provider-based init | A duplicate `posthog.init()` call triggers the SDK's own "already initialized" guard and silently drops the second call's config — found by testing, not inspection | A `PostHogProvider` React component (built, then reverted once the conflict was found) |
| 2026-07-17 | Do not use `setTimeout`/`new Promise(resolve => setTimeout(...))` for delays inside a Convex action | A bare `setTimeout`-based delay in `generateBundles:generate`'s retry logic never resolved — the action hung indefinitely, and because it never returned, it occupied the deployment's action concurrency slot and blocked *every other* action invocation (CLI and browser) until Convex's own platform timeout eventually force-killed it minutes later. Caused a real incident: users saw "Building your bundles…" stuck forever instead of the curated fallback. Reverted immediately; if a retry backoff is wanted later, use `ctx.scheduler.runAfter` or verify Convex's supported delay mechanism first, don't assume Node-style timers work | An explicit backoff delay before the Gemini retry (reverted — do not reintroduce without verifying the delay mechanism against Convex's actual runtime) |

---

## Questions & Clarifications ❓

### Open Questions
- [ ] App display name/domain: "PerfectBundle" assumed from folder name — confirm before launch
- [ ] Which social channels for launch posts (affects UTM plan)

### Resolved
- [x] Fulfillment model → links out + ideas; middleman checkout parked (user, 2026-07-16)
- [x] Market → global, region-adaptive links (user, 2026-07-16)
- [x] MVP features → quiz+bundles, save/share, profiles, reminders, trending+popular (user, 2026-07-16)
- [x] Engine approach → A + curated trending (user, 2026-07-16)

---

## Change Log 📜

| Date | Commit | Summary |
|------|--------|---------|
| 2026-07-17 | 8f6a935 | Design spec from brainstorming |
| 2026-07-17 | be63c3e | PRD + full docs scaffold + CLAUDE.md |
| 2026-07-17 | e1a247b | M1 Foundation plan |
| 2026-07-17 | 2fbed75…43fc17e | M1 execution: scaffold, Vitest, schemas+seed (TDD), Convex, providers, PostHog, landing, CI |
| 2026-07-17 | 3a90482…0c485fa | Convex agent skills + M1 docs closeout |
| 2026-07-17 | 34551a9 | M2 quiz wizard sprint plan |
| 2026-07-17 | 97170ff…d1f1e30 | M2 quiz wizard: state machine, country, shell, 6 steps, routing (TDD, 23 tests) |
| 2026-07-17 | 7e52b79 | M2 quiz wizard docs closeout |
| 2026-07-17 | 3ea259b | M2 link builder + bundle engine sprint plan |
| 2026-07-17 | 9f9aff7…f0e378e | M2 link builder + bundle engine: retailer links, prompt, parser, golden fixtures, hash, Convex generate action (59 tests, verified live) |
| 2026-07-17 | 304a4c5 | M2 engine docs closeout |
| 2026-07-17 | efcf6db | M2 results UI + share + trending sprint plan |
| 2026-07-17 | cf7fd63…47ed01c | M2 results UI + share + trending: session-id, budget-status, Convex share fns, BundleCard, results wiring, /b/[id], /trending (71 tests, live-verified incl. failure fallback) |
| 2026-07-17 | 641d401 | M2 docs closeout — Milestone 2 P0 scope complete |
| 2026-07-17 | e27e2a7 | M5 Playwright E2E sprint plan |
| 2026-07-17 | — (CLI) | Production Convex deployed (`scintillating-cheetah-642.convex.cloud`), Gemini key set, curated bundles seeded |
| 2026-07-17 | 0961590…e49269a | M5 sprint 1: Playwright install/config, testSupport seed mutation, 4 spec files (8 tests), setState-in-render bug fix, serial-workers reliability fix |
| 2026-07-17 | 618c736 | M5 sprint 1 docs closeout |
| 2026-07-17 | 8a9cf71 | SEO basics: robots.txt, sitemap.xml, landing OG metadata |
| 2026-07-17 | eaac2ea | M5 sprint 2 (cross-browser, mobile, a11y) plan |
| 2026-07-17 | 56d5b2d…ec6c850 | M5 sprint 2: firefox/webkit/mobile-chrome projects, axe-core a11y audit + real reduced-motion fix, Convex AI files updated |
| 2026-07-17 | 8c7125d, 226afd2 | M3: fixed PostHog region mismatch (EU not US) in Vercel prod env vars; found+reverted a redundant double-init; confirmed live prod config resolves. Automated event-delivery proof still unresolved — flagged for manual PostHog UI check |
| 2026-07-17 | f04b216 | M4: Clerk auth foundation — ClerkProvider, sign-in/sign-up pages, site header, guest-first middleware fix (reverted clerk init's default protect-everything scaffold) |
| 2026-07-17 | 814e03c | Redeploy for Clerk production env vars (dev-mode keys, no prod instance yet) |
| 2026-07-17 | 1723ffd | M4: save bundles + /my-bundles — Convex↔Clerk auth wired (auth.config, ConvexProviderWithClerk, "convex" JWT template). NOTE: manually-created Clerk JWT templates omit `aud` by default; had to PATCH `aud:"convex"` in or Convex rejects the token (aud mismatch) — the dashboard "Convex" preset sets this automatically, a hand-made template does not |
| 2026-07-17 | b784591 | M4 docs: mark save-bundles + My-bundles complete |
| 2026-07-17 | 872c1b7 | docs: monetization strategy (affiliate-first, phased, $0-to-run) → `docs/monetization.md` |
| 2026-07-17 | ed44b7b | M4: recipient profiles CRUD + "new bundles for X" prefill (`convex/recipientProfiles.ts`, `/profiles`, `src/lib/quiz/prefill.ts`, `src/lib/quiz/options.ts`) |
| 2026-07-17 | e57bb2e | docs: add `handover.md` single-entry-point session handoff |
| 2026-07-18 | 074c849…5da29cb | M4 past-bundle memory: pastItemNames schema + internal lookups, prompt avoid-repeating instruction, profileId threaded through quiz state (outside QuizAnswers), generateBundles ownership-verified dedup + profile-folded cache key |
| 2026-07-18 | 3e8aed3 | docs closeout — M4 past-bundle memory complete |
| 2026-07-18 | ae41e9d…060896b | M3/M4: engagementCounters wired + Popular tab (`convex/engagement.ts`, `src/lib/bundles/popularity.ts`, `/popular`, popular.spec E2E) |
| 2026-07-18 | 9925370 | docs closeout — engagement counters + Popular tab complete |
| 2026-07-18 | 308e4c1, b53b546 | Sovrn product-data workaround: design spec + Phase 1 plan |
| 2026-07-18 | 3a1dd8c…96c28a5 | Phase 1 representative images: media fields, pure media module, env-gated Pexels enrichment, BundleCard image + caption |
| 2026-07-18 | 3a1dd8c…01d7e2d | docs closeout — Phase 1 representative images complete |
| 2026-07-18 | d92244d | Phase 2 UI: Buy-at-merchant affiliate button + disclosure (shape-independent; Sovrn parser still blocked on approved campaign) |
| 2026-07-18 | f735f65 | docs: Phase 2 UI done; Pexels/Sovrn keys blocked (invalid key / unapproved campaign) |
| 2026-07-19 | 413b5d1 | Etsy removed; Unsplash primary + Pexels fallback with photographer attribution |
| 2026-07-19 | 7ad56bf | docs: eBay+Amazon approved, Etsy removed; Unsplash+Pexels image providers |
| 2026-07-19 | f362aa3 | eBay real-products + affiliate-tag bug fix implementation plan |
| 2026-07-19 | ddca52d | fix: Amazon/eBay affiliate tags need NEXT_PUBLIC_ prefix to reach the browser |
| 2026-07-19 | 28723b1 | eBay parsing/marketplace/price logic; chooseItemMedia generalized to realProduct |
| 2026-07-19 | 2e373b1 | eBay Browse API wired as the primary real-product layer (OAuth + per-item search) |
| 2026-07-19 | pending | docs closeout — eBay real products + affiliate-tag fix complete |

---

## Notes 📌

### Handoff Notes
Start any session by reading the 4 source-of-truth docs (`docs/prd.md`, `docs/tasks.md`, `docs/planning.md`, this file). M1 and M2's P0 scope are done and live-verified (both locally and against a real production Convex deployment); M5 has a green core E2E suite. Two external owner actions are pending and block further progress on M3/M4 specifically (not the app in general): a PostHog key and Clerk keys — see Next Actions above. Hard constraint to preserve in every decision: **$0 operating cost** (see `docs/planning.md` §3 cost policy).

Local dev now needs `npx convex dev` running (not just `--once`) if you want the Next.js dev server or Playwright E2E suite to actually reach the Convex backend — Playwright's config auto-starts it; manual `npm run dev` sessions need it started separately in another terminal (or rely on Playwright's webServer for E2E work instead).

*Next checkpoint: before next commit*
