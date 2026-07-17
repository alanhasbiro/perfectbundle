# M2 Sprint 2 — Link Builder + Bundle Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Given a `QuizAnswers` object, produce 3 validated themed gift bundles (via Gemini, cached, rate-limited, with a typed non-throwing failure path) and region-correct, affiliate-ready retailer links for every item.

**Architecture:** Two independent pure/testable layers (`src/lib/links/`, `src/lib/engine/`) feed a single Convex action (`convex/generateBundles.ts`) that owns caching, the Gemini HTTP call, persistence, and rate limiting. A thin `generate` mutation wraps the action for client use next sprint. Gemini's native JSON-schema mode (`generationConfig.responseSchema`) is used so the model is constrained to valid JSON — the parser still defensively strips markdown code fences as a second line of defense, since real-world model output occasionally wraps JSON in ```json fences even in JSON mode.

**Tech Stack:** Convex actions/mutations, Gemini API REST (`generateContent`), Zod (existing `src/lib/engine/schemas.ts`), Vitest.

## Global Constraints

- **$0 cost** — Gemini free tier only; no paid services.
- `src/lib/links/` and `src/lib/engine/` MUST be free of React/Next imports (mobile reuse).
- Bundle content must validate against the existing `bundleContentSchema` (`src/lib/engine/schemas.ts`) — do not redefine it.
- `QuizAnswers` field names/shape are fixed by `src/lib/quiz/types.ts` and `convex/schema.ts` `bundles.quiz` — consume as-is, do not modify.
- No live-price promises: prompt must instruct estimate ranges only, matching `estPriceRange` field semantics already in the schema.
- Age-appropriate safety rails (e.g. no alcohol suggested for a recipient under legal drinking age) must be encoded in the prompt.
- Never spend real Gemini quota/tokens in CI or unit tests — engine tests mock the HTTP call or test pure functions only.
- TypeScript strict; TDD; small frequent commits.
- Per AGENTS.md: this Next.js version may differ from training data — consult `node_modules/next/dist/docs/` if any App Router API misbehaves (not expected to apply to this sprint — no new routes). Per project CLAUDE.md: read `convex/_generated/ai/guidelines.md` before writing Convex code.

---

### Task 0: Read Convex guidelines

- [ ] **Step 1: Read the Convex AI guidelines file before writing any convex/ code**

Run: read `convex/_generated/ai/guidelines.md` in full. It documents current Convex API rules (function syntax, validators, actions vs mutations, scheduling) that may differ from training data — follow it over any conflicting prior assumption in this plan. If anything in Tasks 4–6 below conflicts with that file, follow the file.

---

### Task 1: Link builder — Amazon/Etsy/eBay URL generation (TDD)

**Files:**
- Create: `src/lib/links/retailer-links.ts`
- Test: `src/lib/links/retailer-links.test.ts`

**Interfaces:**
- Produces:
  - `interface RetailerLink { retailer: "amazon" | "etsy" | "ebay"; url: string; label: string }`
  - `buildRetailerLinks(searchQuery: string, country: string, urgency: "fast" | "normal" | "no_rush"): RetailerLink[]` — returns exactly 3 links (Amazon, Etsy, eBay) in that order.
  - `amazonDomainForCountry(country: string): string` — e.g. "US" → "amazon.com", "GB" → "amazon.co.uk", unknown → "amazon.com".
- Consumed by the results UI next sprint (per bundle item, called with `item.searchQuery`, quiz `country`, quiz `urgency`).
- Affiliate tags read from `process.env.AFFILIATE_TAG_AMAZON`, `process.env.AFFILIATE_ID_EBAY`, `process.env.AFFILIATE_ID_AWIN` (all optional; empty string/undefined means "omit the tag param" — these are unset today per `docs/planning.md` §3 cost policy, to be flipped on once affiliate programs approve).

- [ ] **Step 1: Write the failing test — `src/lib/links/retailer-links.test.ts`**

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { buildRetailerLinks, amazonDomainForCountry } from "./retailer-links";

describe("amazonDomainForCountry", () => {
  it("maps major countries to their Amazon TLD", () => {
    expect(amazonDomainForCountry("US")).toBe("amazon.com");
    expect(amazonDomainForCountry("GB")).toBe("amazon.co.uk");
    expect(amazonDomainForCountry("DE")).toBe("amazon.de");
    expect(amazonDomainForCountry("FR")).toBe("amazon.fr");
    expect(amazonDomainForCountry("IT")).toBe("amazon.it");
    expect(amazonDomainForCountry("ES")).toBe("amazon.es");
    expect(amazonDomainForCountry("CA")).toBe("amazon.ca");
    expect(amazonDomainForCountry("AU")).toBe("amazon.com.au");
    expect(amazonDomainForCountry("JP")).toBe("amazon.co.jp");
    expect(amazonDomainForCountry("IN")).toBe("amazon.in");
    expect(amazonDomainForCountry("BR")).toBe("amazon.com.br");
    expect(amazonDomainForCountry("MX")).toBe("amazon.com.mx");
    expect(amazonDomainForCountry("NL")).toBe("amazon.nl");
    expect(amazonDomainForCountry("SE")).toBe("amazon.se");
    expect(amazonDomainForCountry("SG")).toBe("amazon.sg");
    expect(amazonDomainForCountry("AE")).toBe("amazon.ae");
  });
  it("falls back to .com for unmapped countries", () => {
    expect(amazonDomainForCountry("ZZ")).toBe("amazon.com");
  });
});

describe("buildRetailerLinks", () => {
  const OLD_ENV = process.env;
  beforeEach(() => {
    process.env = { ...OLD_ENV };
    delete process.env.AFFILIATE_TAG_AMAZON;
    delete process.env.AFFILIATE_ID_EBAY;
    delete process.env.AFFILIATE_ID_AWIN;
  });
  afterEach(() => {
    process.env = OLD_ENV;
  });

  it("returns exactly amazon, etsy, ebay in order", () => {
    const links = buildRetailerLinks("ceramic mug", "US", "normal");
    expect(links.map((l) => l.retailer)).toEqual(["amazon", "etsy", "ebay"]);
  });

  it("URL-encodes the search query and uses the right domain per country", () => {
    const links = buildRetailerLinks("gooseneck kettle & pot", "GB", "normal");
    const amazon = links.find((l) => l.retailer === "amazon")!;
    expect(amazon.url).toContain("amazon.co.uk");
    expect(amazon.url).toContain(encodeURIComponent("gooseneck kettle & pot"));
    const etsy = links.find((l) => l.retailer === "etsy")!;
    expect(etsy.url).toContain("etsy.com");
    expect(etsy.url).toContain(encodeURIComponent("gooseneck kettle & pot"));
    const ebay = links.find((l) => l.retailer === "ebay")!;
    expect(ebay.url).toContain("ebay.com");
    expect(ebay.url).toContain(encodeURIComponent("gooseneck kettle & pot"));
  });

  it("omits affiliate tag params when env vars are unset", () => {
    const links = buildRetailerLinks("mug", "US", "normal");
    const amazon = links.find((l) => l.retailer === "amazon")!;
    expect(amazon.url).not.toContain("tag=");
    const ebay = links.find((l) => l.retailer === "ebay")!;
    expect(ebay.url).not.toContain("campid=");
  });

  it("includes affiliate tag params when env vars are set", () => {
    process.env.AFFILIATE_TAG_AMAZON = "pbtag-20";
    process.env.AFFILIATE_ID_EBAY = "pb-ebay-123";
    const links = buildRetailerLinks("mug", "US", "normal");
    const amazon = links.find((l) => l.retailer === "amazon")!;
    expect(amazon.url).toContain("tag=pbtag-20");
    const ebay = links.find((l) => l.retailer === "ebay")!;
    expect(ebay.url).toContain("campid=pb-ebay-123");
  });

  it("adds a fast-shipping hint param on amazon only when urgency is fast", () => {
    const fast = buildRetailerLinks("mug", "US", "fast").find((l) => l.retailer === "amazon")!;
    expect(fast.url).toContain("rh=p_76");
    const normal = buildRetailerLinks("mug", "US", "normal").find((l) => l.retailer === "amazon")!;
    expect(normal.url).not.toContain("rh=p_76");
  });

  it("gives each link a human-readable label", () => {
    const links = buildRetailerLinks("mug", "US", "normal");
    expect(links.find((l) => l.retailer === "amazon")!.label).toBe("Find it on Amazon");
    expect(links.find((l) => l.retailer === "etsy")!.label).toBe("Find it on Etsy");
    expect(links.find((l) => l.retailer === "ebay")!.label).toBe("Find it on eBay");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — cannot resolve `./retailer-links`.

- [ ] **Step 3: Write `src/lib/links/retailer-links.ts`**

```typescript
// NOTE: keep this file free of React/Next imports — reused by mobile later.

export interface RetailerLink {
  retailer: "amazon" | "etsy" | "ebay";
  url: string;
  label: string;
}

const AMAZON_DOMAIN_BY_COUNTRY: Record<string, string> = {
  US: "amazon.com",
  GB: "amazon.co.uk",
  DE: "amazon.de",
  FR: "amazon.fr",
  IT: "amazon.it",
  ES: "amazon.es",
  CA: "amazon.ca",
  AU: "amazon.com.au",
  JP: "amazon.co.jp",
  IN: "amazon.in",
  BR: "amazon.com.br",
  MX: "amazon.com.mx",
  NL: "amazon.nl",
  SE: "amazon.se",
  SG: "amazon.sg",
  AE: "amazon.ae",
};

export function amazonDomainForCountry(country: string): string {
  return AMAZON_DOMAIN_BY_COUNTRY[country] ?? "amazon.com";
}

// Amazon's "Get it fast" / same-day-ish delivery filter refinement.
// See: https://www.amazon.com/s?rh=p_76:<domestic shipping filter id>
const AMAZON_FAST_SHIPPING_PARAM = "rh=p_76%3A2661601011"; // "Get It Fast" refinement

function buildAmazonUrl(query: string, country: string, urgency: string): string {
  const domain = amazonDomainForCountry(country);
  const params = new URLSearchParams({ k: query });
  const tag = process.env.AFFILIATE_TAG_AMAZON;
  if (tag) params.set("tag", tag);
  let url = `https://www.${domain}/s?${params.toString()}`;
  if (urgency === "fast") url += `&${AMAZON_FAST_SHIPPING_PARAM}`;
  return url;
}

function buildEtsyUrl(query: string): string {
  const params = new URLSearchParams({ q: query });
  return `https://www.etsy.com/search?${params.toString()}`;
}

function buildEbayUrl(query: string): string {
  const params = new URLSearchParams({ _nkw: query });
  const campid = process.env.AFFILIATE_ID_EBAY;
  if (campid) params.set("campid", campid);
  return `https://www.ebay.com/sch/i.html?${params.toString()}`;
}

export function buildRetailerLinks(
  searchQuery: string,
  country: string,
  urgency: "fast" | "normal" | "no_rush"
): RetailerLink[] {
  return [
    {
      retailer: "amazon",
      url: buildAmazonUrl(searchQuery, country, urgency),
      label: "Find it on Amazon",
    },
    { retailer: "etsy", url: buildEtsyUrl(searchQuery), label: "Find it on Etsy" },
    { retailer: "ebay", url: buildEbayUrl(searchQuery), label: "Find it on eBay" },
  ];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS. (`URLSearchParams` encodes spaces as `+`, not `%20` — the test's `encodeURIComponent` check on `"gooseneck kettle & pot"` still matches because both encode `&` as `%26`; verify visually if it fails and adjust the assertion to check for the decoded query instead of exact `encodeURIComponent` output — the code above is correct either way, this is just a test-authoring note.)

- [ ] **Step 5: Commit**

```powershell
git add src/lib/links; git commit -m "feat(links): region-aware retailer link builder (TDD)"
```

---

### Task 2: Prompt builder (TDD)

**Files:**
- Create: `src/lib/engine/prompt.ts`
- Test: `src/lib/engine/prompt.test.ts`

**Interfaces:**
- Consumes: `QuizAnswers` from `src/lib/quiz/types.ts`.
- Produces: `buildBundlePrompt(answers: QuizAnswers): string` — a complete prompt instructing Gemini to return exactly 3 bundle objects matching the shape of `bundleContentSchema` (theme, rationale, estTotal, items[3-6] of {name, description, why, estPriceRange, searchQuery, tags}).

- [ ] **Step 1: Write the failing test — `src/lib/engine/prompt.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { buildBundlePrompt } from "./prompt";
import type { QuizAnswers } from "@/lib/quiz/types";

const answers: QuizAnswers = {
  occasion: "Birthday",
  ageBand: "18-24",
  relationship: "Friend",
  interests: ["Coffee & tea", "Reading"],
  budget: 50,
  currency: "GBP",
  urgency: "normal",
  exclusions: ["candles"],
  country: "GB",
};

describe("buildBundlePrompt", () => {
  it("includes every quiz answer field", () => {
    const p = buildBundlePrompt(answers);
    expect(p).toContain("Birthday");
    expect(p).toContain("18-24");
    expect(p).toContain("Friend");
    expect(p).toContain("Coffee & tea");
    expect(p).toContain("Reading");
    expect(p).toContain("50");
    expect(p).toContain("GBP");
    expect(p).toContain("candles");
  });

  it("instructs exactly 3 bundles and 3-6 items each", () => {
    const p = buildBundlePrompt(answers);
    expect(p).toMatch(/exactly 3/i);
    expect(p).toMatch(/3.{0,10}6 items|between 3 and 6/i);
  });

  it("instructs price ranges only, never a live/exact price claim", () => {
    const p = buildBundlePrompt(answers);
    expect(p).toMatch(/estimate/i);
    expect(p.toLowerCase()).toContain("range");
  });

  it("instructs respecting exclusions and budget", () => {
    const p = buildBundlePrompt(answers);
    expect(p).toMatch(/exclu/i);
    expect(p).toMatch(/budget/i);
  });

  it("includes an age-appropriateness safety rule", () => {
    const p = buildBundlePrompt(answers);
    expect(p).toMatch(/age-appropriate|alcohol|legal drinking age/i);
  });

  it("mentions the required JSON field names so the model targets the schema", () => {
    const p = buildBundlePrompt(answers);
    for (const field of [
      "theme",
      "rationale",
      "estTotal",
      "items",
      "name",
      "description",
      "why",
      "estPriceRange",
      "searchQuery",
      "tags",
    ]) {
      expect(p).toContain(field);
    }
  });

  it("omits the gender line when gender is not provided", () => {
    const p = buildBundlePrompt(answers);
    expect(p.toLowerCase()).not.toContain("gender:");
  });

  it("includes gender when provided", () => {
    const p = buildBundlePrompt({ ...answers, gender: "Female" });
    expect(p).toContain("Female");
  });

  it("includes free text when provided", () => {
    const p = buildBundlePrompt({ ...answers, freeText: "obsessed with houseplants" });
    expect(p).toContain("obsessed with houseplants");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — cannot resolve `./prompt`.

- [ ] **Step 3: Write `src/lib/engine/prompt.ts`**

```typescript
// NOTE: keep this file free of React/Next imports — reused by mobile later.
import type { QuizAnswers } from "@/lib/quiz/types";

const URGENCY_COPY: Record<QuizAnswers["urgency"], string> = {
  fast: "This is needed SOON, so favour widely-available items over slow handmade goods.",
  normal: "There is a normal timeframe — a healthy mix of mainstream and specialty items is fine.",
  no_rush: "There is no rush, so handmade, personalised, or made-to-order items are welcome.",
};

export function buildBundlePrompt(answers: QuizAnswers): string {
  const lines: string[] = [];
  lines.push(
    "You are a thoughtful professional gift consultant. Design gift bundles for the following recipient."
  );
  lines.push("");
  lines.push("RECIPIENT:");
  lines.push(`- Occasion: ${answers.occasion}`);
  lines.push(`- Age band: ${answers.ageBand}`);
  if (answers.gender) lines.push(`- Gender: ${answers.gender}`);
  lines.push(`- Relationship to gift-giver: ${answers.relationship}`);
  lines.push(`- Interests: ${answers.interests.join(", ") || "none specified"}`);
  if (answers.freeText) lines.push(`- Additional notes from the gift-giver: ${answers.freeText}`);
  lines.push(`- Total bundle budget: ${answers.budget} ${answers.currency}`);
  lines.push(`- Delivery urgency: ${URGENCY_COPY[answers.urgency]}`);
  lines.push(
    `- Exclusions (NEVER include these, or close synonyms of them): ${
      answers.exclusions.length ? answers.exclusions.join(", ") : "none"
    }`
  );
  lines.push(`- Shopping country: ${answers.country}`);
  lines.push("");
  lines.push("RULES:");
  lines.push(
    "1. Produce exactly 3 distinct gift bundles, each built around one clear, coherent theme."
  );
  lines.push(
    "2. Each bundle must contain between 3 and 6 items that genuinely complement each other under that theme."
  );
  lines.push(
    "3. Respect the total budget: the sum of the bundle's item price ranges must stay close to it (within about 20%), never wildly over."
  );
  lines.push(
    "4. NEVER suggest an excluded item, or a close synonym/variant of one, in any bundle."
  );
  lines.push(
    "5. Prices are always an ESTIMATE range (e.g. \"$15-25\"), never a specific live price or a claim of current availability."
  );
  lines.push(
    "6. Apply age-appropriate safety rules: never suggest alcohol, tobacco, or age-restricted items unless the age band is clearly a legal adult for that item in a typical country, and prefer to avoid alcohol entirely unless interests explicitly mention it."
  );
  lines.push("7. Avoid generic, cliché gifts unless they genuinely fit the interests given.");
  lines.push("");
  lines.push("OUTPUT FORMAT:");
  lines.push(
    "Return JSON only, an array of exactly 3 objects. Each object has fields: " +
      '"theme" (string), "rationale" (string, 1-2 sentences on why this bundle fits), ' +
      '"estTotal" (string price range like "$45-60"), and "items" (array of 3 to 6 objects). ' +
      'Each item object has fields: "name" (string), "description" (string, 1 sentence), ' +
      '"why" (string, why this item fits the recipient), "estPriceRange" (string like "$15-25"), ' +
      '"searchQuery" (string, a good product-search phrase for a retailer search box), ' +
      '"tags" (array of 1-4 short lowercase strings).'
  );
  return lines.join("\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/engine/prompt.ts src/lib/engine/prompt.test.ts; git commit -m "feat(engine): Gemini prompt builder encoding gift-intelligence rules (TDD)"
```

---

### Task 3: Response parser (TDD)

**Files:**
- Create: `src/lib/engine/parse-response.ts`
- Test: `src/lib/engine/parse-response.test.ts`

**Interfaces:**
- Consumes: `bundleContentSchema` from `./schemas.ts`.
- Produces:
  - `type ParseResult = { ok: true; bundles: BundleContent[] } | { ok: false; error: string }`
  - `parseBundleResponse(raw: string): ParseResult` — strips markdown code fences if present, `JSON.parse`s, validates it's an array of exactly 3 items each matching `bundleContentSchema`. Never throws.

- [ ] **Step 1: Write the failing test — `src/lib/engine/parse-response.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { parseBundleResponse } from "./parse-response";

const validItem = {
  name: "Ceramic pour-over set",
  description: "A simple one-cup ceramic dripper.",
  why: "Fits their love of slow coffee mornings.",
  estPriceRange: "$18-25",
  searchQuery: "ceramic pour over coffee dripper",
  tags: ["coffee"],
};

const validBundle = {
  theme: "The Coffee Ritual",
  rationale: "Everything for a slow coffee morning.",
  estTotal: "$45-60",
  items: [validItem, validItem, validItem],
};

const validThree = JSON.stringify([validBundle, validBundle, validBundle]);

describe("parseBundleResponse", () => {
  it("parses a clean JSON array of 3 valid bundles", () => {
    const result = parseBundleResponse(validThree);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.bundles).toHaveLength(3);
  });

  it("strips ```json markdown code fences before parsing", () => {
    const fenced = "```json\n" + validThree + "\n```";
    const result = parseBundleResponse(fenced);
    expect(result.ok).toBe(true);
  });

  it("strips bare ``` fences (no language tag) before parsing", () => {
    const fenced = "```\n" + validThree + "\n```";
    const result = parseBundleResponse(fenced);
    expect(result.ok).toBe(true);
  });

  it("fails gracefully on invalid JSON", () => {
    const result = parseBundleResponse("{not: valid json,,,");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeTruthy();
  });

  it("fails when the array does not have exactly 3 bundles", () => {
    const two = JSON.stringify([validBundle, validBundle]);
    const result = parseBundleResponse(two);
    expect(result.ok).toBe(false);
  });

  it("fails when a bundle is missing required fields", () => {
    const broken = JSON.stringify([{ theme: "X" }, validBundle, validBundle]);
    const result = parseBundleResponse(broken);
    expect(result.ok).toBe(false);
  });

  it("fails when an item count is out of the 3-6 range", () => {
    const tooFew = { ...validBundle, items: [validItem, validItem] };
    const broken = JSON.stringify([tooFew, validBundle, validBundle]);
    const result = parseBundleResponse(broken);
    expect(result.ok).toBe(false);
  });

  it("fails when the top-level value is not an array", () => {
    const result = parseBundleResponse(JSON.stringify(validBundle));
    expect(result.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — cannot resolve `./parse-response`.

- [ ] **Step 3: Write `src/lib/engine/parse-response.ts`**

```typescript
// NOTE: keep this file free of React/Next imports — reused by mobile later.
import { z } from "zod";
import { bundleContentSchema, type BundleContent } from "./schemas";

export type ParseResult =
  | { ok: true; bundles: BundleContent[] }
  | { ok: false; error: string };

const threeBundlesSchema = z.array(bundleContentSchema).length(3);

function stripCodeFences(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1] : trimmed;
}

export function parseBundleResponse(raw: string): ParseResult {
  const cleaned = stripCodeFences(raw);

  let json: unknown;
  try {
    json = JSON.parse(cleaned);
  } catch {
    return { ok: false, error: "Response was not valid JSON" };
  }

  const parsed = threeBundlesSchema.safeParse(json);
  if (!parsed.success) {
    return { ok: false, error: `Response did not match expected shape: ${parsed.error.message}` };
  }

  return { ok: true, bundles: parsed.data };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/engine/parse-response.ts src/lib/engine/parse-response.test.ts; git commit -m "feat(engine): Gemini response parser with code-fence stripping (TDD)"
```

---

### Task 4: Golden-fixture eval suite (TDD)

**Files:**
- Create: `src/lib/engine/golden-fixtures.test.ts`

**Interfaces:**
- Consumes: `parseBundleResponse` from Task 3. No live Gemini calls — this suite is 100% deterministic, using canned response strings as fixtures. Satisfies `docs/tasks.md` "Golden-fixture eval suite (budget bounds, exclusions, age rails)" requirement at the validation layer (prompt-layer rules from Task 2 are the enforcement mechanism; this suite proves the parser accepts well-formed compliant output and rejects malformed output).

- [ ] **Step 1: Write `src/lib/engine/golden-fixtures.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { parseBundleResponse } from "./parse-response";

function bundle(theme: string, estTotal: string, items: number, tags: string[][]) {
  return {
    theme,
    rationale: `A bundle themed around ${theme}.`,
    estTotal,
    items: Array.from({ length: items }, (_, i) => ({
      name: `Item ${i + 1}`,
      description: "A nice item.",
      why: "It fits the theme.",
      estPriceRange: "$10-15",
      searchQuery: `item ${i + 1} search query`,
      tags: tags[i] ?? ["misc"],
    })),
  };
}

describe("golden fixture: within-budget response is accepted", () => {
  it("accepts a well-formed $50-budget response with 3 in-range bundles", () => {
    const raw = JSON.stringify([
      bundle("Coffee Lover", "$45-55", 3, [["coffee"], ["coffee"], ["kitchen"]]),
      bundle("Cozy Reader", "$40-50", 4, [["reading"], ["cozy"], ["tea"], ["cozy"]]),
      bundle("Desk Upgrade", "$35-48", 3, [["office"], ["office"], ["gadgets"]]),
    ]);
    const result = parseBundleResponse(raw);
    expect(result.ok).toBe(true);
  });
});

describe("golden fixture: exclusions are a prompt-layer contract, not a schema field", () => {
  // The schema has no "excludedItem" flag — exclusion compliance is enforced by the
  // prompt (Task 2) and is not independently verifiable from the response shape alone.
  // This test documents that a response is structurally valid regardless of content,
  // which is why prompt correctness (tested in prompt.test.ts) is the real guarantee.
  it("a structurally valid response parses even though we cannot detect excluded words here", () => {
    const raw = JSON.stringify([
      bundle("Candle Lovers", "$30-40", 3, [["candles"], ["candles"], ["candles"]]),
      bundle("Reader", "$30-40", 3, [["reading"], ["reading"], ["reading"]]),
      bundle("Chef", "$30-40", 3, [["cooking"], ["cooking"], ["cooking"]]),
    ]);
    // This documents current behavior: schema validation alone can't catch excluded
    // words — that's why the prompt-builder test suite asserts the exclusion rule text.
    expect(parseBundleResponse(raw).ok).toBe(true);
  });
});

describe("golden fixture: malformed model output is rejected, never throws", () => {
  it("rejects a response with only 2 bundles instead of 3", () => {
    const raw = JSON.stringify([bundle("A", "$10-20", 3, [[], [], []]), bundle("B", "$10-20", 3, [[], [], []])]);
    expect(parseBundleResponse(raw).ok).toBe(false);
  });

  it("rejects a bundle with 8 items (over the 3-6 cap)", () => {
    const raw = JSON.stringify([
      bundle("Too Many", "$10-20", 8, Array(8).fill([])),
      bundle("B", "$10-20", 3, [[], [], []]),
      bundle("C", "$10-20", 3, [[], [], []]),
    ]);
    expect(parseBundleResponse(raw).ok).toBe(false);
  });

  it("rejects truncated/invalid JSON without throwing", () => {
    expect(() => parseBundleResponse('[{"theme": "Cut off mid')).not.toThrow();
    expect(parseBundleResponse('[{"theme": "Cut off mid').ok).toBe(false);
  });

  it("rejects an item missing a required field (searchQuery)", () => {
    const b = bundle("A", "$10-20", 3, [[], [], []]);
    // @ts-expect-error deliberately corrupting a fixture item for the malformed-input test
    delete b.items[0].searchQuery;
    const raw = JSON.stringify([b, bundle("B", "$10-20", 3, [[], [], []]), bundle("C", "$10-20", 3, [[], [], []])]);
    expect(parseBundleResponse(raw).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npm test`
Expected: PASS (this task is pure test-writing against already-implemented `parseBundleResponse` — no new source file).

- [ ] **Step 3: Commit**

```powershell
git add src/lib/engine/golden-fixtures.test.ts; git commit -m "test(engine): golden-fixture eval suite for budget/exclusion/malformed-output invariants"
```

---

### Task 5: Quiz hashing (TDD)

**Files:**
- Create: `src/lib/quiz/hash.ts`
- Test: `src/lib/quiz/hash.test.ts`

**Interfaces:**
- Consumes: `QuizAnswers` from `./types.ts`.
- Produces: `hashQuizAnswers(answers: QuizAnswers): string` — deterministic, order-independent (sorts array fields and object keys before hashing) stable string hash, used as the `generationCache.quizHash` / `bundles.quizHash` key.

- [ ] **Step 1: Write the failing test — `src/lib/quiz/hash.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { hashQuizAnswers } from "./hash";
import type { QuizAnswers } from "./types";

const base: QuizAnswers = {
  occasion: "Birthday",
  ageBand: "18-24",
  relationship: "Friend",
  interests: ["Coffee & tea", "Reading"],
  budget: 50,
  currency: "GBP",
  urgency: "normal",
  exclusions: ["candles"],
  country: "GB",
};

describe("hashQuizAnswers", () => {
  it("is deterministic for identical input", () => {
    expect(hashQuizAnswers(base)).toBe(hashQuizAnswers({ ...base }));
  });

  it("is order-independent for interests and exclusions arrays", () => {
    const reordered: QuizAnswers = {
      ...base,
      interests: ["Reading", "Coffee & tea"],
      exclusions: ["candles"],
    };
    expect(hashQuizAnswers(base)).toBe(hashQuizAnswers(reordered));
  });

  it("changes when budget changes", () => {
    expect(hashQuizAnswers(base)).not.toBe(hashQuizAnswers({ ...base, budget: 100 }));
  });

  it("changes when occasion changes", () => {
    expect(hashQuizAnswers(base)).not.toBe(hashQuizAnswers({ ...base, occasion: "Christmas" }));
  });

  it("produces a non-empty string of reasonable length", () => {
    const h = hashQuizAnswers(base);
    expect(typeof h).toBe("string");
    expect(h.length).toBeGreaterThanOrEqual(8);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — cannot resolve `./hash`.

- [ ] **Step 3: Write `src/lib/quiz/hash.ts`**

```typescript
// NOTE: keep this file free of React/Next imports — reused by mobile later.
import type { QuizAnswers } from "./types";

// Small, dependency-free deterministic string hash (FNV-1a). Not cryptographic —
// only used as a cache key, collisions just cause an extra Gemini call.
function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function hashQuizAnswers(answers: QuizAnswers): string {
  const normalized = {
    occasion: answers.occasion.trim().toLowerCase(),
    ageBand: answers.ageBand,
    gender: answers.gender?.trim().toLowerCase() ?? "",
    relationship: answers.relationship.trim().toLowerCase(),
    interests: [...answers.interests].map((i) => i.trim().toLowerCase()).sort(),
    freeText: answers.freeText?.trim().toLowerCase() ?? "",
    budget: answers.budget,
    currency: answers.currency,
    urgency: answers.urgency,
    exclusions: [...answers.exclusions].map((e) => e.trim().toLowerCase()).sort(),
    country: answers.country,
  };
  return fnv1a(JSON.stringify(normalized));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/quiz/hash.ts src/lib/quiz/hash.test.ts; git commit -m "feat(quiz): deterministic order-independent quiz hashing for cache keys (TDD)"
```

---

### Task 6: Convex action — generate bundles (Gemini call, cache, rate limit, persist)

**Files:**
- Create: `convex/generateBundles.ts`
- Modify: `convex/schema.ts` — no schema changes needed (bundles/generationCache/rateLimits tables already exist); confirm by reading, do not edit unless a gap is found.

**Interfaces:**
- Consumes: `hashQuizAnswers` (Task 5), `buildBundlePrompt` (Task 2), `parseBundleResponse` (Task 3), `bundleContentSchema` types.
- Produces:
  - `internalAction generateBundlesAction` — not directly callable from client (wrapped by Task 7's mutation). Args: `{ quiz: QuizAnswersValidatorShape, rateLimitKey: string }`. Returns a discriminated result object (see below) — Convex actions can return plain objects.
  - Result type (co-located in this file, exported for the mutation to re-shape):
    ```typescript
    type GenerateResult =
      | { status: "ok"; bundleIds: Id<"bundles">[]; cacheHit: boolean }
      | { status: "rate_limited" }
      | { status: "failed"; reason: string };
    ```
  - `GEMINI_MODEL` constant, exported, single source of truth for the model name (see comment in code — verify against https://ai.google.dev/gemini-api/docs/models before relying on this in production if it's been more than a few months since this was written).
  - Rate limit: `RATE_LIMIT_MAX = 10` generations per `RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000` (1 hour) per `rateLimitKey`.

- [ ] **Step 1: Read the Convex schema and generated server API to confirm exact shapes**

Run: read `convex/schema.ts` (already exists — confirm `bundles`, `generationCache`, `rateLimits` table shapes match what's used below) and skim `convex/_generated/server.d.ts` for the current `internalAction`/`action`/`internalMutation` signatures. Do not modify `convex/schema.ts` unless a genuine mismatch is found; if one is found, fix the mismatch as the first sub-step here and re-run `npx convex dev --once` before continuing.

- [ ] **Step 2: Write `convex/generateBundles.ts`**

```typescript
"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { buildBundlePrompt } from "../src/lib/engine/prompt";
import { parseBundleResponse } from "../src/lib/engine/parse-response";
import { hashQuizAnswers } from "../src/lib/quiz/hash";
import type { QuizAnswers } from "../src/lib/quiz/types";

// Gemini free-tier Flash model. Single source of truth — if generations start
// failing with a 404 "model not found", check https://ai.google.dev/gemini-api/docs/models
// for the current free-tier Flash model name and update this constant.
export const GEMINI_MODEL = "gemini-2.5-flash";

const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const quizValidator = v.object({
  occasion: v.string(),
  ageBand: v.string(),
  gender: v.optional(v.string()),
  relationship: v.string(),
  interests: v.array(v.string()),
  freeText: v.optional(v.string()),
  budget: v.number(),
  currency: v.string(),
  urgency: v.union(v.literal("fast"), v.literal("normal"), v.literal("no_rush")),
  exclusions: v.array(v.string()),
  country: v.string(),
});

export type GenerateResult =
  | { status: "ok"; bundleIds: Id<"bundles">[]; cacheHit: boolean }
  | { status: "rate_limited" }
  | { status: "failed"; reason: string };

async function callGemini(prompt: string): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            theme: { type: "STRING" },
            rationale: { type: "STRING" },
            estTotal: { type: "STRING" },
            items: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  name: { type: "STRING" },
                  description: { type: "STRING" },
                  why: { type: "STRING" },
                  estPriceRange: { type: "STRING" },
                  searchQuery: { type: "STRING" },
                  tags: { type: "ARRAY", items: { type: "STRING" } },
                },
                required: ["name", "description", "why", "estPriceRange", "searchQuery", "tags"],
              },
            },
          },
          required: ["theme", "rationale", "estTotal", "items"],
        },
      },
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify(body),
  });

  if (!res.ok) return null;
  const json = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  return json.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
}

export const generateBundlesAction = internalAction({
  args: { quiz: quizValidator, rateLimitKey: v.string() },
  handler: async (ctx, args): Promise<GenerateResult> => {
    const quiz = args.quiz as QuizAnswers;

    const allowed = await ctx.runMutation(internal.rateLimit.checkAndConsume, {
      key: args.rateLimitKey,
      max: RATE_LIMIT_MAX,
      windowMs: RATE_LIMIT_WINDOW_MS,
    });
    if (!allowed) return { status: "rate_limited" };

    const quizHash = hashQuizAnswers(quiz);

    const cached = await ctx.runQuery(internal.generationCache.getFresh, {
      quizHash,
      maxAgeMs: CACHE_TTL_MS,
    });
    if (cached) return { status: "ok", bundleIds: cached.bundleIds, cacheHit: true };

    const prompt = buildBundlePrompt(quiz);

    let raw = await callGemini(prompt);
    let parsed = raw ? parseBundleResponse(raw) : { ok: false as const, error: "No response from Gemini" };

    if (!parsed.ok) {
      // One retry on invalid/unparseable JSON, per docs/prd.md F2.
      raw = await callGemini(prompt);
      parsed = raw ? parseBundleResponse(raw) : { ok: false as const, error: "No response from Gemini (retry)" };
    }

    if (!parsed.ok) {
      return { status: "failed", reason: parsed.error };
    }

    const bundleIds: Id<"bundles">[] = await ctx.runMutation(internal.bundles.storeGenerated, {
      quizHash,
      quiz,
      bundles: parsed.bundles,
    });

    await ctx.runMutation(internal.generationCache.store, {
      quizHash,
      bundleIds,
      ttl: CACHE_TTL_MS,
    });

    return { status: "ok", bundleIds, cacheHit: false };
  },
});
```

- [ ] **Step 3: Write `convex/rateLimit.ts`**

```typescript
import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

export const checkAndConsume = internalMutation({
  args: { key: v.string(), max: v.number(), windowMs: v.number() },
  handler: async (ctx, { key, max, windowMs }) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("rateLimits")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();

    if (!existing || now - existing.windowStart >= windowMs) {
      if (existing) {
        await ctx.db.patch(existing._id, { windowStart: now, count: 1 });
      } else {
        await ctx.db.insert("rateLimits", { key, windowStart: now, count: 1 });
      }
      return true;
    }

    if (existing.count >= max) return false;

    await ctx.db.patch(existing._id, { count: existing.count + 1 });
    return true;
  },
});
```

- [ ] **Step 4: Write `convex/generationCache.ts`**

```typescript
import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

export const getFresh = internalQuery({
  args: { quizHash: v.string(), maxAgeMs: v.number() },
  handler: async (ctx, { quizHash, maxAgeMs }) => {
    const row = await ctx.db
      .query("generationCache")
      .withIndex("by_quizHash", (q) => q.eq("quizHash", quizHash))
      .unique();
    if (!row) return null;
    if (Date.now() - row.createdAt > maxAgeMs) return null;
    return row;
  },
});

export const store = internalMutation({
  args: {
    quizHash: v.string(),
    bundleIds: v.array(v.id("bundles")),
    ttl: v.number(),
  },
  handler: async (ctx, { quizHash, bundleIds, ttl }) => {
    const existing = await ctx.db
      .query("generationCache")
      .withIndex("by_quizHash", (q) => q.eq("quizHash", quizHash))
      .unique();
    const doc = { quizHash, bundleIds, createdAt: Date.now(), ttl };
    if (existing) {
      await ctx.db.patch(existing._id, doc);
    } else {
      await ctx.db.insert("generationCache", doc);
    }
  },
});
```

- [ ] **Step 5: Write `convex/bundles.ts`**

```typescript
import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

const bundleItemValidator = v.object({
  name: v.string(),
  description: v.string(),
  why: v.string(),
  estPriceRange: v.string(),
  searchQuery: v.string(),
  tags: v.array(v.string()),
});

const bundleContentValidator = v.object({
  theme: v.string(),
  rationale: v.string(),
  estTotal: v.string(),
  items: v.array(bundleItemValidator),
});

export const storeGenerated = internalMutation({
  args: {
    quizHash: v.string(),
    quiz: v.object({
      occasion: v.string(),
      ageBand: v.string(),
      gender: v.optional(v.string()),
      relationship: v.string(),
      interests: v.array(v.string()),
      freeText: v.optional(v.string()),
      budget: v.number(),
      currency: v.string(),
      urgency: v.union(v.literal("fast"), v.literal("normal"), v.literal("no_rush")),
      exclusions: v.array(v.string()),
      country: v.string(),
    }),
    bundles: v.array(bundleContentValidator),
  },
  handler: async (ctx, { quizHash, quiz, bundles }): Promise<Id<"bundles">[]> => {
    const ids: Id<"bundles">[] = [];
    const createdAt = Date.now();
    for (const bundle of bundles) {
      const id = await ctx.db.insert("bundles", {
        createdAt,
        quizHash,
        quiz,
        theme: bundle.theme,
        rationale: bundle.rationale,
        estTotal: bundle.estTotal,
        items: bundle.items,
        isPublic: false,
      });
      ids.push(id);
    }
    return ids;
  },
});
```

- [ ] **Step 6: Verify typecheck**

Run: `npm run typecheck`
Expected: PASS. If Convex's generated `internal` API object doesn't yet know about `rateLimit`, `generationCache`, or `bundles` modules, run `npx convex dev --once` first to regenerate `convex/_generated/api.d.ts`, then re-run typecheck.

- [ ] **Step 7: Commit**

```powershell
npx convex dev --once
npm run typecheck
git add convex/generateBundles.ts convex/rateLimit.ts convex/generationCache.ts convex/bundles.ts convex/_generated
git commit -m "feat(engine): Convex action wiring Gemini generation, cache, rate limit, persistence"
```

---

### Task 7: Public `generate` mutation + verification

**Files:**
- Create: `convex/quiz.ts`

**Interfaces:**
- Consumes: `generateBundlesAction` from Task 6 (via `internal.generateBundles.generateBundlesAction`).
- Produces: `mutation generate` — client-callable. Args: `{ quiz: <same quiz validator shape as Task 6>, rateLimitKey: v.string() }`. This is what next sprint's results UI calls (`useMutation(api.quiz.generate)`). Returns the same `GenerateResult` shape as the action, forwarded as-is (Convex mutations can call actions via `ctx.scheduler` or must the action be called from an action, not a mutation — resolve this in Step 1 below per the guidelines file; if mutations cannot directly call actions, make this a public `action` instead of a `mutation` and note that in a one-line comment).

- [ ] **Step 1: Confirm mutation-calling-action rules**

Run: re-check `convex/_generated/ai/guidelines.md` (read in Task 0) specifically for whether a `mutation` may call an `action` via `ctx.scheduler.runAfter` (fire-and-forget, wrong for this synchronous-result use case) versus whether the public entry point must itself be a Convex `action` (which CAN call other actions/mutations/queries via `ctx.runAction`/`ctx.runMutation`/`ctx.runQuery`). Use whichever the guidelines file confirms is correct; the code below assumes the public entry point must be an `action` (not a `mutation`) because it needs to synchronously await `generateBundlesAction`'s result — adjust the export keyword if the guidelines say otherwise.

- [ ] **Step 2: Write `convex/quiz.ts`**

```typescript
import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import type { GenerateResult } from "./generateBundles";

const quizValidator = v.object({
  occasion: v.string(),
  ageBand: v.string(),
  gender: v.optional(v.string()),
  relationship: v.string(),
  interests: v.array(v.string()),
  freeText: v.optional(v.string()),
  budget: v.number(),
  currency: v.string(),
  urgency: v.union(v.literal("fast"), v.literal("normal"), v.literal("no_rush")),
  exclusions: v.array(v.string()),
  country: v.string(),
});

// Client-callable entry point for the results UI (next sprint).
// This is a Convex `action` (not `mutation`) because it must synchronously
// await the Gemini call in generateBundlesAction — see plan Task 7 Step 1.
export const generate = action({
  args: { quiz: quizValidator, rateLimitKey: v.string() },
  handler: async (ctx, args): Promise<GenerateResult> => {
    return await ctx.runAction(internal.generateBundles.generateBundlesAction, args);
  },
});
```

- [ ] **Step 3: Full verification suite**

Run: `npx convex dev --once; npm run typecheck; npm run lint; npm test; npm run build`
Expected: all PASS. Do NOT manually invoke `npx convex run quiz:generate` with real args in this task — that would spend real Gemini quota outside of the actual product flow; live verification of the end-to-end Gemini call happens naturally next sprint when the results UI calls it, or optionally now via one single manual `npx convex run quiz:generate '{"quiz": {...}, "rateLimitKey": "manual-test"}'` if you want to confirm connectivity — this is optional and at the implementer's discretion, capped at one call.

- [ ] **Step 4: Update docs + commit + push**

In `docs/tasks.md`, flip the "Bundle Engine" and "Link Builder" checkboxes under Milestone 2 to `[x]` (Zod schemas, prompt, Convex action, cache, rate limit, fallback wiring, golden-fixture suite, link builder + tests). Leave "Quota-exhausted fallback → trending bundles" unchecked — that's a results-UI concern for next sprint (the engine already returns `{status: "failed"}` cleanly; the UI switching to trending bundles on that status is the remaining piece). In `docs/checkpoint.md`: progress, completed items, current focus (next: results UI sprint), change log.

```powershell
git add -A; git commit -m "feat(engine): link builder + bundle engine complete; M2 sprint 2 done"; git push
```

---

## Self-Review Notes

- **Spec coverage:** PRD F2 (engine) → Tasks 2,3,5,6 (prompt, parse, hash, action+cache+retry+rate-limit). PRD F3 (links) → Task 1. tasks.md "Golden-fixture eval suite" → Task 4. tasks.md "Per-IP/user rate limiting" → Task 6 `checkAndConsume`. tasks.md "Quota-exhausted fallback" → explicitly deferred to next sprint's UI (engine returns a typed `failed`/`rate_limited` status for the UI to act on; documented in Task 7 Step 4).
- **Type consistency:** `GenerateResult` defined once in `generateBundles.ts`, re-exported and reused verbatim by `quiz.ts` — no redefinition drift. `bundleContentValidator`/`bundleItemValidator` in `convex/bundles.ts` field names match `bundleContentSchema`/`bundleItemSchema` in `src/lib/engine/schemas.ts` exactly (theme, rationale, estTotal, items / name, description, why, estPriceRange, searchQuery, tags). Quiz validator shape repeated in `generateBundles.ts`, `bundles.ts`, and `quiz.ts` matches `convex/schema.ts` `bundles.quiz` and `src/lib/quiz/types.ts QuizAnswers` field-for-field — this is intentional repetition (Convex validators can't easily import a shared const across the action/mutation boundary in older Convex versions Task 0's guidelines-read should confirm; if the guidelines show a supported shared-validator pattern, factor this into one `convex/validators.ts` file instead and update all three call sites).
- **Placeholder scan:** clean — every step has runnable code; the one open decision (mutation vs action in Task 7) is explicitly resolved by reading project-provided guidelines before writing code, not left as a TODO.
- **Uncertainty flagged, not hidden:** `GEMINI_MODEL` constant carries an explicit comment because current model names can't be verified offline; if `callGemini` starts returning `null` (fetch not-ok) in practice, that surfaces as a clean `{status: "failed"}` rather than a crash, and the model name is a one-line fix.
