# Product Requirements Document
**Project Name:** PerfectBundle
**Version:** 1.0
**Date:** 2026-07-17
**Author:** Alan (with Claude)
**Status:** Approved

## Change Log
| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-17 | Alan + Claude | Initial draft from approved design spec |

**Design spec:** `docs/superpowers/specs/2026-07-17-perfectbundle-design.md`

---

## 1. Executive Summary

### 1.1 Problem Statement
People struggle to think of good gifts. Searching "gift ideas for mum" returns generic listicles that ignore budget, personality, and delivery constraints — and single-item gifts feel less thoughtful than a curated set.

### 1.2 Proposed Solution
PerfectBundle asks a short quiz about the recipient (occasion, age, relationship, interests, budget, delivery urgency, exclusions) and generates **3 themed gift bundles** of 3–6 complementary items, each with reasoning, estimated prices, and region-aware links to buy at Amazon/Etsy/eBay. Free to operate (free-tier stack); monetized later via affiliate links.

### 1.3 Success Metrics (Preview)
| Metric | Baseline | Target | Timeframe |
|--------|----------|--------|-----------|
| Quiz completion rate | — | ≥60% of quiz starts | 60 days post-launch |
| Buy-intent CTR (retailer link clicks per bundle view) | — | ≥25% | 60 days post-launch |
| Weekly generated bundles | 0 | 100+/week | 90 days post-launch |
| Affiliate program approvals | 0 | Amazon + eBay + Awin submitted | 90 days |

### 1.4 Mode
- [x] **STANDARD MODE** — General consumer application
- [ ] CLINIC MODE

### 1.5 Hard Constraints
- **$0 build and operating cost.** Every service must run on a permanent free tier. No paid APIs, no paid hosting, no ad spend.
- **Global:** retailer links adapt to the user's country.
- **Web first**, architecture ready for React Native (Expo) mobile later.

---

## 2. User Personas & Journeys

### 2.1 Primary Persona — "The Stuck Gifter"
**Name:** Sam, 24–45, any gender
**Context:** Has a birthday/anniversary/holiday coming up, cares about the recipient, but is out of ideas and short on time.
**Goals:** A thoughtful, coherent gift within budget, fast; not another generic listicle.
**Pain points:** Decision paralysis; doesn't know the recipient's hobbies deeply; budget anxiety; late-shipping panic.

### 2.2 Secondary Persona — "The Planner"
Keeps a mental list of loved ones' dates. Wants profiles + reminders so gifting never sneaks up. Primary target for accounts, profiles, and reminder emails (Phase 2).

### 2.3 User Journey Map

| Stage | User Action | Tracking Event | Data Captured |
|-------|-------------|----------------|---------------|
| Awareness | Lands from social/search/shared bundle | `page_view` | utm_*, referrer, landing page, country |
| Activation | Starts the quiz | `quiz_started` | occasion, entry point |
| Activation | Completes the quiz | `quiz_completed` | answers (anonymized), duration |
| Value | Views generated bundles | `bundles_generated` | bundle count, cache hit, latency, budget band |
| Buy intent | Clicks a retailer link | `retailer_link_clicked` | retailer, item tags, bundle id, country |
| Retention | Signs up / saves bundle | `signup`, `bundle_saved` | method, bundle id |
| Retention | Creates profile / reminder | `profile_created`, `reminder_set` | occasion type |
| Advocacy | Shares bundle link | `bundle_shared` | bundle id, channel |
| Advocacy | Shared link opened by someone else | `shared_bundle_viewed` | bundle id, referrer |

---

## 3. Core Features

### 3.1 Feature Priority Matrix

| Priority | Feature | User Value | Business Value | Complexity |
|----------|---------|------------|----------------|------------|
| P0 | Gift quiz wizard | High | High | Medium |
| P0 | AI bundle engine (3 themed bundles) | High | High | High |
| P0 | Region-aware retailer links (affiliate-ready) | High | High | Low |
| P0 | Item swap / bundle regenerate | High | Medium | Medium |
| P0 | Public bundle share links (`/b/<id>`) | High | High (viral loop) | Low |
| P0 | Trending page (curated bundles) | Medium | Medium | Low |
| P1 | Accounts (Clerk) + saved bundles | High | High | Medium |
| P1 | Recipient profiles | High | High | Medium |
| P1 | Occasion reminders (email) | High | High (retention) | Medium |
| P1 | Popular tab (engagement-ranked) | Medium | Medium | Low |
| P1 | Affiliate tags live in links | — | High (revenue) | Low |
| P2 | eBay Browse API live prices/deals | Medium | Medium | High |
| P2 | Engine learning from click data | Medium | Medium | High |
| P2 | React Native (Expo) mobile apps | High | High | High |
| P2 | Premium tier (RevenueCat) | — | Medium | Medium |

### 3.2 Feature Specifications

#### F1: Gift Quiz Wizard (P0)
**Description:** Step-by-step animated wizard: occasion → recipient basics (age, gender optional, relationship) → interests (chips + free text) → total budget → delivery urgency → optional exclusions ("already has"/"avoid"). Guest-friendly, no sign-up. Country auto-detected, overridable.
**User story:** As a stuck gifter, I want to describe the recipient in under 90 seconds so I get ideas without effort.
**Acceptance criteria:**
- [ ] Completable in <90s; progress indicator; back navigation preserves answers
- [ ] Works on mobile viewport (360px) and desktop
- [ ] No step requires sign-up
- **Events:** `quiz_started`, `quiz_step_completed` {step}, `quiz_completed` {duration_s}

#### F2: AI Bundle Engine (P0)
**Description:** Convex action sends quiz answers + country to Gemini Flash with the "gift intelligence" system prompt; returns 3 themed bundles (3–6 items each) as strict JSON validated with Zod. Per item: name, description, "why this fits", estimated price range, searchQuery, tags. Cached by normalized quiz hash; rate-limited per IP/user; 1 auto-retry on invalid JSON; fallback to trending bundles when quota exhausted.
**Acceptance criteria:**
- [ ] 3 bundles, each 3–6 items, estimated totals within ±20% of budget
- [ ] Exclusions never appear; age-appropriate rails hold in golden-fixture tests
- [ ] Cache hit skips Gemini; identical quiz returns instantly
- [ ] Quota exhaustion shows friendly fallback, never a dead end
- **Events:** `bundles_generated` {cache_hit, latency_ms, budget_band}, `bundle_generation_failed` {reason}

#### F3: Region-Aware Retailer Links (P0)
**Description:** Pure function: searchQuery + country → Amazon (correct TLD), Etsy, eBay search URLs. Affiliate-tag slot per retailer, empty until programs approved. High urgency adds fast-shipping hint params where supported.
**Acceptance criteria:**
- [ ] Correct Amazon domain for ≥15 major countries, sane fallback to .com
- [ ] Affiliate tags injectable via config without code change
- [ ] Unit-tested exhaustively
- **Events:** `retailer_link_clicked` {retailer, country, bundle_id, item_tags}

#### F4: Swap & Regenerate (P0)
**Description:** "Show me another" replaces a single item (engine call scoped to one slot, respecting theme/budget/exclusions); "regenerate" refreshes a whole bundle.
**Events:** `item_swapped`, `bundle_regenerated`

#### F5: Share Links (P0)
**Description:** Any generated bundle can be persisted with a public URL `/b/<id>`, viewable without an account. OG meta tags for rich social previews.
**Events:** `bundle_shared`, `shared_bundle_viewed`

#### F6: Trending & Popular (P0 trending / P1 popular)
**Description:** Browse page. **Trending:** ~20–30 curated seasonal/evergreen bundles (admin script generates candidates via engine; owner approves). **Popular:** ranked by engagement score (link clicks, saves, shares — Convex counters).
**Events:** `trending_viewed`, `curated_bundle_opened`

#### F7: Accounts, Saved Bundles, Profiles, Reminders (P1)
**Description:** Clerk auth (Google/email). Save bundles; recipient profiles (name, age, interests, notes, past bundle memory for dedup); occasion dates trigger reminder emails (Resend) at T-14 and T-3 via daily Convex cron, deep-linking to fresh bundles.
**Acceptance criteria:**
- [ ] Guest → signup upsell only at save/profile actions
- [ ] Reminder emails stay within Resend free tier (batch cap + monitoring)
- **Events:** `signup`, `bundle_saved`, `profile_created`, `reminder_set`, `reminder_email_sent`, `reminder_email_clicked`

---

## 4. Analytics & Data Requirements (MANDATORY)

### 4.1 Data Spine

```
ACQUISITION            ACTIVATION            BUY INTENT           RETENTION
───────────            ──────────            ──────────           ─────────
• Visits by source     • Quiz start rate     • Link CTR           • Signups
• UTM attribution      • Quiz completion     • Clicks by retailer • Saved bundles
• Shared-link visits   • Bundles generated   • (later) affiliate  • Profiles/reminders
• Country mix          • Gen latency/cache     revenue            • Reminder email CTR
                                                                  • Return visits
```

**Tooling:** PostHog (free tier) for all events + funnels + dashboards; Convex counters for popularity ranking (must work without PostHog). All events fire client-side via PostHog JS with server-side capture for engine events. No ad platform integrations — $0 constraint means organic/social/content acquisition only; UTM parameters attribute those channels.

### 4.2 Core Funnel
`page_view → quiz_started → quiz_completed → bundles_generated → retailer_link_clicked` — plus retention branch `→ signup → bundle_saved / profile_created / reminder_set`.

### 4.3 Attribution
UTM standard (`utm_source/medium/campaign`) captured on first touch, stored in PostHog person properties. Shared bundle links tagged `utm_source=share`. Last-touch, 30-day window — adequate at this scale.

### 4.4 Revenue Tracking (Phase 2+)
Affiliate networks report conversions in their own dashboards (Amazon Associates, eBay Partner Network, Awin). Monthly manual import: commissions by retailer recorded in a Convex `affiliate_revenue` table to join against click data (clicks → est. EPC). True per-click attribution isn't available from Amazon — accepted limitation.

---

## 5. Technical Architecture

### 5.1 System Overview

```
┌────────────┐   ┌───────────────────┐   ┌──────────────┐
│ Next.js on │──▶│ Convex (DB, cache,│──▶│ Gemini Flash │
│ Vercel     │   │ actions, cron,    │   │ (free tier)  │
│ (+ PostHog │   │ rate limits)      │   └──────────────┘
│  + Clerk)  │   │                   │──▶ Resend (email)
└────────────┘   └───────────────────┘
      │  link-outs to Amazon/Etsy/eBay (affiliate-ready URLs)
      ▼
  Retailer sites (purchase happens there)
```

### 5.2 Data Schema (summary — see docs/data-schema.md)
Convex tables: `bundles` (generated + shared), `curatedBundles`, `users` (Clerk-linked), `recipientProfiles`, `reminders`, `engagementCounters`, `generationCache`, `rateLimits`, `affiliateRevenue` (P2).

### 5.3 Integration Points

| System | Type | Phase | Notes |
|--------|------|-------|-------|
| Gemini API | Server-side REST | 1 | Free tier; key in Convex env |
| Clerk | SDK + webhook | 2 | Free ≤10k MAU |
| Resend | API from Convex cron | 2 | 100 emails/day free |
| PostHog | JS SDK + server capture | 1 | 1M events/mo free |
| Amazon/Etsy/eBay | Outbound URLs only | 1 | No API dependency in MVP |
| eBay Browse API | REST | 3 | Live prices where available |

---

## 6. Success Metrics & KPIs

### 6.1 Primary KPIs (Headline)

| KPI | Definition | Target | Measurement |
|-----|------------|--------|-------------|
| Quiz completion rate | quiz_completed / quiz_started | ≥60% | Weekly (PostHog funnel) |
| Buy-intent CTR | sessions with retailer_link_clicked / sessions with bundles viewed | ≥25% | Weekly |
| Bundles generated | count/week | 100+ by day 90 | Weekly |
| Share rate | bundle_shared / bundles_generated | ≥5% | Weekly |

### 6.2 Secondary KPIs
| KPI | Target |
|-----|--------|
| Generation latency (p90, cache miss) | <8s |
| Cache hit rate | >20% after 30 days |
| Signup conversion (of savers) | ≥40% of save attempts complete signup |
| Reminder email CTR | ≥20% |
| Gemini quota usage | <80% of daily free quota |

### 6.3 Proof Dashboard (PostHog, free tier)
1. **Headline metrics:** weekly bundles generated, quiz completion %, buy-intent CTR, shares
2. **Funnel visualization:** the §4.2 core funnel with drop-off per stage
3. **Channel attribution:** visits + activations by utm_source (organic, social, share)
4. **Trends:** weekly time-series of all headline metrics
See `docs/dashboard-spec.md`.

---

## 7. Timeline & Milestones

See `docs/tasks.md` (source of truth). Summary:

| Milestone | Scope | Target |
|-----------|-------|--------|
| M1 Foundation | Repo, Next.js + Convex + Vercel, schema, PostHog | Week 1 |
| M2 Core MVP (P0) | Quiz, engine, links, swap, share, trending | Weeks 2–4 |
| M3 Analytics & dashboard | Full event spine, PostHog dashboards | Week 4 |
| M4 Accounts & retention (P1) | Clerk, saves, profiles, reminders, Popular tab | Weeks 5–6 |
| M5 Testing & polish | Playwright E2E ≥95%, golden fixtures, perf | Week 7 |
| M6 Launch | Domain, SEO/OG, affiliate applications | Week 8 |

---

## 8. Risks & Mitigations

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Gemini free-tier quota exhausted or terms change | Medium | High | Cache aggressively; rate-limit; fallback to trending; engine behind interface so provider is swappable |
| AI suggests poor/irrelevant items | Medium | High | Golden-fixture eval suite; "why this fits" transparency; swap button; prompt iteration |
| Amazon Associates rejection (needs traffic/sales) | Medium | Medium | Launch without tags; apply once traffic exists; eBay/Awin approve more easily |
| Retailer search URLs change format | Low | Medium | Link builder isolated + unit-tested; quick patch surface |
| Free-tier limits (Convex/Vercel/Resend) exceeded | Low | Medium | Usage monitoring; caps (reminder batch cap, rate limits); upgrade only if revenue justifies |
| Price estimates mislead users | Medium | Medium | Always framed as estimates; ranges not points |

---

## Appendix A: Glossary
| Term | Definition |
|------|------------|
| Bundle | Themed set of 3–6 complementary gift items |
| Buy-intent CTR | Share of bundle-viewing sessions that click a retailer link |
| Golden fixtures | Fixed quiz inputs with asserted engine-output invariants |
| Link builder | Pure function producing region-correct, affiliate-ready retailer URLs |

## Appendix B: How This PRD Is Used
One of four source-of-truth docs (with `docs/tasks.md`, `docs/planning.md`, `docs/checkpoint.md`). Each dev session: read all four → `superpowers:writing-plans` for the next unstarted P0/P1 → execute with TDD → verify → update tasks/checkpoint. Update this PRD whenever scope changes.
