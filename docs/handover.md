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
- **Analytics (PostHog) — M3 done, confirmed live with real data (2026-07-20).** Initializes via `instrumentation-client.ts` (do NOT add a second `posthog.init()` anywhere — see Gotchas). Project is on **EU cloud**; API host is `eu.posthog.com` (note: distinct from the ingestion host `eu.i.posthog.com`). Events fire per `docs/prd.md` §2.3 canon — proven via the PostHog API, not just assumed: a live funnel query returned real conversion numbers. **"PerfectBundle Proof Dashboard"** (pinned in PostHog) has 12 insights covering headline metrics, the core funnel, channel attribution, 12-week trends, and engine health, built via `POSTHOG_PERSONAL_API_KEY` rather than by hand. `signup` fires via a Clerk `user.created` webhook (`src/app/api/webhooks/clerk/route.ts`), not a client-side hook, so it's exactly-once regardless of which of the 3 signup entry points was used. Owner has registered the webhook in the Clerk Dashboard (2026-07-20); **not yet independently verified end-to-end** (see §2).
- **E2E suite:** Playwright, 4 browser/device projects, 69 passed / 3 skipped (verified 2026-07-19). `npx playwright test --project=chromium` for a fast local check (18 of the 69).
- **Monetization plan written:** `docs/monetization.md` — affiliate-first, phased, $0-to-run.
- **Real product photos + direct buy links (DONE 2026-07-19, confirmed actually live 2026-07-20).** Etsy's app was rejected → removed entirely from the codebase (regression-tested). eBay + Amazon got approved the same window, which reopened the direct-retailer route. **eBay's Browse API is now the live real-product layer**: OAuth client-credentials token (one per generation), per-item search, real photo + direct buyable item URL + real price (`src/lib/engine/media.ts` `parseEbayItemSummary`/`ebayMarketplaceForCountry`/`formatEbayPrice`, wired in `convex/generateBundles.ts`). Representative images (Unsplash primary + Pexels fallback, photographer-credited) are the automatic fallback when eBay has no match. Amazon's affiliate tag is flipped on (see Gotchas — a real client/server env-var bug was found and fixed along the way). Sovrn stays wired-but-unused behind the same `chooseItemMedia({ realProduct, stock })` seam as a documented future alternate source. Spec: `docs/superpowers/specs/2026-07-18-product-data-and-images-design.md`. Plans: `docs/superpowers/plans/2026-07-18-phase1-representative-images.md`, `docs/superpowers/plans/2026-07-19-ebay-real-products-affiliate-fix.md`. **2026-07-20 fix**: this had never actually reached production — `origin/master` was stuck 36 commits behind, and separately the Convex **production** deployment was missing `EBAY_CLIENT_ID`/`EBAY_CLIENT_SECRET`/`UNSPLASH_ACCESS_KEY`/`PEXELS_API_KEY` (Convex env vars are per-deployment, not pulled from `.env.local` automatically). Pushed to origin, set the 4 keys on `prod` via `npx convex env set --from-file`, redeployed Convex functions to prod, and verified with a real prod generation: eBay photos+prices+buy-links on 10/12 items, Unsplash fallback on the other 2. **Now genuinely confirmed live** (not just local-dev-verified — see Gotchas below). **Follow-up same day**: eBay's Browse API returns a 225px thumbnail by default, which was being stretched full-card-width — the actual blur. Fixed by requesting eBay's `s-l500` CDN size (`upscaleEbayImageUrl` in `src/lib/engine/media.ts`, swaps the size token already embedded in eBay's image filename) and shrinking the on-card image from a `h-40 w-full` banner to a `h-24 w-24` thumbnail beside the item text (`src/components/bundles/bundle-card.tsx`). Deployed to both Vercel and Convex prod. **Note**: this only affects *new* generations — bundles already in the 24h generation cache, or already saved/shared, keep their old low-res image until they're regenerated.

## 2. What's blocked (not actionable right now)

- **`signup` event webhook — owner has registered it in the Clerk Dashboard, not yet independently verified end-to-end.** I can now check PostHog myself (`POSTHOG_PERSONAL_API_KEY` is set up), so this just needs a live test signup — once you sign one up, tell me and I'll check the `event_definitions`/events API for a `signup` occurrence. Also worth checking Clerk Dashboard → Webhooks → your endpoint → Message log for a `200`.

## 3. Gotchas learned the hard way this project (don't re-break these)

- **Any env var read by code that runs in a `"use client"` component MUST be `NEXT_PUBLIC_`-prefixed.** `src/lib/links/retailer-links.ts` read plain `AFFILIATE_TAG_AMAZON`/`AFFILIATE_ID_EBAY` at call time, but it's invoked from `BundleCard` (a client component) — Next.js only inlines `NEXT_PUBLIC_`-prefixed vars into the browser bundle, so the value was always `undefined` client-side even though it was correctly set in Vercel/`.env.local`. The affiliate tag silently never reached a single outbound link until this was found (2026-07-19). If you add a new env-var read anywhere in `src/`, check whether that file (or its caller) is `"use client"` before assuming a bare `process.env.X` will work.
- **eBay's Browse API needs `btoa`, not Node's `Buffer`, for the OAuth Basic-auth header** — Convex's default (non-`"use node"`) action runtime is a V8-isolate-style environment with `fetch`/`btoa` but no `Buffer`. See `getEbayToken()` in `convex/generateBundles.ts`.
- **Never call `setTimeout`-based delays inside a Convex action.** A bare `new Promise(resolve => setTimeout(resolve, ms))` hung forever in Convex's action runtime, which then blocked *every other* action on the deployment (a stuck action holds a concurrency slot) until Convex's own platform timeout eventually force-killed it, minutes later. If you need a retry backoff, verify Convex's actual supported delay mechanism first (e.g. `ctx.scheduler.runAfter`), don't assume Node timers work.
- **Only one `posthog.init()` call, ever** — it lives in `instrumentation-client.ts`. A second init (e.g. in a React provider) triggers posthog-js's own "already initialized" guard and silently drops the second call's config.
- **`clerk init`'s default `proxy.ts` protects every route.** Already fixed — `clerkMiddleware()` with no blanket `auth.protect()`. If you regenerate this file, re-apply the guest-first fix.
- **Convex `@/` import alias doesn't resolve** in Convex's isolated typecheck — use relative imports (`../lib/...`) in `convex/*.ts` files that import from `src/lib`.
- **Gemini model:** `gemini-flash-latest` (self-updating alias). `gemini-2.5-flash`/`-lite` return 404 ("no longer available to new users"). Gemini's free tier occasionally 503s ("high demand") — the app already falls back to curated bundles on generation failure; this is normal, not a bug, unless the fallback itself breaks.
- **`Date.now()` / other impure calls in a component body** trip the `react-hooks/purity` lint rule — wrap in `useCallback` (event-handler context) rather than calling at render time.
- Never print API keys/secrets into chat — read them from `.env.local` via shell redirection and push to Convex/Vercel env vars without echoing values. **`npx convex env list` (no `--names-only`) prints full values to stdout — always use `--names-only` when just checking which keys exist.**
- **Convex environment variables are per-deployment and do NOT come from `.env.local` automatically, and pushing code (`git push`, Vercel deploy) does NOT set them.** Local dev (`npx convex dev`) and production (`scintillating-cheetah-642`) each need their own `npx convex env set ... --prod` (or dashboard) pass. Found 2026-07-20: the entire product-images/eBay feature had working code and correct local env vars, but production was missing all 4 image-provider keys, so every image silently failed to load in prod despite "working" in local dev the whole time.
- **"Verified live" in earlier checkpoint.md entries sometimes meant "verified against `npm run dev` + `npx convex dev` locally," not the actual `perfectbundle.vercel.app` production deployment.** `origin/master` had gone unpushed for 36 commits (2026-07-18 → 2026-07-20) before anyone noticed the live site hadn't changed. Going forward, be explicit in checkpoint entries about *which* environment was actually checked, and don't assume local verification implies production works — Convex prod env vars are the concrete way this gap bit us.
- **PostHog's REST/app API host is `eu.posthog.com` (EU) — NOT `eu.i.posthog.com`, which is the *ingestion* (capture) host used for sending events.** Same split exists for US (`us.posthog.com` vs `us.i.posthog.com`). Mixing them up gets you a confusing failure against the wrong service.
- **PostHog personal API key scopes are single-select per resource (None/Read/Write via a dropdown, not independent checkboxes), and Write implies Read.** Don't grant both — just pick Write for anything you need to create/modify.
- **PostHog's `@current` project-id shortcut (e.g. `/api/projects/@current/dashboards/`) works per-endpoint, not behind one blanket scope.** `/api/projects/@current/` (project detail) needs `project:read`, but `/api/projects/@current/dashboards/` and `/insights/` resolve `@current` fine with only `dashboard`/`insight` scopes — don't assume a scope error on one endpoint means the shortcut itself is blocked everywhere.
- **Vercel `NEXT_PUBLIC_*` env vars are baked in at build time.** Setting one via `vercel env add` does nothing to the currently-running deployment — you need `vercel deploy --prod` (or a new git push) afterward for it to actually take effect.

## 4. Immediate next steps (owner)

1. ~~Check PostHog is receiving events~~ — **done 2026-07-20**, confirmed via API with real data, no manual check needed anymore.
2. ~~Build the PostHog dashboard views~~ — **done 2026-07-20**, built via API. "PerfectBundle Proof Dashboard" is pinned in your PostHog project.
3. Sign up a fresh test account on the live site to confirm the `signup` webhook fires end-to-end — tell me once you have, and I'll check via the PostHog API myself.
4. ~~Get an eBay Partner Network campaign ID~~ — **done 2026-07-20.** Set as `AFFILIATE_ID_EBAY` on Convex prod and `NEXT_PUBLIC_AFFILIATE_ID_EBAY` on Vercel, redeployed both. eBay buy-link clicks now earn commission.
5. Whenever ready: a Resend API key unblocks the occasion-reminders build below.

## 5. Immediate next steps (build, unblocked)

Per `docs/tasks.md` Milestone 4, next unstarted items:
- Occasion reminders: CRUD + daily Convex cron (T-14/T-3) → Resend email (needs owner's Resend API key for live email verification)

(Done 2026-07-20:
 • `signup` PostHog event — fires via a Clerk `user.created` webhook, exactly-once regardless
   of signup entry point. Code-complete, tested, and owner has registered the webhook in the
   Clerk Dashboard; end-to-end firing not yet independently verified (§2/§4 step 3). Plan:
   `docs/superpowers/plans/2026-07-20-signup-event-clerk-webhook.md`.
 • Found + fixed: product images never actually reached production (36 unpushed commits +
   missing Convex prod env vars). See §1 and §3 Gotchas.
 • M3 Analytics closed out — PostHog dashboard + funnel + attribution insights built via API
   using a scoped personal API key, event delivery proven with real data. See §1.
 • eBay Partner Network campaign ID wired — buy-link clicks now earn commission. See §1.

Done 2026-07-18:
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
