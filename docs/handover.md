# handover.md — PerfectBundle Session Handover

**Read this file first in any new session.** It's the single entry point;
detailed docs are linked at the bottom for when you need more than this gives.

**Live site:** https://perfectbundle.vercel.app
**Repo:** github.com/alanhasbiro/perfectbundle (branch `master`)
**Convex prod:** `scintillating-cheetah-642` (deploy via `CONVEX_DEPLOYMENT=prod:scintillating-cheetah-642 npx convex deploy -y` — plain `npx convex deploy` prompts interactively and hangs in a non-interactive shell)
**Hard constraint:** $0 operating cost, permanent free tiers only. Never add a paid service without explicit owner approval.

---

## 1. What's built and live

- **Quiz → AI bundle generation → retailer links → share → trending.** Full guest-usable core loop, live-verified.
- **Auth (Clerk):** sign-in/sign-up/UserButton in the site header. **Guest-first by design** — only save/profile/my-bundles routes require auth; quiz/results/share/trending stay public. Currently using Clerk **dev-mode keys** in production (no prod Clerk instance yet — needs a custom domain or manual dashboard step).
- **Save bundles:** guest → signup upsell on the save action; `/my-bundles` page.
- **Recipient profiles:** `/profiles` — create/edit/delete, plus "New bundles for X" which pre-fills the quiz (person-level fields only; occasion/budget/urgency re-answered per gift). `src/lib/quiz/prefill.ts` is the tested seam.
- **Analytics (PostHog):** initializes via `instrumentation-client.ts` (do NOT add a second `posthog.init()` anywhere — see Gotchas). Project is on **EU cloud** (`eu.i.posthog.com`), not US. Events fire per `docs/prd.md` §2.3 canon; `signup` event is not yet wired to Clerk's sign-up completion.
- **E2E suite:** Playwright, 4 browser/device projects, 69 passed / 3 skipped (verified 2026-07-19). `npx playwright test --project=chromium` for a fast local check (18 of the 69).
- **Monetization plan written:** `docs/monetization.md` — affiliate-first, phased, $0-to-run.
- **Real product photos + direct buy links (DONE 2026-07-19).** Etsy's app was rejected → removed entirely from the codebase (regression-tested). eBay + Amazon got approved the same window, which reopened the direct-retailer route. **eBay's Browse API is now the live real-product layer**: OAuth client-credentials token (one per generation), per-item search, real photo + direct buyable item URL + real price (`src/lib/engine/media.ts` `parseEbayItemSummary`/`ebayMarketplaceForCountry`/`formatEbayPrice`, wired in `convex/generateBundles.ts`). **Verified live**: a real generation returned genuine eBay data for every item across all 3 bundles. Representative images (Unsplash primary + Pexels fallback, photographer-credited) are the automatic fallback when eBay has no match. Amazon's affiliate tag is flipped on (see Gotchas — a real client/server env-var bug was found and fixed along the way). Sovrn stays wired-but-unused behind the same `chooseItemMedia({ realProduct, stock })` seam as a documented future alternate source. Spec: `docs/superpowers/specs/2026-07-18-product-data-and-images-design.md`. Plans: `docs/superpowers/plans/2026-07-18-phase1-representative-images.md`, `docs/superpowers/plans/2026-07-19-ebay-real-products-affiliate-fix.md`.

## 2. What's blocked (not actionable right now)

- **PostHog dashboards** (funnel, headline metrics, channel attribution) — must be built manually in PostHog's UI. No personal API key available to automate it.
- **PostHog event-delivery proof** — couldn't get an automated (Playwright) confirmation that events actually land in PostHog, despite the plumbing checking out (SDK inits, consent optedIn, direct HTTP capture works standalone). **Owner should manually check PostHog → Activity → Events** after visiting the live site.

## 3. Gotchas learned the hard way this project (don't re-break these)

- **Any env var read by code that runs in a `"use client"` component MUST be `NEXT_PUBLIC_`-prefixed.** `src/lib/links/retailer-links.ts` read plain `AFFILIATE_TAG_AMAZON`/`AFFILIATE_ID_EBAY` at call time, but it's invoked from `BundleCard` (a client component) — Next.js only inlines `NEXT_PUBLIC_`-prefixed vars into the browser bundle, so the value was always `undefined` client-side even though it was correctly set in Vercel/`.env.local`. The affiliate tag silently never reached a single outbound link until this was found (2026-07-19). If you add a new env-var read anywhere in `src/`, check whether that file (or its caller) is `"use client"` before assuming a bare `process.env.X` will work.
- **eBay's Browse API needs `btoa`, not Node's `Buffer`, for the OAuth Basic-auth header** — Convex's default (non-`"use node"`) action runtime is a V8-isolate-style environment with `fetch`/`btoa` but no `Buffer`. See `getEbayToken()` in `convex/generateBundles.ts`.
- **Never call `setTimeout`-based delays inside a Convex action.** A bare `new Promise(resolve => setTimeout(resolve, ms))` hung forever in Convex's action runtime, which then blocked *every other* action on the deployment (a stuck action holds a concurrency slot) until Convex's own platform timeout eventually force-killed it, minutes later. If you need a retry backoff, verify Convex's actual supported delay mechanism first (e.g. `ctx.scheduler.runAfter`), don't assume Node timers work.
- **Only one `posthog.init()` call, ever** — it lives in `instrumentation-client.ts`. A second init (e.g. in a React provider) triggers posthog-js's own "already initialized" guard and silently drops the second call's config.
- **`clerk init`'s default `proxy.ts` protects every route.** Already fixed — `clerkMiddleware()` with no blanket `auth.protect()`. If you regenerate this file, re-apply the guest-first fix.
- **Convex `@/` import alias doesn't resolve** in Convex's isolated typecheck — use relative imports (`../lib/...`) in `convex/*.ts` files that import from `src/lib`.
- **Gemini model:** `gemini-flash-latest` (self-updating alias). `gemini-2.5-flash`/`-lite` return 404 ("no longer available to new users"). Gemini's free tier occasionally 503s ("high demand") — the app already falls back to curated bundles on generation failure; this is normal, not a bug, unless the fallback itself breaks.
- **`Date.now()` / other impure calls in a component body** trip the `react-hooks/purity` lint rule — wrap in `useCallback` (event-handler context) rather than calling at render time.
- Never print API keys/secrets into chat — read them from `.env.local` via shell redirection and push to Convex/Vercel env vars without echoing values.

## 4. Immediate next steps (owner)

1. Visit https://perfectbundle.vercel.app, then check PostHog → Activity → Events to confirm analytics is actually landing.
2. Build the PostHog dashboard views manually per `docs/dashboard-spec.md` (~10 min, one-time).
3. Optional revenue boost: get an eBay Partner Network **campaign ID** and set it as `AFFILIATE_ID_EBAY` (Convex env) — eBay Browse API buy links work today without it, but won't earn commission until it's set. Also add `NEXT_PUBLIC_AFFILIATE_ID_EBAY` (same value) for the fallback search-link tag.
4. Whenever ready: a Resend API key unblocks the occasion-reminders build below.

## 5. Immediate next steps (build, unblocked)

Per `docs/tasks.md` Milestone 4, next unstarted items:
- Occasion reminders: CRUD + daily Convex cron (T-14/T-3) → Resend email (needs owner's Resend API key for live email verification)
- Wire the `signup` PostHog event to Clerk's sign-up completion

(Done 2026-07-18:
 • Past-bundle memory — `recipientProfiles.pastItemNames` feeds an "avoid repeating"
   prompt instruction; `QuizState.profileId` threads profile→quiz→generate, kept out
   of `QuizAnswers`/cache hash; the generation-cache key folds in `profileId` so a
   stale hit can't skip dedup. Plan: `docs/superpowers/plans/2026-07-18-m4-past-bundle-memory.md`.
 • Engagement counters + Popular tab — `convex/engagement.ts` `record` upserts per-bundle
   counters at every click/save/share/view; `/popular` ranks publicly-shared user bundles
   by engagement score, distinct from editorial `/trending`. Plan:
   `docs/superpowers/plans/2026-07-18-m4-popular-tab.md`.

Done 2026-07-19:
 • Real eBay product photos/links/prices, dual Unsplash+Pexels images, Etsy removed,
   Amazon/eBay affiliate-tag client-env bug fixed. See §1 above.
   Plan: `docs/superpowers/plans/2026-07-19-ebay-real-products-affiliate-fix.md`.)

## 6. Deeper reference (read only if this file doesn't answer it)

| Doc | Use for |
|---|---|
| `docs/prd.md` | Product spec, canonical event names (§2.3) — never invent event variants |
| `docs/tasks.md` | Full milestone checklist, single source of truth for what's done |
| `docs/planning.md` | Architecture, stack, cost policy |
| `docs/checkpoint.md` | Full change log + technical-decisions log (more detail than this file) |
| `docs/monetization.md` | Revenue strategy, phased |
| `docs/data-schema.md` | Convex table shapes |
| `docs/dashboard-spec.md` | PostHog dashboard build spec |
| `CLAUDE.md` / `AGENTS.md` | Workflow rules (Superpowers plan→execute→TDD→verify), Convex/Next.js conventions |

---
*Update this file's §1–§5 whenever a session lands meaningful work or changes what's blocked — keep it the fast entry point, keep `docs/checkpoint.md` as the exhaustive log.*
