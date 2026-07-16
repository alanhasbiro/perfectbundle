# PerfectBundle — Design Spec

**Date:** 2026-07-17
**Status:** Approved by user (brainstorming phase)

## 1. Problem & Product

People struggle to think of gifts. PerfectBundle asks a short quiz about the recipient (occasion, age, gender optional, relationship, interests, budget, delivery urgency, exclusions) and generates **gift bundles** — coherent, themed sets of 3–6 complementary items — with links to buy each item at retailers in the user's region.

**Hard constraint:** $0 to build and operate. Every service used must have a sufficient free tier. Monetization (affiliate links) is free to set up and added later.

**Target market:** Global — retailer links adapt to the user's detected country (overridable).

**Platforms:** Web first (Next.js). iOS/Android later via React Native (Expo) sharing the same backend.

## 2. Core User Flow

1. **Quiz (guest-friendly, no sign-up):** step-by-step wizard —
   occasion → recipient basics (age, gender optional, relationship) → interests (multi-pick chips + free text) → total bundle budget → delivery urgency → optional exclusions ("already has", "avoid").
2. **Generate:** engine returns **3 themed bundle options** (e.g. "The Cozy Reader"), each with 3–6 items. Per item: name, description, "why this fits" reasoning, estimated price range, tags. Per bundle: theme name, estimated total vs. budget.
3. **Act:** per-item region-aware "Find it on Amazon / Etsy / eBay" buttons; swap a single item ("show me another"); regenerate a bundle; save (prompts sign-up); share via public link.

**Delivery urgency handling (honest):** "need it fast" biases toward mainstream retailers with fast shipping and adds fast-shipping filter hints on links; "no rush" unlocks Etsy/handmade/personalized items.

## 3. Chosen Approach (from 3 options)

**Approach A + curated trending** (chosen): AI-curated engine + region-aware retailer search deep-links, plus a small curated bundle set for browsing. Rejected: B (retailer APIs first — US-skewed, approval friction, conflicts with global goal; deferred to Phase 3 as an enhancer) and C (fully hand-curated catalog — unsustainable upkeep).

## 4. Architecture & Stack ($0 mapping)

| Layer | Choice | Free tier |
|---|---|---|
| Web app | Next.js + TypeScript on Vercel | Hobby tier |
| Backend + DB + cron | Convex | Free tier |
| Auth | Clerk | Free to 10k MAU |
| AI engine | Gemini Flash (free API tier) | Free quota, server-side only |
| Email reminders | Resend | 100/day free |
| Analytics | PostHog | 1M events/mo free |
| Animations | Framer Motion | OSS |
| E2E testing | Playwright | OSS |

Mobile later: React Native (Expo) reusing Convex backend; web code keeps quiz/engine/data logic separable from UI for reuse.

## 5. Bundle Engine

- Server-side Convex action: quiz answers + user country → Gemini Flash call.
- **System prompt ("gift intelligence"):** bundles must be coherent around a theme; items complement each other; realistic price estimates that respect total budget; avoid clichés unless fitting; exclude "already has"/"avoid" items; age-appropriate safety rails (no alcohol under regional drinking age, etc.).
- **Output:** strict JSON validated with Zod: `bundles[] → {theme, rationale, estTotal, items[] → {name, description, why, estPriceRange, searchQuery, tags}}`.
- **Link builder (pure function, unit-tested):** `searchQuery` + country → retailer URLs (Amazon domain map by country, Etsy, eBay), with an **affiliate-tag slot** empty until affiliate approvals land — no refactoring later. Fast-shipping hint parameter when urgency is high.
- **Caching:** normalized quiz-combo hash → Convex cache; cache hit skips Gemini (protects quota, instant repeats).
- **Rate limiting:** per-IP and per-user caps on generation.

## 6. Accounts & Saved Features (Phase 2)

- **Guest-first:** quiz + bundles + share pages need no account.
- **Saved bundles:** per-user list; each bundle has public share URL `/b/<id>` viewable without account.
- **Recipient profiles:** name, age, interests, notes, past bundles (deduplicates future suggestions). One-click "new bundles for Mum" with pre-filled quiz.
- **Occasion reminders:** dates attached to profiles; daily Convex scheduled function; Resend email at T-14 and T-3 days with deep-link to fresh bundles.

## 7. Browse: Trending & Popular

- **Trending tab:** ~20–30 curated seasonal/evergreen bundles in Convex (admin script generates candidates via the engine; owner approves/edits; refreshed seasonally).
- **Popular tab:** auto-ranked by real engagement — retailer-link clicks (buy intent), saves, shares (Convex counters). When affiliate reporting is live, commission data refines ranking toward true "most purchased".

## 8. Monetization (all later, all free to set up)

1. **Affiliate links** — Amazon Associates, eBay Partner Network, Awin/Etsy. Primary path; link builder is pre-wired.
2. **Premium tier (much later)** — unlimited profiles/reminders; RevenueCat when mobile exists.
3. **In-app checkout / dropshipping-style middleman** — Phase 4+, explicitly parked: requires payment processing, refunds/chargebacks, tax obligations. Revisit only with meaningful traffic.

## 9. Error Handling & Trust

- AI JSON invalid → 1 automatic retry → graceful "try again" UI.
- AI quota exhausted → friendly message + serve trending bundles (app never feels dead).
- Prices always framed as estimates ("typically $15–25").
- Age-appropriate filtering in the system prompt.

## 10. Testing

- Playwright E2E: quiz → bundles → links; save/share; profile → regenerate.
- Unit: link builder (region mapping, affiliate slot, urgency hints), Zod schema validation.
- Engine quality: "golden quiz" fixture suite (e.g. $30 budget must never produce $200 bundles; exclusions respected).

## 11. Phases

- **Phase 1 (MVP):** quiz → 3 bundles → retailer links; share links; trending page. No auth.
- **Phase 2:** Clerk accounts, saved bundles, recipient profiles, occasion reminders; submit affiliate applications; Popular tab.
- **Phase 3:** eBay Browse API live prices/deals where available; engine learns from click data.
- **Phase 4:** Expo iOS/Android app; premium tier; evaluate in-app checkout.

## 12. Out of Scope (MVP)

- In-app purchasing/dropshipping (Phase 4+ decision).
- Live price guarantees.
- Non-English localization (UI is English; retailer links are region-correct).
- Native mobile apps (Phase 4).
