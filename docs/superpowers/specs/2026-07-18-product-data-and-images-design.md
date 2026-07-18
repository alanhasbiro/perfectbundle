# Design Spec — Real Product Images & Buyable Links (Sovrn + representative-image fallback)

**Date:** 2026-07-18
**Status:** Draft (awaiting owner review)
**Author:** Alan + Claude

## 1. Problem

Bundle items currently render as text with generic retailer *search* links and **no images**. The plan to enrich them via official retailer product-search APIs (Amazon PA-API, eBay, Etsy) is blocked: Etsy rejected the app; Amazon requires an already-approved Associate with qualifying sales (chicken-and-egg); eBay is still pending. This threatens three things at once:

1. **Visual quality** — photo-less cards look bland/untrustworthy.
2. **Buyability** — search links aren't a specific purchasable product (no photo, price, or in-stock signal).
3. **Revenue** — the same rejections block affiliate earning.

## 2. Key insight / the "way around"

Stop seeking per-retailer approval; go through an **affiliate aggregator that already holds those retailers' product feeds and approves publishers on day one**. **Sovrn Commerce** (formerly VigLink) is free, has no traffic minimum, and its **Product API** returns per product: name, brand, **direct purchase URL** (affiliate-attributed), **image + thumbnail**, merchant name/logo, and **retail/sale price + in-stock** — 200M+ products across hundreds of retailers (NA / Europe / Australia). One integration addresses all three problems.

Because Sovrn coverage isn't fully global and its free-tier quota must be respected, a **universal representative-image fallback** (free stock-photo API) ships first and always works — including regions/products Sovrn can't match.

## 3. Hard constraints (unchanged)

- **$0 operating cost.** Sovrn is free (revenue-share, not a fee). Stock-image API is a free tier. Both must be cached and degrade gracefully; neither may block bundle generation.
- **Global.** Where Sovrn has no match or the region is unsupported, fall back to representative image + existing search links — never a dead end.
- Keep `lib/engine` and `lib/links` free of React/Next imports (mobile reuse). Network calls to Sovrn/stock-image happen server-side in the Convex action (keys in env); only the pure query-building / response-parsing / fallback-layering logic lives in `lib`.
- Never hardcode keys; server-side (Convex env) only.
- **Affiliate disclosure** becomes mandatory once Sovrn links go live (FTC + program ToS) — a visible disclosure must appear on any page showing affiliate links.

## 4. Architecture

### 4.1 Media/link resolution layer (new)

A best-effort enrichment step runs inside `convex/generateBundles.ts` **after** Gemini output is parsed and validated, **before** the bundle is stored — so results are cached with the media baked in (no per-view refetch).

```
Gemini items → resolveItemMedia(item, country) per item →
  attach { imageUrl, imageIsRepresentative, productUrl?, productPrice?, productMerchant? } →
  store enriched bundle (cached)
```

Resolution is layered, first match wins:

1. **Sovrn provider (Phase 2)** — query the Product API with the item's `searchQuery` + country; on a match, take its image + direct purchase URL + price + merchant. `imageIsRepresentative = false`.
2. **Representative-image provider (Phase 1)** — query the free stock-image API with `searchQuery`; take the top photo. `imageIsRepresentative = true`, no product URL/price.
3. **None** — leave media absent (today's behavior). Card still renders text + search links.

Every layer is wrapped so any failure (quota, network, no match) silently falls through to the next. Media resolution **never** fails a generation.

### 4.2 Purity split

- **`src/lib/engine/media.ts`** (pure, unit-tested): `buildStockImageQuery(item)`, `buildSovrnQuery(item, country)`, `parseSovrnProduct(json)`, `parseStockImage(json)`, and `chooseItemMedia({ sovrn, stock })` implementing the first-match-wins layering. No `fetch`, no env.
- **`convex/generateBundles.ts`** (server): performs the actual `fetch` to Sovrn / stock-image using env keys, feeds raw responses into the pure parsers, applies `chooseItemMedia`, attaches the result. Guarded by try/catch per provider.

### 4.3 Link builder interplay

`src/lib/links/retailer-links.ts` stays as-is and remains the fallback + the always-present "search at other retailers" options. When a Sovrn `productUrl` exists, the card shows it as the **primary "Buy" button** (affiliate-attributed, real merchant), with the existing search links demoted to secondary "find elsewhere" links.

## 5. Data model changes

Extend the `bundleItem` shape (in `convex/schema.ts` for both `bundles.items` and `curatedBundles.items`, the engine Zod schema, and `src/lib/quiz/types.ts` / bundle-card types) with optional fields:

```
imageUrl?: string
imageIsRepresentative?: boolean   // true = stock photo, false = actual product photo
productUrl?: string               // Sovrn direct, affiliate-attributed buy link
productPrice?: string             // real price string from Sovrn (still shown as an estimate elsewhere)
productMerchant?: string          // e.g. "Etsy", "Walmart"
```

All optional → existing stored bundles and curated bundles remain valid without migration. Curated bundles get enriched by a one-off admin re-run (or lazily; out of scope for Phase 1).

## 6. UI changes (`BundleCard` + pages)

- Render `imageUrl` as the item thumbnail. When `imageIsRepresentative`, overlay a small muted **"representative image"** caption so we never imply it's the exact product.
- When `productUrl`/`productPrice`/`productMerchant` present: show a primary **"Buy at {merchant}"** button and the real price; keep `estPriceRange` copy honest ("est.") for items without a real price.
- Add a one-line **affiliate disclosure** on results, share (`/b/[id]`), trending, and popular pages (e.g. *"Some links are affiliate links — we may earn a small commission at no cost to you."*). Gated to render only once affiliate links are actually live (Phase 2), but the component ships in Phase 1.

## 7. Phasing

**Phase 1 — Representative images (ships now, no external approval):**
- Stock-image provider, `lib/engine/media.ts` pure logic + tests, schema/type fields, resolution step in the action (Sovrn layer stubbed/off), `BundleCard` image + "representative" label, disclosure component (dormant).
- Owner action: obtain a free stock-image API key (see §9) — 1 minute — OR use the key-free source if preferred.

**Phase 2 — Sovrn real products + links + revenue (lights up when key lands):**
- Sovrn provider wired as layer 1; `productUrl`/price/merchant populated; primary Buy button; disclosure activated; affiliate config flipped on.
- Owner action: Sovrn signup + approved campaign + Product-API key (walked through separately).

**Upside (no work required):** if Amazon/eBay ever approve, add them as extra link options; Sovrn + representative fallback is the steady state regardless.

## 8. Testing

- **Unit (Vitest):** `buildStockImageQuery`, `buildSovrnQuery`, `parseSovrnProduct`, `parseStockImage`, `chooseItemMedia` (layering: sovrn-wins, stock-fallback, none). Pure, no network.
- **Golden fixtures:** unchanged — engine output invariants still hold; media is attached post-parse and is optional.
- **E2E (Playwright):** extend the test seed to include a bundle with `imageUrl` + `imageIsRepresentative` and (Phase 2) a `productUrl`; assert the image, the representative label, and the Buy button render. Reuse the `convex/testSupport.ts` seed pattern.
- **Resilience:** a unit/integration check that a provider throwing/timing out yields a bundle with no media rather than a failed generation.

## 9. Open items / owner actions

- **Sovrn:** create free Commerce account → add `perfectbundle.vercel.app` campaign → await approval → Settings page → 🔑 icon → API key + account ID; confirm Product API enabled. (Phase 2 unblock.)
- **Stock-image source (Phase 1):** default **Pexels** (free API key, ~200 req/hr, instant signup — better product relevance). Key-free alternative: **Openverse** (`api.openverse.org`, no auth, Creative-Commons images, lower relevance). Owner picks; I'll walk through whichever.
- **Coverage:** confirm Sovrn's supported regions to set the fallback boundary (non-NA/EU/AU → representative + search links).
- **Quota discipline:** media resolution runs only on cache-miss generation (≤ existing 10/hr/user rate limit × ~12 items); add a per-provider soft cap + skip-on-error. Confirm Sovrn Product-API rate limits from the developer center when the key lands.

## 10. Out of scope

- Real-time price refresh on view (prices captured at generation time, still framed as estimates).
- Backfilling media onto historical bundles (lazy/admin re-run later).
- Third-party scraper APIs (RapidAPI/Apify/SerpApi) — ToS-gray, reliability risk; only revisit as an experimental extra source if Sovrn coverage proves thin.
