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
- **E2E suite:** Playwright, 4 browser/device projects, ~45+ tests green. `npx playwright test --project=chromium` for a fast local check.
- **Monetization plan written:** `docs/monetization.md` — affiliate-first, phased, $0-to-run.

## 2. What's blocked (not actionable right now)

- **Real product photos + direct retailer links — STRATEGY PIVOTED (2026-07-18).** Etsy rejected the app; Amazon/eBay expected to as well (per-retailer approval is a dead end). New plan: go through **Sovrn Commerce** — a free affiliate aggregator with day-one publisher approval whose Product API returns real photo + direct affiliate buy link + price + merchant across all major retailers (one integration = photos + buyable links + revenue). Spec: `docs/superpowers/specs/2026-07-18-product-data-and-images-design.md`.
  - **Phase 1 SHIPPED:** representative item images via the free **Pexels** API give cards real photos now (env-gated on `PEXELS_API_KEY`, cached at generation, labelled "Representative image", best-effort). Plan: `docs/superpowers/plans/2026-07-18-phase1-representative-images.md`. **Owner action for the live image:** create a free Pexels API key (pexels.com/api) and add `PEXELS_API_KEY` to Convex env — without it, enrichment is a silent no-op (cards render text-only, as before).
  - **Phase 2 (Sovrn) — owner action to unblock:** sign up free at sovrn.com/commerce → add `perfectbundle.vercel.app` as a campaign → await approval → Settings page → click the 🔑 icon next to the campaign for the API key → confirm the Product API is enabled. Then we wire it as the primary (real product) layer ahead of representative images.
  - Amazon/eBay stay as pure upside if they ever approve; no longer the critical path.
- **PostHog dashboards** (funnel, headline metrics, channel attribution) — must be built manually in PostHog's UI. No personal API key available to automate it.
- **PostHog event-delivery proof** — couldn't get an automated (Playwright) confirmation that events actually land in PostHog, despite the plumbing checking out (SDK inits, consent optedIn, direct HTTP capture works standalone). **Owner should manually check PostHog → Activity → Events** after visiting the live site.

## 3. Gotchas learned the hard way this project (don't re-break these)

- **Never call `setTimeout`-based delays inside a Convex action.** A bare `new Promise(resolve => setTimeout(resolve, ms))` hung forever in Convex's action runtime, which then blocked *every other* action on the deployment (a stuck action holds a concurrency slot) until Convex's own platform timeout eventually force-killed it, minutes later. If you need a retry backoff, verify Convex's actual supported delay mechanism first (e.g. `ctx.scheduler.runAfter`), don't assume Node timers work.
- **Only one `posthog.init()` call, ever** — it lives in `instrumentation-client.ts`. A second init (e.g. in a React provider) triggers posthog-js's own "already initialized" guard and silently drops the second call's config.
- **`clerk init`'s default `proxy.ts` protects every route.** Already fixed — `clerkMiddleware()` with no blanket `auth.protect()`. If you regenerate this file, re-apply the guest-first fix.
- **Convex `@/` import alias doesn't resolve** in Convex's isolated typecheck — use relative imports (`../lib/...`) in `convex/*.ts` files that import from `src/lib`.
- **Gemini model:** `gemini-flash-latest` (self-updating alias). `gemini-2.5-flash`/`-lite` return 404 ("no longer available to new users"). Gemini's free tier occasionally 503s ("high demand") — the app already falls back to curated bundles on generation failure; this is normal, not a bug, unless the fallback itself breaks.
- **`Date.now()` / other impure calls in a component body** trip the `react-hooks/purity` lint rule — wrap in `useCallback` (event-handler context) rather than calling at render time.
- Never print API keys/secrets into chat — read them from `.env.local` via shell redirection and push to Convex/Vercel env vars without echoing values.

## 4. Immediate next steps (owner)

1. Check Etsy developer dashboard — is the app "Active"? Re-share once resolved so photos/direct-links work can restart.
2. Visit https://perfectbundle.vercel.app, then check PostHog → Activity → Events to confirm analytics is actually landing.
3. Build the PostHog dashboard views manually per `docs/dashboard-spec.md` (~10 min, one-time).
4. Whenever ready: Amazon Associates + eBay Partner Network + Awin applications (see `docs/monetization.md` §1A).

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
   `docs/superpowers/plans/2026-07-18-m4-popular-tab.md`.)

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
