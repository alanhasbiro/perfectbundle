# handover.md — PerfectBundle Session Handover

**Read this file first in any new session.** It's the single entry point;
detailed docs are linked at the bottom for when you need more than this gives.

**Live site:** https://perfectbundle.vercel.app
**Repo:** github.com/alanhasbiro/perfectbundle (branch `master`)
**Convex prod:** `scintillating-cheetah-642` (deploy via `CONVEX_DEPLOYMENT=prod:scintillating-cheetah-642 npx convex deploy -y` — plain `npx convex deploy` prompts interactively and hangs in a non-interactive shell)
**Hard constraint:** $0 operating cost, permanent free tiers only. Never add a paid service without explicit owner approval.

---

## 0. Standing instruction for whichever agent is reading this (every session)

The owner should never have to ask for a handover — that's now a standing
expectation for this project, not a one-off request.

**Proactively watch your own session length/context usage as you work.**
When a session is getting long — many tool calls piled up, several
substantial pieces of work landed, or you sense you're approaching a
context/compaction limit — do this **unprompted**, before the owner asks:

1. Tell the owner directly that it's a good point to start a fresh chat.
2. Rewrite this file (`docs/handover.md`) yourself with everything from the
   current session — what shipped, what's blocked, new gotchas, updated
   immediate-next-steps — so the next chat can start cold with zero lost
   context. Don't just append; keep §1–§5 current and trim stale detail
   into `docs/checkpoint.md` (the exhaustive log) if it's no longer
   immediately actionable.
3. Carry this §0 instruction forward unchanged into the file you write, so
   the next agent inherits the same standing expectation.

---

## 1. What's built and live

- **Quiz → AI bundle generation → retailer links → share → trending.** Full guest-usable core loop, live-verified.
- **Auth (Clerk):** sign-in/sign-up/UserButton in the site header. **Guest-first by design** — only save/profile/my-bundles routes require auth; quiz/results/share/trending stay public. Currently using Clerk **dev-mode keys** in production (no prod Clerk instance yet — needs a custom domain the owner has twice declined to buy; see §3 Gotchas re: Lighthouse for the concrete cost of this).
- **Save bundles:** guest → signup upsell on the save action; `/my-bundles` page.
- **Recipient profiles:** `/profiles` — create/edit/delete, plus "New bundles for X" which pre-fills the quiz. `src/lib/quiz/prefill.ts` is the tested seam.
- **Item swap + per-bundle regenerate.** "🔄 Show me another" per-item and "🔄 Regenerate" per-bundle buttons on every generated/saved/popular bundle card, via two Convex actions reusing the existing rate limiter/media pipeline.
- **Analytics (PostHog) — M3 done, confirmed live with real data.** Initializes via `instrumentation-client.ts` (do NOT add a second `posthog.init()` — see Gotchas). EU cloud; REST/app API host is `eu.posthog.com` (distinct from the ingestion host `eu.i.posthog.com`). "PerfectBundle Proof Dashboard" (pinned) has 12 insights. `signup` fires via a Clerk `user.created` webhook, exactly-once regardless of entry point.
- **Real product photos + direct buy links.** eBay Browse API is the live real-product layer (real photo + direct buyable item URL + real price); Unsplash-primary/Pexels-fallback representative images cover the rest. Amazon + eBay affiliate tags are both flipped on and earning commission. Etsy was rejected and fully removed from the codebase.
- **Curated bundles: grown from 5 → 23** (2026-07-22 content batch, `seedAdditionalCurated` — idempotent by title, deployed to Convex prod).
- **Lighthouse mobile pass done (2026-07-22), run against a production build** (`next build && next start` — dev-mode scores are meaningless, don't audit against `next dev`). **`/quiz/results` — Performance 94, Accessibility 100.** **`/quiz` — Accessibility 100, Performance 74** (below the ≥90 target; root cause is external — see §3). Found and fixed 2 real a11y bugs shared by every page rendering `<BundleCard>`: heading order (theme was `<h3>` with no `<h2>` anywhere between it and the page `<h1>`) and color contrast (several `opacity-50` caption/disclosure texts scored 3.4:1, below the 4.5:1 minimum — bumped to `opacity-60`).
- **OG/Twitter share preview images (2026-07-22).** `/b/[id]` shares previously rendered as bare text on Reddit/iMessage/Twitter. Added `src/app/opengraph-image.tsx` (site-wide default) and `src/app/b/[id]/opengraph-image.tsx` (dynamic, shows the bundle's theme), both via Next's built-in `next/og` `ImageResponse` — free, no external service. Plus `twitter: { card: "summary_large_image" }` metadata.
- **Google AdSense (2026-07-22).** Owner-provided client ID `ca-pub-9391534437442090`. Site-wide loader script (`src/app/layout.tsx`, `next/script`, `afterInteractive`) + `public/ads.txt`. Two ad units via a reusable `src/components/ad-unit.tsx`: an "auto"/responsive banner (slot `1834149356`) at the top of `/trending`, and a "fluid"/in-feed unit (slot `8812435332`) blended into the bundle list on `/trending`, `/popular`, and `/quiz/results` — owner's explicit choice, made with the tradeoff flagged (ads near affiliate Buy buttons can pull clicks from higher-value affiliate commission). **AdSense's own site-verification step failed once already** ("couldn't verify") — confirmed via direct HTTP checks that the script/ads.txt genuinely are live and server-rendered on `perfectbundle.vercel.app`, so this is external to the code; see §2/§3.
- **E2E suite:** Playwright, 4 browser/device projects, 71 passed / 6 skipped, reconfirmed clean after every change above.

## 2. What's blocked / needs owner action

- **AdSense site verification** — owner needs to retry the "Verify"/re-check step in the AdSense dashboard (code is confirmed live). If it keeps failing after a day or so, the likely cause is `vercel.app` being a shared subdomain rather than a domain the owner controls — that would reopen the custom-domain question the owner has declined twice this project.
- **Occasion reminders** (M4 backlog) — waiting on the owner's Resend API key; not stuck, just owner-paced.
- **Clerk dev-mode keys** — a real, measured cost: they're the dominant reason `/quiz` scores 74/100 on Lighthouse performance (see §3). Fixing this needs a Clerk *production* instance, which needs a custom domain. Purely the owner's call whether that tradeoff is worth revisiting.

## 3. Gotchas learned the hard way this project (don't re-break these)

- **Lighthouse scores from `next dev` are meaningless — always audit against a production build** (`next build && next start`). Dev mode is unminified with no code splitting; a page that scores 94 in production scored in the 50s in dev. This cost real time to figure out before the numbers made sense.
- **Lighthouse's CLI always audits in a fresh, storage-isolated browsing context** — a plain `npx lighthouse <url>` can never see `sessionStorage`-gated content (e.g. `/quiz/results`, which reads its quiz answers from `sessionStorage` and shows an empty "no answers" state otherwise). Confirmed this via the `network-requests` audit showing zero image fetches on a "successful" run. Fix: drive the real page to a loaded state with Playwright first (launch Chromium with `--remote-debugging-port`), then use `puppeteer-core.connect({ browserURL })` + Lighthouse's Node `navigation(page, url, { config: { settings: { disableStorageReset: true } } })` API against that *same* already-authenticated tab. `puppeteer-core`/`lighthouse` were installed with `npm install --no-save` for this and uninstalled after — no package.json/lockfile change.
- **A raw `curl`/SSR HTML fetch cannot see anything gated behind a client-side Convex `useQuery`** — e.g. the AdSense in-feed ad units on `/trending`/`/popular`/`/quiz/results` only exist once each page's bundle-list query resolves in the browser. Verifying via `curl | grep` will only ever show ad units that render unconditionally in the initial server-rendered shell (like the top banner). To check anything gated on client data, drive a real headless browser (Playwright) and query the DOM after `waitUntil: "networkidle"`.
- **An AdSense "couldn't verify your site" error does not necessarily mean the code is missing.** Check directly first: `curl -s https://<site>/ | grep adsbygoogle` (should appear in raw HTML, since `next/script` with `afterInteractive` still gets server-rendered into the initial response) and `curl -s https://<site>/ads.txt`. If both are correct, the failure is external — a transient crawler retry, a URL mismatch in the AdSense dashboard entry, or (if retries keep failing) `vercel.app` shared-subdomain flakiness.
- **Background dev servers (`npx convex dev`, `npm run dev`) can silently die across a session/context boundary** (compaction, or the harness restarting the underlying shell process) even though nothing in the visible conversation looks like it should have killed them. Always re-check `netstat -ano | grep LISTENING` for the ports you expect (3000, 3210) before assuming a server started earlier in the conversation is still up — don't trust "I started it a few messages ago."
- **On Windows, `Stop-Process -Id <pid>` against a stubborn process (e.g. `convex-local-backend` holding port 3210) can report success but the port stays occupied for a moment** — a `netstat` check immediately after can show stale state. Re-check after a beat, or verify via `Get-Process -Id <pid>` (errors cleanly once it's actually gone) rather than trusting one `netstat` read.
- **Any env var read by code that runs in a `"use client"` component MUST be `NEXT_PUBLIC_`-prefixed** — `src/lib/links/retailer-links.ts` read plain `AFFILIATE_TAG_AMAZON`/`AFFILIATE_ID_EBAY` at call time but is invoked from a client component; Next.js only inlines `NEXT_PUBLIC_`-prefixed vars into the browser bundle.
- **eBay's Browse API needs `btoa`, not Node's `Buffer`**, for the OAuth Basic-auth header — Convex's default action runtime has `fetch`/`btoa` but no `Buffer`. See `getEbayToken()` in `convex/generateBundles.ts`.
- **Never call `setTimeout`-based delays inside a Convex action** — a bare `new Promise(resolve => setTimeout(resolve, ms))` hangs forever and blocks every other action on the deployment (a stuck action holds a concurrency slot). Use `ctx.scheduler.runAfter` instead.
- **Only one `posthog.init()` call, ever** — it lives in `instrumentation-client.ts`.
- **Convex `@/` import alias doesn't resolve** in Convex's isolated typecheck — use relative imports in `convex/*.ts` files.
- **Gemini model:** `gemini-flash-latest` (self-updating alias). The free tier occasionally 503s ("high demand") — this is normal, not a bug, unless the curated-bundle fallback itself breaks. Confirm via a direct `curl` to Gemini's API (bypassing Convex) before assuming your own code regressed.
- Never print API keys/secrets into chat. `npx convex env list` (no `--names-only`) prints full values — always use `--names-only` when just checking which keys exist. Same for `.env.local`: use `grep -oE '^[A-Z_]+='` or `cut -d= -f1`, never a bare `grep` for a value.
- **Convex environment variables are per-deployment and do NOT come from `.env.local` automatically** — local dev and `scintillating-cheetah-642` (prod) each need their own `npx convex env set ... --prod` pass. Pushing code does not set them.
- **Vercel `NEXT_PUBLIC_*` env vars are baked in at build time** — setting one via `vercel env add` does nothing until the next `vercel deploy --prod` or git push.
- **The 24h generation cache can make a real fix look broken** — re-running the exact same quiz answers as an earlier (broken) attempt returns the stale cached bundle, not a fresh generation. Check `npx convex data bundles --prod --format json` / `generationCache` by creation time before assuming a reported bug is a new regression.
- **`@clerk/testing`'s `clerk.signIn({ signInParams: { strategy: "password" } })` silently no-ops if password isn't a configured first factor** — prefer `clerk.signIn({ emailAddress, page })` instead.
- **In this Playwright config, `mobile-chrome` runs on the Chromium *engine*** — `test.skip(({ browserName }) => browserName !== "chromium")` will NOT skip it. Use `testInfo.project.name` instead.
- **`testSupport.ts` seed mutations called repeatedly across runs should clean up their own prior rows first** if anything ranks/limits by a shared score, or accumulated fixtures can push a fresh one off a capped list.

## 4. Immediate next steps (owner)

1. Retry AdSense site verification (code confirmed live — see §2/§3).
2. Whenever ready: a Resend API key unblocks the occasion-reminders build below.
3. Decide, whenever it comes up again: is the Clerk-dev-keys / no-custom-domain tradeoff still worth it? It's now a measured ~20-point Lighthouse performance cost on `/quiz`, not just an abstract "should productionize eventually" note.

## 5. Immediate next steps (build, unblocked)

Per `docs/tasks.md`, next unstarted items:
- Occasion reminders: CRUD + daily Convex cron (T-14/T-3) → Resend email (needs owner's Resend API key for live email verification)

Everything else in `docs/tasks.md` M1–M5 and the Backlog is checked off. M6 (Launch) has only the production env-vars audit done so far — indexing/monitoring/launch posts haven't been started.

(Done 2026-07-22, this session:
 • Curated bundles grown 5 → 23, deployed to Convex prod. See §1.
 • Lighthouse mobile pass on /quiz + /quiz/results against a production build; found + fixed
   2 real a11y bugs (heading order, color contrast) shared by every BundleCard-rendering page.
   See §1 and §3 Gotchas for the tooling workarounds this needed.
 • OG/Twitter share preview images for /b/[id] and site-wide default. See §1.
 • Google AdSense wired in two rounds (loader script + ads.txt, then two real ad units placed
   on /trending, /popular, /quiz/results). AdSense's own site verification failed once and is
   still pending an owner retry — see §2/§3.
 • All of the above: full Playwright suite (71 passed/6 skipped) and Vitest (132/132) reconfirmed
   green after every change; every commit pushed to origin/master.)

Done earlier (still relevant context, condensed — see `docs/checkpoint.md` for full detail):
 • Item swap + per-bundle regenerate; M5 authenticated E2E test; M3 Analytics dashboard built
   via PostHog API; eBay Partner Network + Amazon Associates affiliate tags live; real eBay
   product photos/prices/links + Unsplash/Pexels fallback images; Etsy removed; Clerk
   Organizations/billing disabled (was forcing unwanted org-selection into sign-in); Google
   OAuth confirmed already enabled; phone-number sign-in disabled; production Convex env vars
   audited (no secrets client-side).

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
*Update this file's §1–§5 whenever a session lands meaningful work or changes what's blocked — keep it the fast entry point, keep `docs/checkpoint.md` as the exhaustive log. See §0: do this proactively, don't wait to be asked.*
