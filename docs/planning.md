# planning.md - PerfectBundle

**Version:** 1.0
**Last Updated:** 2026-07-17
**Authors:** Alan + Claude

---

## 1. Vision Statement

### What We're Building
PerfectBundle ends "I have no idea what to get them": a short quiz about the recipient produces 3 themed gift bundles of complementary items, with reasoning, honest price estimates, and links to buy each item at retailers in the user's region.

### Core Value Proposition
Bundles, not single items — coherent, themed sets feel more thoughtful than one gift. AI curation tailored to the actual person (interests, budget, urgency, exclusions) beats generic listicles. Global from day one via region-aware links.

### Success Looks Like
| Timeframe | Metric | Target |
|-----------|--------|--------|
| 30 days | MVP live; quiz completion rate | ≥50% |
| 60 days | Buy-intent CTR | ≥25% |
| 90 days | Bundles/week; affiliate applications | 100+; all submitted |

### Key Differentiators
1. Bundle coherence (themed sets with "why this fits" reasoning)
2. Honest constraints handling: budget bands, delivery urgency, exclusions
3. $0 operating cost → survives indefinitely without revenue pressure
4. Share links + reminders create organic loops without ad spend

---

## 2. Architecture Overview

### System Diagram
```
┌──────────────────────────────────────────────────────────────┐
│  Next.js (App Router) on Vercel ── Clerk (auth, P1)          │
│  PostHog JS (events)   Framer Motion (UI)                    │
└──────────────┬───────────────────────────────────────────────┘
               │ Convex client (queries/mutations/actions)
┌──────────────▼───────────────────────────────────────────────┐
│  Convex: schema tables · generation cache · rate limits      │
│  actions: generateBundles, swapItem  · cron: reminders daily │
└────┬─────────────────────┬─────────────────────┬─────────────┘
     ▼                     ▼                     ▼
 Gemini Flash          Resend (email)       PostHog (server
 (free tier)           P1 reminders          capture, engine events)

 Client → outbound retailer URLs (Amazon TLD-mapped / Etsy / eBay),
 affiliate-tag slots pre-wired. Purchases happen on retailer sites.
```

### Component Breakdown
| Component | Responsibility | Technology |
|-----------|---------------|------------|
| Web frontend | Quiz wizard, results, browse, share pages | Next.js + TS + Tailwind + Framer Motion |
| Backend | Data, engine orchestration, cache, rate limits, cron | Convex |
| Bundle engine | Quiz → 3 validated themed bundles | Gemini Flash via Convex action, Zod-validated |
| Link builder | searchQuery + country → retailer URLs | Pure TS function (shared lib, unit-tested) |
| Auth (P1) | Accounts, sessions | Clerk |
| Email (P1) | Occasion reminder emails | Resend via Convex cron |
| Analytics | Event spine, funnels, dashboards | PostHog + Convex counters |

### Data Flow
```
Quiz answers → Convex action → cache check → Gemini (miss) → Zod validate
  → store bundle → results UI → link builder URLs → retailer click (event)
  → share persists public /b/<id>
```

### Key Architectural Decisions
| Decision | Choice | Rationale |
|----------|--------|-----------|
| Backend | Convex over custom API | Free tier, realtime, built-in cron/actions, mobile-ready later |
| AI provider | Gemini Flash behind an interface | Only major LLM with a genuinely free API tier; swappable if terms change |
| Product data | AI + search deep-links, no retailer APIs in MVP | Only truly $0 + global approach (design spec §3) |
| Engine/UI split | Engine + link builder in shared lib, UI-independent | Reused as-is by Expo mobile app in Phase 4 |
| Auth timing | None in MVP, Clerk in M4 | Guest-first flow converts better; less to build first |
| Hosting | Vercel hobby | Free, zero-ops Next.js deploys |

---

## 3. Technology Stack

### Frontend
| Layer | Technology | Purpose |
|-------|-----------|---------|
| Framework | Next.js (App Router) + TypeScript | Core web app |
| Styling | Tailwind CSS | Utility CSS |
| Animation | Framer Motion | Quiz transitions, results reveal |
| State | React state + URL params (quiz), Convex live queries (data) | No extra state lib needed |
| Validation | Zod | Engine output + form validation |

### Backend & Data
| Layer | Technology | Purpose |
|-------|-----------|---------|
| Platform | Convex (free tier) | DB, actions, cron, file of record |
| AI | Gemini Flash free API tier | Bundle generation (server-side only) |
| Auth (P1) | Clerk (free ≤10k MAU) | Accounts |
| Email (P1) | Resend (100/day free) | Reminders |
| Analytics | PostHog (1M events/mo free) | Events, funnels, dashboards |

### Testing & Ops
| Tool | Purpose |
|------|---------|
| Playwright CLI (`npx playwright test`) | E2E (95% pass gate per sprint) |
| Vitest | Unit (link builder, schemas, scoring) |
| Golden fixtures | Engine output invariants in CI |
| GitHub Actions | CI (typecheck, lint, unit) |
| UptimeRobot free | Uptime monitoring (launch) |

**Cost policy:** every service above has a permanent free tier. The single optional spend is a custom domain (~$10/yr) — launch works on `*.vercel.app` at $0. Nothing else may introduce cost without explicit owner approval.

---

## 4. Integration Points

### External APIs
| API | Purpose | Auth | Limits / Notes |
|-----|---------|------|-------|
| Gemini API | Bundle generation | API key (Convex env) | Free-tier daily quota — cache + rate-limit + fallback |
| Clerk | Auth (P1) | SDK keys | Free ≤10k MAU |
| Resend | Reminder email (P1) | API key | 100/day — batch cap enforced |
| PostHog | Analytics | Project key | 1M events/mo |
| eBay Browse API | Live prices (P3) | OAuth client credentials | Phase 3 only |

### Outbound Links (not APIs)
Amazon (country TLD map), Etsy, eBay search URLs with affiliate-tag slots (Amazon Associates / EPN / Awin IDs via config once approved). Fast-shipping hint params on high urgency.

### Webhooks
| Source | Events | Endpoint | Phase |
|--------|--------|----------|-------|
| Clerk | user.created/updated | Convex HTTP action | M4 |

---

## 5. Security & Compliance

| Aspect | Implementation |
|--------|---------------|
| Auth | Clerk-managed (OAuth + email); no password handling in our code |
| Secrets | Convex env vars + Vercel env; never client-side, never committed |
| API abuse | Per-IP/user rate limits on generation; Convex validators on all mutations |
| PII | Minimal: profiles store first-name-level data user volunteers; no payment data ever (purchases happen at retailers) |
| GDPR | Applicable (global): PostHog EU-friendly config, cookie-consent for analytics, account+data deletion via Clerk + Convex cascade |
| Affiliate disclosure | Required by FTC/program ToS once tags live — visible disclosure on bundle pages (M4 monetization prep) |
| Age rails | System-prompt safety rules (e.g. no alcohol under regional age); golden-fixture tested |
| HIPAA / PCI | N/A |

---

## 6. Scalability Considerations

| Concern | Free-tier ceiling | Mitigation |
|---------|-------------------|------------|
| Gemini daily quota | Hard daily cap | Cache (quiz-hash), rate limits, trending fallback; provider interface swappable |
| Convex free tier | Generous for early stage | Counters batched; cache TTL eviction |
| Resend 100/day | Reminder volume | Batch cap + queue spillover to next day |
| Vercel hobby | Bandwidth/function limits | Static-first pages, edge caching on share pages |

**Future (only if traction):** paid tiers funded by affiliate revenue; eBay API for live data; Expo mobile apps reusing Convex + shared engine lib.

---

## 7. Development Workflow (Superpowers)

Every new piece of work flows through the same 6 steps:

1. **Read the 4 source-of-truth docs first**:
   - `docs/prd.md` — what we're building
   - `docs/tasks.md` — what's left and what's in progress
   - `docs/planning.md` — this file (architecture, stack, this workflow)
   - `docs/checkpoint.md` — current status, blockers, recent changes
2. **Plan the next stage** — invoke `superpowers:writing-plans` against the next unstarted P0/P1 task in `docs/tasks.md`. Plans live in `docs/superpowers/plans/YYYY-MM-DD-<feature>.md`.
3. **Execute** — `superpowers:executing-plans` (or `superpowers:subagent-driven-development` for multi-task plans).
4. **TDD** — Red → Verify Red → Green → Verify Green → Refactor via `superpowers:test-driven-development`. No production code without a failing test first.
5. **Verify** — `superpowers:verification-before-completion` gates every "done" claim. Fresh test/build evidence required.
6. **Track** — edit `docs/tasks.md` (check off, add discovered tasks) and `docs/checkpoint.md` (status, blockers, change log) as work lands. No native task list.

---

## Appendix

### Environment Variables
```
# Convex
CONVEX_DEPLOYMENT=
NEXT_PUBLIC_CONVEX_URL=

# AI
GEMINI_API_KEY=            # Convex env only, never client

# Analytics
NEXT_PUBLIC_POSTHOG_KEY=
NEXT_PUBLIC_POSTHOG_HOST=

# Auth (M4)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=

# Email (M4)
RESEND_API_KEY=            # Convex env

# Affiliate tags (config, empty until approved)
AFFILIATE_TAG_AMAZON=
AFFILIATE_ID_EBAY=
AFFILIATE_ID_AWIN=
```

### References
- Design spec: `docs/superpowers/specs/2026-07-17-perfectbundle-design.md`
- PRD: `docs/prd.md` · Schema: `docs/data-schema.md` · Dashboards: `docs/dashboard-spec.md`
