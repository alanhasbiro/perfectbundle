# eBay Real Products + Affiliate-Tag Client-Env Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix a pre-existing bug where the Amazon/eBay affiliate tags never reach outbound links (client-side env var read incorrectly), verify the new Unsplash/Pexels image keys work live, and wire eBay's now-approved Browse API as the primary real-product-data layer (real photo + direct item link + real price), ahead of representative images.

**Architecture:** eBay's Browse API needs an OAuth2 client-credentials token (fetched once per generation, not per item) plus a per-item search call. A pure `parseEbayItemSummary` (mirroring the existing `parsePexelsResponse`/`parseUnsplashResponse` pattern) extracts the shape into the existing `ProductMedia` type. `chooseItemMedia`'s `sovrn` parameter is renamed to `realProduct` since eBay — not Sovrn — is now the live provider; Sovrn stays available as a future alternate `realProduct` source behind the same seam. The OAuth token fetch and search fetch are impure and live in `convex/generateBundles.ts`, matching the existing Pexels/Unsplash pattern.

## Global Constraints

- **$0 operating cost** — eBay Browse API free tier; no new paid services.
- **Never blocks generation** — every eBay call is try/catch-guarded; a failure silently falls through to the representative-image layer, exactly like Pexels/Unsplash today.
- Keep `src/lib/engine/media.ts` free of `fetch`/env access — pure parsing/mapping only; the actual HTTP calls live in `convex/generateBundles.ts`.
- Convex's default (non-`"use node"`) runtime supports `fetch` and standard Web globals (`btoa`) but NOT Node's `Buffer` — use `btoa` for the OAuth Basic-auth header, not `Buffer.from(...).toString("base64")`.
- Etsy stays removed (already done). Amazon has no direct product-data API in this app (PA-API requires qualifying sales — out of scope); Amazon's contribution here is only the affiliate tag on its existing search link.
- All new item fields remain optional — no schema migration needed for existing stored bundles.

---

## Task 1: Fix the Amazon/eBay affiliate-tag client-env-var bug

**Context:** `src/lib/links/retailer-links.ts` reads `process.env.AFFILIATE_TAG_AMAZON` / `process.env.AFFILIATE_ID_EBAY` at call time. It's called from `src/components/bundles/bundle-card.tsx`, which is a `"use client"` component. Next.js only inlines env vars prefixed `NEXT_PUBLIC_` into the browser bundle — `next.config.ts` has no `env` block adding an exception. So today, even with the vars set in Vercel, the browser-side call always sees `undefined` and never appends the affiliate tag. This predates this session; found while verifying the "flip on Amazon's tag" step.

**Files:**
- Modify: `src/lib/links/retailer-links.ts`
- Modify: `src/lib/links/retailer-links.test.ts`
- Modify: `docs/planning.md` (env var appendix)
- Modify: `.env.local` (rename, not a new value — no secret exposure)

**Interfaces:**
- Produces: `buildRetailerLinks` behavior unchanged from the caller's perspective; only the env var *names* it reads change.

- [ ] **Step 1: Update the failing-then-passing test names/vars**

In `src/lib/links/retailer-links.test.ts`, update the `beforeEach`/`afterEach` block and the two affiliate-tag tests to use the `NEXT_PUBLIC_` names:

```ts
describe("buildRetailerLinks", () => {
  const OLD_ENV = process.env;
  beforeEach(() => {
    process.env = { ...OLD_ENV };
    delete process.env.NEXT_PUBLIC_AFFILIATE_TAG_AMAZON;
    delete process.env.NEXT_PUBLIC_AFFILIATE_ID_EBAY;
  });
  afterEach(() => {
    process.env = OLD_ENV;
  });
```

And:

```ts
  it("omits affiliate tag params when env vars are unset", () => {
    const links = buildRetailerLinks("mug", "US", "normal");
    const amazon = links.find((l) => l.retailer === "amazon")!;
    expect(amazon.url).not.toContain("tag=");
    const ebay = links.find((l) => l.retailer === "ebay")!;
    expect(ebay.url).not.toContain("campid=");
  });

  it("includes affiliate tag params when env vars are set", () => {
    process.env.NEXT_PUBLIC_AFFILIATE_TAG_AMAZON = "pbtag-20";
    process.env.NEXT_PUBLIC_AFFILIATE_ID_EBAY = "pb-ebay-123";
    const links = buildRetailerLinks("mug", "US", "normal");
    const amazon = links.find((l) => l.retailer === "amazon")!;
    expect(amazon.url).toContain("tag=pbtag-20");
    const ebay = links.find((l) => l.retailer === "ebay")!;
    expect(ebay.url).toContain("campid=pb-ebay-123");
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/links/retailer-links.test.ts`
Expected: FAIL — the "includes affiliate tag params" test fails because the implementation still reads the old (un-prefixed) var names, so `tag=`/`campid=` are absent.

- [ ] **Step 3: Fix the implementation**

In `src/lib/links/retailer-links.ts`, update both readers:

```ts
function buildAmazonUrl(query: string, country: string, urgency: string): string {
  const domain = amazonDomainForCountry(country);
  const params = new URLSearchParams({ k: query });
  const tag = process.env.NEXT_PUBLIC_AFFILIATE_TAG_AMAZON;
  if (tag) params.set("tag", tag);
  let url = `https://www.${domain}/s?${params.toString()}`;
  if (urgency === "fast") url += `&${AMAZON_FAST_SHIPPING_PARAM}`;
  return url;
}
```

```ts
function buildEbayUrl(query: string): string {
  const params = new URLSearchParams({ _nkw: query });
  const campid = process.env.NEXT_PUBLIC_AFFILIATE_ID_EBAY;
  if (campid) params.set("campid", campid);
  return `https://www.ebay.com/sch/i.html?${params.toString()}`;
}
```

Add a one-line comment above `buildAmazonUrl` explaining why the prefix matters (so it isn't "fixed" back by a future edit):

```ts
// NOTE: these must be NEXT_PUBLIC_-prefixed — this module is called from a
// "use client" component (BundleCard), and Next.js only inlines env vars with
// that prefix into the browser bundle. A bare `AFFILIATE_TAG_AMAZON` here is
// always undefined at runtime in the browser (found + fixed 2026-07-19).
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/links/retailer-links.test.ts`
Expected: PASS (all tests green).

- [ ] **Step 5: Rename the var in `.env.local` (value preserved, never printed)**

Run:
```bash
sed -i 's/^AFFILIATE_TAG_AMAZON=/NEXT_PUBLIC_AFFILIATE_TAG_AMAZON=/' .env.local
```
Expected: the line's key changes; its value is untouched. Confirm by name only: `grep -c '^NEXT_PUBLIC_AFFILIATE_TAG_AMAZON=' .env.local` should print `1`.

- [ ] **Step 6: Update the env var appendix in `docs/planning.md`**

Change:
```
# Affiliate tags (Amazon + eBay approved 2026-07-18; Etsy REMOVED — app rejected)
AFFILIATE_TAG_AMAZON=     # Associates store/tracking id, appended as ?tag=
AFFILIATE_ID_EBAY=        # EPN campaign id, appended as ?campid=
```
to:
```
# Affiliate tags for OUTBOUND SEARCH LINKS (client-side — MUST be NEXT_PUBLIC_
# prefixed, this module runs in the browser via BundleCard). Amazon + eBay
# approved 2026-07-18; Etsy REMOVED — app rejected.
NEXT_PUBLIC_AFFILIATE_TAG_AMAZON=   # Associates store/tracking id, appended as ?tag=
NEXT_PUBLIC_AFFILIATE_ID_EBAY=      # EPN campaign id, appended as ?campid= (fallback search link only)

# eBay Partner Network campaign id for REAL product buy links (server-side,
# Convex env — separate from the NEXT_PUBLIC_ one above, which only tags the
# fallback search link). Optional: without it, eBay Browse API links still
# work, just untagged for commission.
AFFILIATE_ID_EBAY=
```

- [ ] **Step 7: Commit**

```bash
git add src/lib/links/retailer-links.ts src/lib/links/retailer-links.test.ts docs/planning.md .env.local
git commit -m "fix(links): affiliate tags need NEXT_PUBLIC_ prefix to reach the browser bundle"
```

Note: `.env.local` is expected to already be gitignored in this project (it holds secrets); if `git add .env.local` reports it's ignored, that's correct — skip it in the commit, the rename still took effect locally.

---

## Task 2: Push corrected Pexels + new Unsplash keys to Convex; verify live

**Files:** none (operational task — env sync + live verification, no code changes).

- [ ] **Step 1: Push both keys to Convex env, without ever printing their values**

```bash
PEXELS_VAL=$(grep '^PEXELS_API_KEY=' .env.local | cut -d= -f2- | tr -d '\r')
npx convex env set PEXELS_API_KEY "$PEXELS_VAL"
UNSPLASH_VAL=$(grep '^UNSPLASH_ACCESS_KEY=' .env.local | cut -d= -f2- | tr -d '\r')
npx convex env set UNSPLASH_ACCESS_KEY "$UNSPLASH_VAL"
```
Expected: two `✔ Successfully set` confirmations.

- [ ] **Step 2: Push a fresh Convex deploy so the running functions pick up the new env values**

Run: `npx convex dev --once`
Expected: `Convex functions ready!`

- [ ] **Step 3: Run a real, uncached generation and inspect the image fields**

```bash
UNIQ="img-verify-$(date +%s)-$RANDOM"
OUT=$(npx convex run generateBundles:generate "{\"quiz\":{\"occasion\":\"Birthday\",\"ageBand\":\"25-34\",\"relationship\":\"Friend\",\"interests\":[\"Coffee & tea\"],\"budget\":50,\"currency\":\"USD\",\"urgency\":\"normal\",\"exclusions\":[],\"country\":\"US\",\"freeText\":\"$UNIQ\"},\"rateLimitKey\":\"$UNIQ\"}" 2>/dev/null)
IDS=$(node -e "process.stdout.write(JSON.stringify(JSON.parse(process.argv[1]).bundleIds))" "$OUT")
npx convex run bundles:getByIds "{\"ids\":$IDS}" 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const a=JSON.parse(s);for(const it of a[0].items){console.log('-',it.name,'| source:',it.imageSource,'| img:',(it.imageUrl||'MISSING').slice(0,55))}})"
```
Expected: every item shows `source: unsplash` (or `pexels` if Unsplash had no match) and a real `img:` URL — not `MISSING`.

If any item is still `MISSING`, do not proceed to Task 3 with the assumption images work — debug the specific key exactly as done earlier in this project (direct `curl` against the provider with a novel, non-cached query to rule out CDN caching masking a bad key).

- [ ] **Step 4: No commit** — this task is operational verification only.

---

## Task 3: eBay pure logic + generalize `chooseItemMedia`'s real-product slot

**Files:**
- Modify: `src/lib/engine/media.ts`
- Modify: `src/lib/engine/media.test.ts`

**Interfaces:**
- Consumes: `ProductMedia` (existing shape, unchanged: `imageUrl`, `productUrl`, `productPrice`, `productMerchant`).
- Produces:
  - `ebayMarketplaceForCountry(country: string): string` — maps a country code to an eBay marketplace ID, default `"EBAY_US"`.
  - `formatEbayPrice(value: string, currency: string): string` — e.g. `("24.99", "USD") -> "$24.99"`; unmapped currencies render as `"24.99 EUR"`.
  - `parseEbayItemSummary(json: unknown): ProductMedia | null` — extracts the first `itemSummaries[]` entry into `ProductMedia`, `productMerchant` hardcoded to `"eBay"`.
  - `chooseItemMedia(sources: { realProduct: ProductMedia | null; stock: StockImage | null }): ItemMedia` — **renamed** from `{ sovrn, stock }`. This is a breaking rename of an internal pure function; Task 5 updates the only caller.

- [ ] **Step 1: Write the failing tests**

Replace the `chooseItemMedia` describe block's `sovrn` usages and add three new describe blocks. In `src/lib/engine/media.test.ts`, add these imports:

```ts
import {
  buildStockImageQuery,
  parseUnsplashResponse,
  parsePexelsResponse,
  parseEbayItemSummary,
  ebayMarketplaceForCountry,
  formatEbayPrice,
  chooseItemMedia,
  type ProductMedia,
  type StockImage,
} from "./media";
```

Add these new `describe` blocks (after the existing `parsePexelsResponse` block, before `chooseItemMedia`):

```ts
describe("ebayMarketplaceForCountry", () => {
  it("maps known countries to their eBay marketplace id", () => {
    expect(ebayMarketplaceForCountry("US")).toBe("EBAY_US");
    expect(ebayMarketplaceForCountry("GB")).toBe("EBAY_GB");
    expect(ebayMarketplaceForCountry("DE")).toBe("EBAY_DE");
    expect(ebayMarketplaceForCountry("AU")).toBe("EBAY_AU");
  });

  it("falls back to EBAY_US for unmapped countries", () => {
    expect(ebayMarketplaceForCountry("ZZ")).toBe("EBAY_US");
  });
});

describe("formatEbayPrice", () => {
  it("uses a currency symbol when known", () => {
    expect(formatEbayPrice("24.99", "USD")).toBe("$24.99");
    expect(formatEbayPrice("19.50", "GBP")).toBe("£19.50");
    expect(formatEbayPrice("30.00", "EUR")).toBe("€30.00");
  });

  it("falls back to 'value CURRENCY' for unknown currencies", () => {
    expect(formatEbayPrice("100", "SEK")).toBe("100 SEK");
  });
});

describe("parseEbayItemSummary", () => {
  it("extracts the first item into ProductMedia, merchant hardcoded to eBay", () => {
    const json = {
      itemSummaries: [
        {
          title: "Vintage Camera",
          price: { value: "45.00", currency: "USD" },
          image: { imageUrl: "https://i.ebayimg.com/a.jpg" },
          itemWebUrl: "https://www.ebay.com/itm/123",
        },
      ],
    };
    expect(parseEbayItemSummary(json)).toEqual({
      imageUrl: "https://i.ebayimg.com/a.jpg",
      productUrl: "https://www.ebay.com/itm/123",
      productPrice: "$45.00",
      productMerchant: "eBay",
    });
  });

  it("prefers itemAffiliateWebUrl over itemWebUrl when both are present", () => {
    const json = {
      itemSummaries: [
        {
          title: "Vintage Camera",
          price: { value: "45.00", currency: "USD" },
          image: { imageUrl: "https://i.ebayimg.com/a.jpg" },
          itemWebUrl: "https://www.ebay.com/itm/123",
          itemAffiliateWebUrl: "https://www.ebay.com/itm/123?campid=aff",
        },
      ],
    };
    expect(parseEbayItemSummary(json)?.productUrl).toBe(
      "https://www.ebay.com/itm/123?campid=aff"
    );
  });

  it("returns null when there are no items or required fields are missing", () => {
    expect(parseEbayItemSummary({ itemSummaries: [] })).toBeNull();
    expect(parseEbayItemSummary({})).toBeNull();
    expect(parseEbayItemSummary(null)).toBeNull();
    expect(
      parseEbayItemSummary({ itemSummaries: [{ title: "No image or url" }] })
    ).toBeNull();
  });
});
```

Update the `chooseItemMedia` describe block to use `realProduct` instead of `sovrn`:

```ts
describe("chooseItemMedia", () => {
  const product: ProductMedia = {
    imageUrl: "https://cdn.example.com/real.jpg",
    productUrl: "https://buy.example.com/item?aff=1",
    productPrice: "$24.00",
    productMerchant: "eBay",
  };

  const stock: StockImage = {
    url: "https://stock/x.jpg",
    creditName: "Ada Lovelace",
    creditUrl: "https://unsplash.com/@ada",
    source: "unsplash",
  };

  it("uses the real product when present (not representative, no stock credit)", () => {
    expect(chooseItemMedia({ realProduct: product, stock })).toEqual({
      imageUrl: "https://cdn.example.com/real.jpg",
      imageIsRepresentative: false,
      productUrl: "https://buy.example.com/item?aff=1",
      productPrice: "$24.00",
      productMerchant: "eBay",
    });
  });

  it("falls back to the stock image, flagged representative, with credit", () => {
    expect(chooseItemMedia({ realProduct: null, stock })).toEqual({
      imageUrl: "https://stock/x.jpg",
      imageIsRepresentative: true,
      imageCreditName: "Ada Lovelace",
      imageCreditUrl: "https://unsplash.com/@ada",
      imageSource: "unsplash",
    });
  });

  it("returns empty media when nothing is available", () => {
    expect(chooseItemMedia({ realProduct: null, stock: null })).toEqual({});
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/engine/media.test.ts`
Expected: FAIL — `parseEbayItemSummary`, `ebayMarketplaceForCountry`, `formatEbayPrice` don't exist; `chooseItemMedia({ realProduct: ... })` doesn't match the current `{ sovrn: ... }` signature.

- [ ] **Step 3: Implement**

In `src/lib/engine/media.ts`, add the eBay marketplace map and price formatter near the top (after the `StockImage`/`ItemMedia` interfaces):

```ts
const EBAY_MARKETPLACE_BY_COUNTRY: Record<string, string> = {
  US: "EBAY_US",
  GB: "EBAY_GB",
  DE: "EBAY_DE",
  AU: "EBAY_AU",
  CA: "EBAY_CA",
  FR: "EBAY_FR",
  IT: "EBAY_IT",
  ES: "EBAY_ES",
  NL: "EBAY_NL",
  CH: "EBAY_CH",
  AT: "EBAY_AT",
  BE: "EBAY_BE",
  IE: "EBAY_IE",
  IN: "EBAY_IN",
  SG: "EBAY_SG",
  MY: "EBAY_MY",
  PH: "EBAY_PH",
  PL: "EBAY_PL",
  TH: "EBAY_TH",
  TW: "EBAY_TW",
};

export function ebayMarketplaceForCountry(country: string): string {
  return EBAY_MARKETPLACE_BY_COUNTRY[country] ?? "EBAY_US";
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$",
  GBP: "£",
  EUR: "€",
  CAD: "$",
  AUD: "$",
  JPY: "¥",
};

export function formatEbayPrice(value: string, currency: string): string {
  const symbol = CURRENCY_SYMBOLS[currency];
  return symbol ? `${symbol}${value}` : `${value} ${currency}`;
}
```

Add `parseEbayItemSummary` after `parsePexelsResponse`:

```ts
// Extracts the first item from an eBay Browse API item_summary/search
// response into ProductMedia. Field paths: itemSummaries[].image.imageUrl,
// .itemWebUrl (falls back from .itemAffiliateWebUrl when the request included
// an affiliate campaign id), .price.value/.currency. Merchant is always shown
// as "eBay" (the seller username isn't a recognizable "buy at X" merchant).
export function parseEbayItemSummary(json: unknown): ProductMedia | null {
  const root = asRecord(json);
  if (!root) return null;
  const items = root.itemSummaries;
  if (!Array.isArray(items) || items.length === 0) return null;
  const first = items[0] as {
    image?: { imageUrl?: unknown };
    itemWebUrl?: unknown;
    itemAffiliateWebUrl?: unknown;
    price?: { value?: unknown; currency?: unknown };
  } | null;
  const imageUrl = first?.image?.imageUrl;
  const productUrl = first?.itemAffiliateWebUrl ?? first?.itemWebUrl;
  const priceValue = first?.price?.value;
  const priceCurrency = first?.price?.currency;
  if (
    typeof imageUrl !== "string" ||
    imageUrl.length === 0 ||
    typeof productUrl !== "string" ||
    productUrl.length === 0 ||
    typeof priceValue !== "string" ||
    typeof priceCurrency !== "string"
  ) {
    return null;
  }
  return {
    imageUrl,
    productUrl,
    productPrice: formatEbayPrice(priceValue, priceCurrency),
    productMerchant: "eBay",
  };
}
```

Update `chooseItemMedia`'s signature and body (rename `sovrn` → `realProduct`):

```ts
export function chooseItemMedia(sources: {
  realProduct: ProductMedia | null;
  stock: StockImage | null;
}): ItemMedia {
  if (sources.realProduct) {
    return {
      imageUrl: sources.realProduct.imageUrl,
      imageIsRepresentative: false,
      productUrl: sources.realProduct.productUrl,
      productPrice: sources.realProduct.productPrice,
      productMerchant: sources.realProduct.productMerchant,
    };
  }
  if (sources.stock) {
    return {
      imageUrl: sources.stock.url,
      imageIsRepresentative: true,
      imageCreditName: sources.stock.creditName,
      imageCreditUrl: sources.stock.creditUrl,
      imageSource: sources.stock.source,
    };
  }
  return {};
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/engine/media.test.ts`
Expected: PASS (all tests green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/engine/media.ts src/lib/engine/media.test.ts
git commit -m "feat(images): eBay parsing/marketplace/price logic; generalize chooseItemMedia to realProduct"
```

---

## Task 4: Wire eBay OAuth + Browse API search into the generation action

**Files:**
- Modify: `convex/generateBundles.ts`

**Interfaces:**
- Consumes: `parseEbayItemSummary`, `ebayMarketplaceForCountry`, `chooseItemMedia` (Task 3), `ProductMedia` type.
- Produces: `enrichBundlesWithMedia` now takes a `country: string` parameter (the eBay marketplace and search need it); items get real `productUrl`/`productPrice`/`productMerchant` when eBay has a match.

- [ ] **Step 1: Update imports**

```ts
import {
  buildStockImageQuery,
  parseUnsplashResponse,
  parsePexelsResponse,
  parseEbayItemSummary,
  ebayMarketplaceForCountry,
  chooseItemMedia,
  type StockImage,
  type ProductMedia,
} from "../src/lib/engine/media";
```

- [ ] **Step 2: Add the eBay OAuth token fetch and per-item search, after `fetchStockImage`**

```ts
// eBay OAuth2 client-credentials grant. One token is fetched per generation
// call (not per item) — simpler than persisting a token cache across Convex
// action invocations, and well within eBay's free-tier call limits at this
// app's scale (see docs/superpowers/plans/2026-07-19-ebay-real-products-affiliate-fix.md).
// Convex's default runtime has no Node `Buffer`; `btoa` (a standard Web
// global) covers the ASCII-only Basic-auth header eBay expects.
async function getEbayToken(): Promise<string | null> {
  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  try {
    const basic = btoa(`${clientId}:${clientSecret}`);
    const res = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${basic}`,
      },
      body: "grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { access_token?: string };
    return json.access_token ?? null;
  } catch {
    return null;
  }
}

// Searches eBay's Browse API for a real, buyable product matching the query.
// Never throws — a failure here means the item falls back to a representative
// stock image instead, exactly like every other media provider in this file.
async function fetchEbayProduct(
  query: string,
  country: string,
  token: string
): Promise<ProductMedia | null> {
  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      "X-EBAY-C-MARKETPLACE-ID": ebayMarketplaceForCountry(country),
    };
    const campaignId = process.env.AFFILIATE_ID_EBAY;
    if (campaignId) headers["X-EBAY-C-ENDUSERCTX"] = `affiliateCampaignId=${campaignId}`;
    const url = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(query)}&limit=1`;
    const res = await fetch(url, { headers });
    if (!res.ok) return null;
    return parseEbayItemSummary(await res.json());
  } catch {
    return null;
  }
}
```

- [ ] **Step 3: Update `enrichBundlesWithMedia` to fetch one eBay token and pass `country` through**

Replace the existing function:

```ts
async function enrichBundlesWithMedia(
  bundles: BundleContent[],
  country: string
): Promise<BundleContent[]> {
  const ebayToken = await getEbayToken();
  return Promise.all(
    bundles.map(async (bundle) => ({
      ...bundle,
      items: await Promise.all(
        bundle.items.map(async (item) => {
          const realProduct = ebayToken
            ? await fetchEbayProduct(buildStockImageQuery(item), country, ebayToken)
            : null;
          const stock = await fetchStockImage(buildStockImageQuery(item));
          const media = chooseItemMedia({ realProduct, stock });
          return { ...item, ...media };
        })
      ),
    }))
  );
}
```

Note: `stock` is still fetched even when `realProduct` is present — this is intentionally simple (avoids a conditional fetch path) and the extra Pexels/Unsplash call is discarded by `chooseItemMedia` when `realProduct` wins. This trades a few wasted stock-image calls for simpler code; acceptable at this app's scale (rate-limited to 10 generations/hour/user).

- [ ] **Step 4: Update the call site to pass `quiz.country`**

Find the existing call (currently `const enrichedBundles = await enrichBundlesWithMedia(parsed.bundles);`) and change it to:

```ts
    const enrichedBundles = await enrichBundlesWithMedia(parsed.bundles, quiz.country);
```

- [ ] **Step 5: Verify — Convex push, typecheck, full unit regression**

Run: `npx convex dev --once`
Expected: functions ready, no errors.

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npx vitest run`
Expected: all green (this task changed no pure-module contracts beyond Task 3's already-tested rename).

- [ ] **Step 6: Commit**

```bash
git add convex/generateBundles.ts
git commit -m "feat(images): wire eBay Browse API as the primary real-product layer"
```

---

## Task 5: Push eBay Convex env vars; verify live

**Files:** none (operational task).

- [ ] **Step 1: Push the eBay credentials to Convex env, without printing values**

```bash
EBAY_ID_VAL=$(grep '^EBAY_CLIENT_ID=' .env.local | cut -d= -f2- | tr -d '\r')
npx convex env set EBAY_CLIENT_ID "$EBAY_ID_VAL"
EBAY_SECRET_VAL=$(grep '^EBAY_CLIENT_SECRET=' .env.local | cut -d= -f2- | tr -d '\r')
npx convex env set EBAY_CLIENT_SECRET "$EBAY_SECRET_VAL"
```
Expected: two `✔ Successfully set` confirmations.

- [ ] **Step 2: Redeploy so functions see the new env**

Run: `npx convex dev --once`
Expected: `Convex functions ready!`

- [ ] **Step 3: Run a real, uncached generation and inspect the product fields**

```bash
UNIQ="ebay-verify-$(date +%s)-$RANDOM"
OUT=$(npx convex run generateBundles:generate "{\"quiz\":{\"occasion\":\"Birthday\",\"ageBand\":\"25-34\",\"relationship\":\"Friend\",\"interests\":[\"Coffee & tea\"],\"budget\":50,\"currency\":\"USD\",\"urgency\":\"normal\",\"exclusions\":[],\"country\":\"US\",\"freeText\":\"$UNIQ\"},\"rateLimitKey\":\"$UNIQ\"}" 2>/dev/null)
IDS=$(node -e "process.stdout.write(JSON.stringify(JSON.parse(process.argv[1]).bundleIds))" "$OUT")
npx convex run bundles:getByIds "{\"ids\":$IDS}" 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const a=JSON.parse(s);for(const it of a[0].items){console.log('-',it.name,'| merchant:',it.productMerchant||'(none — fell back to stock)','| price:',it.productPrice||'n/a','| productUrl:',(it.productUrl||'MISSING').slice(0,50))}})"
```
Expected: at least some items show `merchant: eBay` with a real `productUrl` starting `https://www.ebay.com/itm/`. If eBay has no inventory match for a niche AI-generated search phrase, that specific item falling back to a stock image is correct behavior, not a bug — but if **every** item falls back, treat it as a signal to debug (invalid client id/secret, token fetch failing, or the app's Browse API scope not yet active) using the same direct-curl-with-a-novel-query technique used earlier for Pexels.

- [ ] **Step 4: No commit** — operational verification only.

---

## Task 6: E2E regression, seed fixture update, and docs closeout

**Files:**
- Modify: `convex/testSupport.ts` (already has `productUrl`/`productPrice`/`productMerchant` on the popular-bundle seed from a prior session — verify it still matches the shape; no change expected, but confirm)
- Modify: `docs/tasks.md`, `docs/checkpoint.md`, `docs/handover.md`

- [ ] **Step 1: Full regression**

Run: `npx vitest run`
Expected: all green (should be ~103 tests: 93 prior + ~10 new eBay/rename tests from Task 3).

Run: `npx playwright test --project=chromium`
Expected: all green at the prior count (18) — this task adds no new E2E spec since `affiliate-buy.spec.ts` (existing) already asserts the "Buy at {merchant}" UI generically off `productUrl`, which now gets populated by eBay instead of a Sovrn fixture; no test changes needed there.

- [ ] **Step 2: Update `docs/tasks.md`**

Under the "Product images & buyable links" section, replace the two pending eBay/Amazon lines:

```
- [ ] eBay Browse API (APPROVED) — real product photo + direct item URL + price, layered ahead of representative images via the existing `chooseItemMedia` seam. Needs `EBAY_CLIENT_ID`/`EBAY_CLIENT_SECRET` (OAuth client-credentials). **Next major step.**
- [ ] Flip Amazon Associates tag (APPROVED) — set `AFFILIATE_TAG_AMAZON`; link builder already appends `?tag=`. Add the affiliate disclosure trigger for Amazon links too.
```

with:

```
- [x] eBay Browse API (APPROVED) — real product photo + direct item URL + price now live via `parseEbayItemSummary` + `fetchEbayProduct` (`convex/generateBundles.ts`), layered ahead of representative images through `chooseItemMedia({ realProduct, stock })`. OAuth client-credentials token fetched once per generation. Plan: docs/superpowers/plans/2026-07-19-ebay-real-products-affiliate-fix.md
- [x] Flip Amazon Associates tag (APPROVED) — found and fixed a real pre-existing bug in the process: the tag never reached the browser because `retailer-links.ts` (called from a client component) read a non-`NEXT_PUBLIC_` env var, which Next.js never inlines client-side. Renamed to `NEXT_PUBLIC_AFFILIATE_TAG_AMAZON` / `NEXT_PUBLIC_AFFILIATE_ID_EBAY`; regression-tested.
```

- [ ] **Step 3: Update `docs/checkpoint.md`**

Add to the `### This Session` Completed Items (create a `### This Session (2026-07-19)` heading if the prior session's heading is dated 2026-07-18):

```
- [x] eBay Browse API real products + Amazon/eBay affiliate-tag bug fix: eBay approved → Browse API wired as the primary real-product-data layer (real photo, direct item URL, real price via OAuth client-credentials, `src/lib/engine/media.ts` `parseEbayItemSummary`/`ebayMarketplaceForCountry`/`formatEbayPrice`, `chooseItemMedia`'s `sovrn` param generalized to `realProduct`). Also found and fixed a real bug: Amazon/eBay affiliate tags never reached outbound links because `retailer-links.ts` (called client-side from `BundleCard`) read non-`NEXT_PUBLIC_` env vars, which Next.js never inlines into the browser — renamed to `NEXT_PUBLIC_AFFILIATE_TAG_AMAZON`/`NEXT_PUBLIC_AFFILIATE_ID_EBAY`, regression-tested. Etsy fully removed (app rejected) with a test guaranteeing it can't silently reappear. Verified live: Unsplash/Pexels images and eBay product data both confirmed via real (uncached) generation calls.
```

- [ ] **Step 4: Update `docs/handover.md`**

In §2 "What's blocked," update or remove the real-photos/direct-links entry now that eBay is live — note it's no longer blocked, just optionally enhanceable (Sovrn as an alternate source, Amazon PA-API if sales ever qualify).

- [ ] **Step 5: Final commit**

```bash
git add docs/tasks.md docs/checkpoint.md docs/handover.md docs/superpowers/plans/2026-07-19-ebay-real-products-affiliate-fix.md
git commit -m "docs: eBay real products live + affiliate-tag bug fix closeout"
```

---

## Self-Review notes

- **Spec coverage:** design spec's "real photo + direct buy link + price + merchant" (originally scoped to Sovrn) is now delivered via eBay, using the identical `ProductMedia`/`chooseItemMedia` seam the spec defined — no architectural drift, just a provider swap made possible by eBay's approval. Etsy removal and the affiliate-tag bug are both real findings folded in as discovered work, per the project's "fix root causes" convention.
- **Placeholder scan:** none found — every step has concrete code/commands.
- **Type consistency:** `ProductMedia` shape (`imageUrl`, `productUrl`, `productPrice`, `productMerchant`) is unchanged and used identically in Tasks 3 and 4; `chooseItemMedia`'s `realProduct` param name is consistent between its Task 3 definition and Task 4's only call site.
- **Out of scope (noted, not silently dropped):** Sovrn stays as documented-but-unused (its env vars remain in `.env.local`/planning.md for a future retry); Amazon real product data (PA-API) remains genuinely blocked on qualifying sales, unchanged from the original design spec.
