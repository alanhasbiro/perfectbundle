# Phase 1: Representative Item Images Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every bundle item a keyword-matched representative photo (free Pexels API), fetched and cached at generation time, rendered on the card with a "representative image" caption — a big visual upgrade that ships with no retailer approval.

**Architecture:** A pure, unit-tested media module (`src/lib/engine/media.ts`) builds the image query, parses the Pexels response, and implements first-match-wins layering (Sovrn product → stock image → none) with only the stock layer active in Phase 1. The Convex `generate` action performs the actual Pexels `fetch` (server-side, env-keyed) after Gemini parsing, attaches optional media fields per item, and stores the enriched bundle so it's cached. `BundleCard` renders the image + caption.

**Tech Stack:** Convex (action, schema/validators), TypeScript, Zod (engine schema), Vitest (pure module), Playwright (render check), Pexels REST API.

## Global Constraints

- **$0 operating cost** — Pexels free tier (~200 req/hr). Media resolution runs only on cache-miss generation and is fully guarded — it must NEVER fail or block a bundle generation.
- **Env-gated** — with no `PEXELS_API_KEY` set, enrichment is a silent no-op (items store with no media), exactly like the existing Gemini key pattern. This lets Phase 1 land and be verified before the key exists; the live image appears once the key is in Convex env.
- Keep `src/lib/engine/*.ts` free of React/Next/Convex imports and free of `fetch`/env — the network call lives in the Convex action; only pure query-building/parsing/layering lives in `lib`.
- All new item fields are **optional** so existing stored bundles/curated bundles stay valid with no migration.
- Never hardcode the key; server-side (Convex env) only, never echoed.
- **Scope note (deviation from spec §6/§7):** the affiliate-disclosure component is deferred to Phase 2, where real affiliate links actually appear — a dormant disclosure adds no Phase-1 value and its wording/placement is better decided alongside live Sovrn links. Phase 1 is images only.

---

## Task 1: Optional media fields on the item shape (schema + validators + types)

**Files:**
- Modify: `convex/schema.ts` (the shared `bundleItem` object, lines 4-11)
- Modify: `convex/bundles.ts` (`bundleItemValidator`, lines 5-12)
- Modify: `src/lib/engine/schemas.ts` (`bundleItemSchema`, lines 5-12)
- Modify: `src/components/bundles/bundle-card-types.ts` (`BundleItemLike`)

**Interfaces:**
- Produces: five optional item fields, identical names everywhere — `imageUrl?: string`, `imageIsRepresentative?: boolean`, `productUrl?: string`, `productPrice?: string`, `productMerchant?: string`. (Phase 1 populates only `imageUrl` + `imageIsRepresentative`; the product fields are added now so Phase 2 needs no second migration.)

- [ ] **Step 1: Add fields to the Convex schema**

In `convex/schema.ts`, extend the shared `bundleItem` validator (currently lines 4-11):

```ts
const bundleItem = v.object({
  name: v.string(),
  description: v.string(),
  why: v.string(),
  estPriceRange: v.string(),
  searchQuery: v.string(),
  tags: v.array(v.string()),
  imageUrl: v.optional(v.string()),
  imageIsRepresentative: v.optional(v.boolean()),
  productUrl: v.optional(v.string()),
  productPrice: v.optional(v.string()),
  productMerchant: v.optional(v.string()),
});
```

- [ ] **Step 2: Add the same fields to `bundleItemValidator` in `convex/bundles.ts`**

```ts
const bundleItemValidator = v.object({
  name: v.string(),
  description: v.string(),
  why: v.string(),
  estPriceRange: v.string(),
  searchQuery: v.string(),
  tags: v.array(v.string()),
  imageUrl: v.optional(v.string()),
  imageIsRepresentative: v.optional(v.boolean()),
  productUrl: v.optional(v.string()),
  productPrice: v.optional(v.string()),
  productMerchant: v.optional(v.string()),
});
```

- [ ] **Step 3: Add optional fields to the engine Zod schema**

In `src/lib/engine/schemas.ts`, extend `bundleItemSchema` (currently lines 5-12). These are optional because Gemini never produces them — they're attached post-parse by enrichment, and this keeps the `BundleItem` type carrying them:

```ts
export const bundleItemSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  why: z.string().min(1),
  estPriceRange: z.string().min(1),
  searchQuery: z.string().min(1),
  tags: z.array(z.string().min(1)).min(1),
  imageUrl: z.string().optional(),
  imageIsRepresentative: z.boolean().optional(),
  productUrl: z.string().optional(),
  productPrice: z.string().optional(),
  productMerchant: z.string().optional(),
});
```

- [ ] **Step 4: Add optional fields to `BundleItemLike`**

In `src/components/bundles/bundle-card-types.ts`:

```ts
export interface BundleItemLike {
  name: string;
  description: string;
  why: string;
  estPriceRange: string;
  searchQuery: string;
  tags: string[];
  imageUrl?: string;
  imageIsRepresentative?: boolean;
  productUrl?: string;
  productPrice?: string;
  productMerchant?: string;
}
```

- [ ] **Step 5: Verify — Convex push, typecheck, existing tests**

Run: `npx convex dev --once`
Expected: functions ready, no validator errors.

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npx vitest run src/lib/engine`
Expected: all existing engine tests still pass (optional fields don't break parsing of Gemini output that lacks them).

- [ ] **Step 6: Commit**

```bash
git add convex/schema.ts convex/bundles.ts src/lib/engine/schemas.ts src/components/bundles/bundle-card-types.ts
git commit -m "feat(images): optional media fields on the bundle item shape"
```

---

## Task 2: Pure media module (query build, Pexels parse, layering)

**Files:**
- Create: `src/lib/engine/media.ts`
- Test: `src/lib/engine/media.test.ts`

**Interfaces:**
- Produces:
  - `interface ProductMedia { imageUrl: string; productUrl: string; productPrice: string; productMerchant: string }`
  - `interface ItemMedia { imageUrl?: string; imageIsRepresentative?: boolean; productUrl?: string; productPrice?: string; productMerchant?: string }`
  - `buildStockImageQuery(item: { searchQuery: string; name: string }): string`
  - `parsePexelsResponse(json: unknown): string | null` — the first photo's medium image URL, or null.
  - `chooseItemMedia(sources: { sovrn: ProductMedia | null; stock: string | null }): ItemMedia` — first-match-wins: Sovrn product (real, `imageIsRepresentative:false`) → stock image (`imageIsRepresentative:true`) → `{}`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/engine/media.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  buildStockImageQuery,
  parsePexelsResponse,
  chooseItemMedia,
  type ProductMedia,
} from "./media";

describe("buildStockImageQuery", () => {
  it("prefers the item's searchQuery", () => {
    expect(buildStockImageQuery({ searchQuery: "ceramic pour-over coffee set", name: "Pour-over kit" })).toBe(
      "ceramic pour-over coffee set"
    );
  });

  it("falls back to the item name when searchQuery is blank", () => {
    expect(buildStockImageQuery({ searchQuery: "   ", name: "Pour-over kit" })).toBe("Pour-over kit");
  });
});

describe("parsePexelsResponse", () => {
  it("returns the first photo's medium src", () => {
    const json = {
      photos: [
        { src: { medium: "https://images.pexels.com/a-medium.jpg", large: "https://images.pexels.com/a-large.jpg" } },
        { src: { medium: "https://images.pexels.com/b-medium.jpg" } },
      ],
    };
    expect(parsePexelsResponse(json)).toBe("https://images.pexels.com/a-medium.jpg");
  });

  it("returns null when there are no photos", () => {
    expect(parsePexelsResponse({ photos: [] })).toBeNull();
    expect(parsePexelsResponse({})).toBeNull();
    expect(parsePexelsResponse(null)).toBeNull();
    expect(parsePexelsResponse("nonsense")).toBeNull();
  });
});

describe("chooseItemMedia", () => {
  const product: ProductMedia = {
    imageUrl: "https://cdn.example.com/real.jpg",
    productUrl: "https://buy.example.com/item?aff=1",
    productPrice: "$24.00",
    productMerchant: "Etsy",
  };

  it("uses the real product when present (not representative)", () => {
    expect(chooseItemMedia({ sovrn: product, stock: "https://stock/x.jpg" })).toEqual({
      imageUrl: "https://cdn.example.com/real.jpg",
      imageIsRepresentative: false,
      productUrl: "https://buy.example.com/item?aff=1",
      productPrice: "$24.00",
      productMerchant: "Etsy",
    });
  });

  it("falls back to the stock image, flagged representative", () => {
    expect(chooseItemMedia({ sovrn: null, stock: "https://stock/x.jpg" })).toEqual({
      imageUrl: "https://stock/x.jpg",
      imageIsRepresentative: true,
    });
  });

  it("returns empty media when nothing is available", () => {
    expect(chooseItemMedia({ sovrn: null, stock: null })).toEqual({});
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/engine/media.test.ts`
Expected: FAIL — module `./media` does not exist.

- [ ] **Step 3: Implement `src/lib/engine/media.ts`**

```ts
// NOTE: keep this file free of React/Next/Convex imports and free of fetch/env.
// The network call lives in the Convex action; this module is pure logic only.

export interface ProductMedia {
  imageUrl: string;
  productUrl: string;
  productPrice: string;
  productMerchant: string;
}

export interface ItemMedia {
  imageUrl?: string;
  imageIsRepresentative?: boolean;
  productUrl?: string;
  productPrice?: string;
  productMerchant?: string;
}

// The search phrase used to fetch a representative photo. The AI-authored
// searchQuery is already a good product-search phrase; fall back to the item
// name if it's somehow blank.
export function buildStockImageQuery(item: { searchQuery: string; name: string }): string {
  const q = item.searchQuery.trim();
  return q.length > 0 ? q : item.name;
}

// Extracts the first photo's medium image URL from a Pexels /v1/search
// response, or null if the response has no usable photo.
export function parsePexelsResponse(json: unknown): string | null {
  if (typeof json !== "object" || json === null) return null;
  const photos = (json as { photos?: unknown }).photos;
  if (!Array.isArray(photos) || photos.length === 0) return null;
  const first = photos[0] as { src?: { medium?: unknown } } | null;
  const medium = first?.src?.medium;
  return typeof medium === "string" && medium.length > 0 ? medium : null;
}

// First-match-wins media layering. Phase 1 only ever passes sovrn:null; Phase 2
// will pass a resolved product here and it takes precedence over the stock
// image. A real product photo is NOT representative; a stock photo IS.
export function chooseItemMedia(sources: { sovrn: ProductMedia | null; stock: string | null }): ItemMedia {
  if (sources.sovrn) {
    return {
      imageUrl: sources.sovrn.imageUrl,
      imageIsRepresentative: false,
      productUrl: sources.sovrn.productUrl,
      productPrice: sources.sovrn.productPrice,
      productMerchant: sources.sovrn.productMerchant,
    };
  }
  if (sources.stock) {
    return { imageUrl: sources.stock, imageIsRepresentative: true };
  }
  return {};
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/engine/media.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/engine/media.ts src/lib/engine/media.test.ts
git commit -m "feat(images): pure media module — query build, Pexels parse, layering"
```

---

## Task 3: Enrich bundles with representative images in the Convex action

**Files:**
- Modify: `convex/generateBundles.ts`

**Interfaces:**
- Consumes: `buildStockImageQuery`, `parsePexelsResponse`, `chooseItemMedia`, `ItemMedia` (Task 2); the enriched items flow into the existing `internal.bundles.storeGenerated` (Task 1 made its validator accept the media fields).
- Produces: enriched `bundles` (each item may carry `imageUrl`/`imageIsRepresentative`) stored + cached; no signature change to the `generate` action.

- [ ] **Step 1: Add imports and a guarded Pexels fetch helper**

In `convex/generateBundles.ts`, add to the existing engine imports near the top:

```ts
import { buildBundlePrompt } from "../src/lib/engine/prompt";
import { parseBundleResponse } from "../src/lib/engine/parse-response";
import { buildStockImageQuery, parsePexelsResponse, chooseItemMedia } from "../src/lib/engine/media";
import type { BundleContent } from "../src/lib/engine/schemas";
```

(If `BundleContent` is not already imported, add it; `parse-response` returns `BundleContent[]`.)

Then add these helpers near `callGemini` (below it):

```ts
// Fetches a single representative photo URL for a search phrase from Pexels,
// or null on any failure / no key. Never throws — media is best-effort.
async function fetchStockImage(query: string): Promise<string | null> {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) return null;
  try {
    const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=1`;
    const res = await fetch(url, { headers: { Authorization: apiKey } });
    if (!res.ok) return null;
    return parsePexelsResponse(await res.json());
  } catch {
    return null;
  }
}

// Attaches best-effort media to every item of every bundle. Phase 1 resolves
// only representative stock images (sovrn:null). Any per-item failure yields no
// media for that item; the overall generation is never blocked.
async function enrichBundlesWithMedia(bundles: BundleContent[]): Promise<BundleContent[]> {
  return Promise.all(
    bundles.map(async (bundle) => ({
      ...bundle,
      items: await Promise.all(
        bundle.items.map(async (item) => {
          const stock = await fetchStockImage(buildStockImageQuery(item));
          const media = chooseItemMedia({ sovrn: null, stock });
          return { ...item, ...media };
        })
      ),
    }))
  );
}
```

- [ ] **Step 2: Call enrichment between parse-success and store**

In the `generate` handler, after the `if (!parsed.ok) { return … }` guard and before `storeGenerated`, enrich the bundles and store the enriched set:

```ts
    if (!parsed.ok) {
      return { status: "failed", reason: parsed.error };
    }

    const enrichedBundles = await enrichBundlesWithMedia(parsed.bundles);

    const bundleIds: Id<"bundles">[] = await ctx.runMutation(internal.bundles.storeGenerated, {
      quizHash,
      quiz,
      bundles: enrichedBundles,
    });
```

(The rest — cache store, profile past-items append, return — is unchanged. Note the profile past-items append reads `parsed.bundles`; leave it reading `parsed.bundles` since item names are identical to `enrichedBundles`.)

- [ ] **Step 3: Verify — Convex push + typecheck + engine tests**

Run: `npx convex dev --once`
Expected: functions ready, no errors (enriched item objects satisfy `storeGenerated`'s validator from Task 1).

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npx vitest run`
Expected: all green (no pure-module contract changed).

- [ ] **Step 4: Commit**

```bash
git add convex/generateBundles.ts
git commit -m "feat(images): attach representative images to generated bundles (env-gated Pexels)"
```

---

## Task 4: Render the item image + "representative" caption in `BundleCard`

**Files:**
- Modify: `src/components/bundles/bundle-card.tsx` (the item `<li>` block, lines 84-108)

**Interfaces:**
- Consumes: `item.imageUrl` / `item.imageIsRepresentative` from `BundleItemLike` (Task 1).

- [ ] **Step 1: Render the image above the item name**

In `src/components/bundles/bundle-card.tsx`, inside the `content.items.map(...)` `<li>`, add an image block at the top of the `<li>` (before the `<p className="font-medium">{item.name}</p>` line). Use a plain `<img>` (the URLs are remote Pexels/CDN hosts; adding each to `next/image` remote patterns is unnecessary overhead for a simple thumbnail):

```tsx
            <li key={item.name} className="rounded-xl border border-foreground/10 p-4">
              {item.imageUrl ? (
                <div className="mb-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.imageUrl}
                    alt={item.name}
                    loading="lazy"
                    className="h-40 w-full rounded-lg object-cover"
                  />
                  {item.imageIsRepresentative ? (
                    <p className="mt-1 text-xs opacity-50">Representative image</p>
                  ) : null}
                </div>
              ) : null}
              <p className="font-medium">{item.name}</p>
```

Leave the rest of the `<li>` (description, why, price, retailer links) unchanged.

- [ ] **Step 2: Verify — typecheck + build**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run build`
Expected: compiles successfully (the `eslint-disable` comment keeps the `no-img-element` lint rule from failing the build).

- [ ] **Step 3: Commit**

```bash
git add src/components/bundles/bundle-card.tsx
git commit -m "feat(images): render item image + representative caption on bundle cards"
```

---

## Task 5: E2E render check + verification + docs closeout

**Files:**
- Modify: `convex/testSupport.ts` (add media fields to a seeded item)
- Create: `tests/e2e/bundle-images.spec.ts`
- Modify: `docs/tasks.md`, `docs/checkpoint.md`, `docs/handover.md`

- [ ] **Step 1: Give the popular-seed fixture an image**

In `convex/testSupport.ts`, in `seedPopularBundle`, add media fields to the first item so a rendered card has a deterministic image + caption:

```ts
        {
          name: "Popular Item One",
          description: "A test item.",
          why: "For testing.",
          estPriceRange: "$10-15",
          searchQuery: "popular item one",
          tags: ["test"],
          imageUrl: "https://images.pexels.com/photos/1002740/pexels-photo-1002740.jpeg?auto=compress&cs=tinysrgb&h=350",
          imageIsRepresentative: true,
        },
```

- [ ] **Step 2: Write the E2E render test**

Create `tests/e2e/bundle-images.spec.ts`:

```ts
import { test, expect } from "@playwright/test";
import { execSync } from "node:child_process";

test.beforeAll(() => {
  execSync('npx convex run testSupport:seedPopularBundle "{}"', { encoding: "utf-8" });
});

test.describe("bundle item images", () => {
  test("renders an item image with a representative caption on /popular", async ({ page }) => {
    await page.goto("/popular");
    // The seeded popular bundle carries an image on its first item.
    await expect(page.getByRole("img", { name: "Popular Item One" }).first()).toBeVisible();
    await expect(page.getByText("Representative image").first()).toBeVisible();
  });
});
```

- [ ] **Step 3: Run the new spec on chromium**

Run: `npx playwright test tests/e2e/bundle-images.spec.ts --project=chromium`
Expected: 1 passing.

- [ ] **Step 4: Full regression**

Run: `npx vitest run` (expect all green incl. media tests)
Run: `npx playwright test --project=chromium` (expect prior pass count + 1)

- [ ] **Step 5: Update `docs/tasks.md`**

Under the Milestone 3 "Real product photos + direct links" blocked line (or the relevant backlog/section), add a completed Phase-1 entry:

```
- [x] Representative item images (Phase 1 of Sovrn plan) — free Pexels API, env-gated, cached at generation time, rendered with a "Representative image" caption; pure media module unit-tested (`src/lib/engine/media.ts`). Spec: docs/superpowers/specs/2026-07-18-product-data-and-images-design.md · Plan: docs/superpowers/plans/2026-07-18-phase1-representative-images.md. Phase 2 (Sovrn real products + buy links + revenue) pending owner's Sovrn key.
```

- [ ] **Step 6: Update `docs/checkpoint.md`**

Add to the `### This Session (2026-07-18)` Completed Items block:

```
- [x] Phase 1 representative images: optional media fields on the item shape (schema/validators/types), pure `src/lib/engine/media.ts` (query build + Pexels parse + first-match-wins layering, unit-tested), env-gated Pexels enrichment in `generateBundles.generate` (best-effort, never blocks generation), `BundleCard` image + "Representative image" caption. Ships the first half of the Sovrn workaround (spec 2026-07-18-product-data-and-images-design). Verified: Vitest green, tsc/build clean, Playwright chromium green incl. new bundle-images.spec. Owner action for the live image: add `PEXELS_API_KEY` to `.env.local`/Convex env.
```

Add a Change Log row:

```
| 2026-07-18 | pending | Phase 1 representative images (Pexels, env-gated) — spec+plan for the Sovrn product-data workaround; Phase 2 pending owner Sovrn key |
```

- [ ] **Step 7: Update `docs/handover.md`**

In §2 "What's blocked", update the real-photos/direct-links entry to note that **representative images (Phase 1) are now shipped** (env-gated on `PEXELS_API_KEY`), and the remaining block is only the Sovrn Product API (Phase 2) — pending the owner's free Sovrn Commerce signup + key. Reference the spec and this plan.

- [ ] **Step 8: Final commit**

```bash
git add convex/testSupport.ts tests/e2e/bundle-images.spec.ts docs/tasks.md docs/checkpoint.md docs/handover.md docs/superpowers/plans/2026-07-18-phase1-representative-images.md
git commit -m "test+docs: Phase 1 representative images E2E + closeout"
```

---

## Self-Review notes

- **Spec coverage:** spec §4.2 (purity split) → Task 2; §4.1 (resolution step) → Task 3; §5 (schema fields) → Task 1; §6 image + representative caption → Task 4 (buy-button + disclosure explicitly deferred to Phase 2 per the scope note); §7 Phase 1 → all tasks; §8 testing → Tasks 2 & 5. Sovrn (Phase 2), price/merchant rendering, disclosure, curated re-enrichment: intentionally out of Phase 1.
- **Env-gating** ensures the plan is fully buildable/verifiable before the Pexels key exists; live image is the one thing that waits for the key.
- **Type consistency:** the five field names are identical across schema.ts, bundles.ts validator, schemas.ts Zod, and BundleItemLike (Task 1); `ProductMedia`/`ItemMedia`/`chooseItemMedia`/`parsePexelsResponse`/`buildStockImageQuery` names match between Tasks 2 and 3.
- **No unblocked placeholders.**
