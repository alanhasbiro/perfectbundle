# monetization.md — PerfectBundle Revenue Strategy

> How PerfectBundle makes money **without breaking the $0-operating-cost rule**.
> Every phase below stays free-to-run until it is itself earning. No fixed
> monthly fees are introduced at any stage — only revenue-share tools (which
> cost nothing until money flows) and, optionally, a ~$10/yr domain.

---

## 0. Guiding Principles

1. **Affiliate-first.** It's already architected (link builder has affiliate-tag
   slots), it's truly $0, and it monetizes the core action (clicking out to buy)
   without asking the user for a cent. Everything else layers on top.
2. **Trust is the asset.** The moment recommendations feel "paid for," the app
   dies. Sponsored placement and markups must be labelled and never override the
   "best gift" logic. Affiliate disclosure is legally required (FTC) *and* good
   for trust.
3. **Money follows traffic.** Most channels (program approvals, sponsorships,
   premium conversions) only unlock once there's real, sustained traffic. So the
   near-term job is: ship features that drive **repeat visits and outbound
   clicks**, and instrument them.
4. **Never gate the magic.** The core quiz→bundles→buy loop stays free forever.
   We monetize *depth, convenience, and volume* — not access.

---

## 1. Revenue Streams (ranked by fit)

### A. Affiliate commissions — PRIMARY, start now
Users click "buy" links; retailers pay a % of resulting sales. Zero cost, zero
user friction, already 80% built.

| Program | Typical rate | Cookie | Notes |
|---------|-------------|--------|-------|
| Amazon Associates | 1–4% (category-dependent; home/kitchen/toys ~3%) | 24h | Needs 3 qualifying sales in 180 days to stay in + unlock PA-API. Biggest catalog → apply first. |
| eBay Partner Network | 1–4% | 24h | Easy approval, global. |
| Etsy (via Awin) | 4–8% | 30d | Higher rate + longer cookie; great for the "thoughtful/handmade" bundles. |
| Awin network | varies | varies | One approval → hundreds of retailers (gift, home, experience brands). |
| Sovrn / Skimlinks | varies | varies | Auto-affiliate fallback for any un-covered link; good safety net. |

**Realistic math (illustrative, not a promise):**
`monthly revenue ≈ visitors × quiz-completion% × click-through% × conversion% × AOV × commission%`
e.g. `10,000 visitors × 60% × 25% × 5% × $45 × 3% ≈ $100/mo` at modest scale;
scales roughly linearly with traffic. Etsy/Awin at 6–8% roughly doubles the
per-sale take vs Amazon. **This is a volume game** — the product work that grows
traffic (SEO, sharing, reminders, seasonal collections) *is* the revenue work.

**To activate (mostly owner steps + small build):**
- [ ] Apply to Amazon Associates, eBay Partner Network, Awin (owner; needs the
      live site, which we have).
- [ ] Drop approved tags into Convex env (`AFFILIATE_TAG_AMAZON`,
      `AFFILIATE_ID_EBAY`, `AFFILIATE_ID_AWIN`) — slots already wired in
      `src/lib/links/retailer-links.ts`.
- [ ] Ship the **affiliate disclosure** UI (legally required once tags live).
- [ ] Add a **"Buy the whole bundle"** aggregate CTA (one click = all items,
      each tagged) to lift click-through.
- [ ] Instrument `retailer_link_clicked` by retailer/bundle (already fires) →
      PostHog revenue-proxy dashboard (est. earnings-per-click).

### B. Premium tier — "PerfectBundle Plus" (Phase 2, once there's demand)
A light subscription (or one-time unlock) for power users. Free tier stays fully
usable; Plus removes limits and adds convenience.

| Free | Plus (~$3–5/mo or ~$29/yr) |
|------|----------------------------|
| 3 bundles per quiz | More bundles + unlimited regenerations |
| Rate-limited generation | Priority (no wait) |
| Save bundles | Saved **recipient profiles** + occasion reminders (unlimited) |
| — | Ad-free / no sponsored items |
| — | Early seasonal collections, price-drop alerts (when price API lands) |

Billing via **Clerk Billing** or **Stripe** — both are revenue-share (%-per-txn,
**no fixed monthly fee**), so this stays $0-to-run until it earns. Conversion
pressure comes from *naturally* hitting free limits, never from crippling core
use.

### C. B2B / corporate & bulk gifting (Phase 2–3, highest AOV)
HR/office managers gifting employees or clients. Much larger order values and
repeat cycles. A "gift 10+ people" flow, optional per-order service fee, or a
flat B2B plan. Reachable once we have consumer traction to point to.

### D. Sponsored / featured products (Phase 3, needs traffic)
Brands pay to be *considered* for relevant bundles or featured in Trending —
**clearly labelled**, never displacing genuinely-better picks. Only credible
once we have an audience to sell. Protect trust ruthlessly here.

### E. Dropshipping / middleman markup (Phase 4+, parked — high ops)
The original "act as third party, add markup, hold no inventory" idea. Highest
revenue *per sale* but brings payments, refunds, chargebacks, customer service,
supplier reliability, and tax/VAT — all of which break the low-ops, $0-cost,
no-payment-data posture. Revisit **only** after affiliate proves sustained
demand and there's margin to fund the operational overhead. Affiliate is the
same loop with none of the liability, so it comes first by a wide margin.

### F. White-label / engine API (Phase 4+, opportunistic)
License the bundle engine (`lib/engine`, deliberately UI-independent) to other
gift/registry sites. Only if inbound interest appears.

---

## 2. Phased Rollout (tied to traffic, not dates)

| Phase | Trigger | Focus | Cost |
|-------|---------|-------|------|
| **1. Affiliate foundation** | Now | Apply to programs; ship disclosure + "buy whole bundle" + tag injection; grow traffic (SEO, sharing, reminders, seasonal). | $0 |
| **2. Convert & retain** | ~1k visits/wk & programs approved | PerfectBundle Plus (Clerk/Stripe billing); recipient profiles + reminders drive repeat visits; A/B the upsell. | $0 to run |
| **3. Scale demand-side** | Steady 5k+ visits/wk | B2B/bulk flow; sponsored placements; eBay/Etsy live-price APIs for richer cards. | $0 to run |
| **4. Optional high-touch** | Proven revenue | Evaluate dropshipping and/or white-label — only if margin justifies the ops. | funded by revenue |

---

## 3. Features That Directly Drive Revenue (build backlog)

These grow traffic or clicks, so they *are* monetization work:

- **Affiliate disclosure banner** — required before tags go live. *(quick, $0, build now)*
- **"Buy the whole bundle" CTA** — one aggregate outbound action, more tagged clicks.
- **Occasion reminders** (M4) — email brings users *back* at high-intent moments = repeat affiliate clicks. Highest-leverage retention feature.
- **Seasonal collections** (Christmas, Valentine's, Mother's/Father's Day, graduations) — these are the peak gift-buying (and affiliate-earning) windows; pre-built curated sets capture SEO + social.
- **Shareable bundles** (built) — each share is a free new visitor at the top of the funnel.
- **SEO surfaces** — indexable curated/seasonal pages (sitemap already live) for long-tail "gift for X" searches, the cheapest sustainable traffic.
- **Price-drop / back-in-stock alerts** — needs a retailer price API (currently blocked); revisit when eBay/Etsy access lands.
- **Gift w’rap & personal note options**, **group/split gifting**, **wishlists/registries** — convenience features that raise completion and repeat use.

---

## 4. Compliance Checklist (before any tags go live)

- [ ] Visible **FTC affiliate disclosure** on any page with affiliate links (+ program ToS compliance).
- [ ] Cookie-consent for analytics already required (GDPR, global) — keep affiliate cookies inside that consent.
- [ ] Never present estimated prices as live quotes (existing rule) — affiliate pages must keep the "estimate" framing.
- [ ] Keep recommendations honest: sponsored/markup items always labelled, never displacing the genuinely-best pick.

---

*Companion docs: `docs/prd.md` (product), `docs/planning.md` (stack/cost policy),
`docs/tasks.md` (milestones). This file is the canonical revenue reference —
update it as programs are approved and phases advance.*
