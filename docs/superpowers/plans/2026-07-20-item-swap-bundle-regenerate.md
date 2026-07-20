# Item Swap & Per-Bundle Regenerate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user replace a single item in a generated bundle ("show me another") or regenerate an entire bundle slot in place, without re-running the whole quiz. Closes both Backlog items in `docs/tasks.md`.

**Architecture:** Two new pure prompt-builders + two new response parsers in `src/lib/engine/` (same layer as the existing 3-bundle generator, TDD'd the same way). Two new Convex actions in `convex/generateBundles.ts` that reuse the existing `callGemini`/media-enrichment machinery (parameterizing `callGemini`'s response schema, since it's currently hardcoded for the 3-bundle-array shape) and patch the target `bundles` doc in place — Convex's reactivity means every page currently showing that bundle (`/quiz/results`, `/my-bundles`, `/popular`) updates automatically, no client cache invalidation needed. `BundleCard` gets two new buttons wired to these actions via `useAction`.

**Tech Stack:** Same as the rest of the engine — Convex actions, Gemini Flash structured output, Zod validation, Vitest, Playwright. No new dependencies.

## Global Constraints

- $0 operating cost — no new service, reuses the existing free-tier Gemini setup.
- No new auth/ownership checks on `bundles` docs — matches the existing trust model (`convex/bundles.ts` `makePublic`'s comment: "No ownership check: there's no auth system yet... anyone who generated a bundle in their own session already has its id").
- Reuse the existing rate limiter (`internal.rateLimit.checkAndConsume`, `RATE_LIMIT_MAX`/`RATE_LIMIT_WINDOW_MS` from `convex/generateBundles.ts`) — no new bucket.
- Real Gemini API calls in the E2E suite are quota-gated to chromium-only, following `tests/e2e/quiz-flow.spec.ts`'s established `test.skip(({browserName}) => ..., "...")` convention — this plan adds exactly one more such test, not more.
- Analytics event names are canonical per `docs/prd.md` §2.3 and already reserved in `src/lib/analytics.ts`'s `AnalyticsEvent` union: `item_swapped`, `bundle_regenerated`. Do not invent new event names.
- Keep `convex/generateBundles.ts` free of new "use node" requirements — everything here uses `fetch`, already proven to work in Convex's default runtime.

---

### Task 1: Pure engine layer — prompt builders + parsers (TDD)

**Files:**
- Modify: `src/lib/engine/prompt.ts`
- Modify: `src/lib/engine/parse-response.ts`
- Test: `src/lib/engine/prompt.test.ts`
- Test: `src/lib/engine/parse-response.test.ts` (check if this file exists first — if the parser currently has no dedicated test file and is only covered via `golden-fixtures.test.ts`, add the new tests there instead, following whichever file already imports `parseBundleResponse`)

**Interfaces:**
- Produces: `buildItemSwapPrompt(answers: QuizAnswers, bundleTheme: string, otherItemNames: string[], itemToReplaceName: string, pastItemNames?: string[]): string`; `buildBundleRegeneratePrompt(answers: QuizAnswers, currentTheme: string, pastItemNames?: string[]): string`; `parseItemResponse(raw: string): { ok: true; item: BundleItem } | { ok: false; error: string }`; `parseSingleBundleResponse(raw: string): { ok: true; bundle: BundleContent } | { ok: false; error: string }`. These four are consumed by Task 3's Convex actions.

- [ ] **Step 1: Check whether `parse-response.ts` has its own test file**

Run: `find src/lib/engine -iname "parse-response.test.ts"` (or `ls src/lib/engine/*.test.ts` and inspect which file imports `parseBundleResponse`)
If no dedicated file exists, add the new parser tests to `src/lib/engine/golden-fixtures.test.ts` (it already imports and tests `parseBundleResponse`) instead of creating a new file. The steps below assume no dedicated file exists — adjust the target file accordingly if one does.

- [ ] **Step 2: Write the failing tests for the prompt builders**

Append to `src/lib/engine/prompt.test.ts`:

```ts
import { buildItemSwapPrompt, buildBundleRegeneratePrompt } from "./prompt";

describe("buildItemSwapPrompt", () => {
  it("includes the recipient context, bundle theme, and item to replace", () => {
    const p = buildItemSwapPrompt(answers, "Cozy Coffee Morning", ["Ceramic Mug"], "French Press");
    expect(p).toContain("Birthday");
    expect(p).toContain("Cozy Coffee Morning");
    expect(p).toContain("French Press");
    expect(p).toContain("candles"); // exclusions still apply
    expect(p).toContain("50"); // budget still applies
  });

  it("lists the other items so the replacement doesn't duplicate them", () => {
    const p = buildItemSwapPrompt(answers, "Cozy Coffee Morning", ["Ceramic Mug", "Coffee Beans"], "French Press");
    expect(p).toContain("Ceramic Mug");
    expect(p).toContain("Coffee Beans");
  });

  it("asks for exactly one replacement item, not a full bundle", () => {
    const p = buildItemSwapPrompt(answers, "Cozy Coffee Morning", [], "French Press");
    expect(p).toMatch(/one|single/i);
    expect(p).not.toMatch(/exactly 3/i);
  });

  it("mentions the required JSON field names for a single item object", () => {
    const p = buildItemSwapPrompt(answers, "Cozy Coffee Morning", [], "French Press");
    for (const field of ["name", "description", "why", "estPriceRange", "searchQuery", "tags"]) {
      expect(p).toContain(field);
    }
  });

  it("instructs avoiding past items when provided", () => {
    const p = buildItemSwapPrompt(answers, "Cozy Coffee Morning", [], "French Press", ["Old Mug"]);
    expect(p).toContain("Old Mug");
    expect(p).toMatch(/avoid|previously/i);
  });
});

describe("buildBundleRegeneratePrompt", () => {
  it("includes the recipient context and the current theme to differ from", () => {
    const p = buildBundleRegeneratePrompt(answers, "Cozy Coffee Morning");
    expect(p).toContain("Birthday");
    expect(p).toContain("Cozy Coffee Morning");
    expect(p).toContain("candles");
    expect(p).toContain("50");
  });

  it("asks for exactly one bundle, not three", () => {
    const p = buildBundleRegeneratePrompt(answers, "Cozy Coffee Morning");
    expect(p).toMatch(/one|single/i);
    expect(p).not.toMatch(/exactly 3/i);
  });

  it("mentions the required JSON field names for a single bundle object", () => {
    const p = buildBundleRegeneratePrompt(answers, "Cozy Coffee Morning");
    for (const field of ["theme", "rationale", "estTotal", "items", "name", "description", "why", "estPriceRange", "searchQuery", "tags"]) {
      expect(p).toContain(field);
    }
  });

  it("instructs avoiding past items when provided", () => {
    const p = buildBundleRegeneratePrompt(answers, "Cozy Coffee Morning", ["Old Mug"]);
    expect(p).toContain("Old Mug");
    expect(p).toMatch(/avoid|previously/i);
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run src/lib/engine/prompt.test.ts`
Expected: FAIL — `buildItemSwapPrompt`/`buildBundleRegeneratePrompt` not exported from `./prompt`.

- [ ] **Step 4: Implement the two prompt builders**

Append to `src/lib/engine/prompt.ts` (keep the existing `URGENCY_COPY` and `buildBundlePrompt` untouched above this):

```ts
export function buildItemSwapPrompt(
  answers: QuizAnswers,
  bundleTheme: string,
  otherItemNames: string[],
  itemToReplaceName: string,
  pastItemNames: string[] = []
): string {
  const lines: string[] = [];
  lines.push(
    "You are a thoughtful professional gift consultant. A recipient's gift bundle needs ONE item replaced with a better-fitting alternative."
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
  lines.push(
    `- Exclusions (NEVER include these, or close synonyms of them): ${
      answers.exclusions.length ? answers.exclusions.join(", ") : "none"
    }`
  );
  lines.push("");
  lines.push(`BUNDLE THEME: ${bundleTheme}`);
  lines.push(`ITEM BEING REPLACED: ${itemToReplaceName}`);
  if (otherItemNames.length) {
    lines.push(`OTHER ITEMS ALREADY IN THIS BUNDLE (do not duplicate or closely repeat these): ${otherItemNames.join(", ")}`);
  }
  if (pastItemNames.length) {
    lines.push(
      `PREVIOUSLY SUGGESTED ITEMS FOR THIS RECIPIENT (avoid repeating these or close variants): ${pastItemNames.join(", ")}`
    );
  }
  lines.push("");
  lines.push("RULES:");
  lines.push("1. Suggest exactly one single replacement item that fits the bundle theme better than the item being replaced.");
  lines.push("2. Respect the total budget and never suggest an excluded item or close synonym of one.");
  lines.push('3. Price is always an ESTIMATE range (e.g. "$15-25"), never a specific live price.');
  lines.push("4. Apply age-appropriate safety rules, same as any gift suggestion.");
  lines.push("5. Do not repeat the item being replaced, the other items already in the bundle, or any previously suggested item listed above.");
  lines.push("");
  lines.push("OUTPUT FORMAT:");
  lines.push(
    'Return JSON only, a single object (not an array) with fields: "name" (string), ' +
      '"description" (string, 1 sentence), "why" (string, why this item fits), ' +
      '"estPriceRange" (string like "$15-25"), "searchQuery" (string, a good product-search phrase for a retailer search box), ' +
      '"tags" (array of 1-4 short lowercase strings).'
  );
  return lines.join("\n");
}

export function buildBundleRegeneratePrompt(
  answers: QuizAnswers,
  currentTheme: string,
  pastItemNames: string[] = []
): string {
  const lines: string[] = [];
  lines.push(
    "You are a thoughtful professional gift consultant. Design ONE alternative gift bundle for the following recipient, different from a bundle they've already seen."
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
  if (pastItemNames.length) {
    lines.push(
      `- Previously suggested items for this recipient (avoid repeating these or close variants): ${pastItemNames.join(", ")}`
    );
  }
  lines.push("");
  lines.push(`ALREADY-SEEN BUNDLE THEME (produce something meaningfully different from this): ${currentTheme}`);
  lines.push("");
  lines.push("RULES:");
  lines.push("1. Produce exactly one single gift bundle, built around one clear, coherent theme distinct from the already-seen theme above.");
  lines.push("2. The bundle must contain between 3 and 6 items that genuinely complement each other under that theme.");
  lines.push("3. Respect the total budget: the sum of the item price ranges must stay close to it (within about 20%), never wildly over.");
  lines.push("4. NEVER suggest an excluded item, or a close synonym/variant of one, in the bundle.");
  lines.push('5. Prices are always an ESTIMATE range (e.g. "$15-25"), never a specific live price or a claim of current availability.');
  lines.push("6. Apply age-appropriate safety rules: never suggest alcohol, tobacco, or age-restricted items unless the age band is clearly a legal adult for that item in a typical country, and prefer to avoid alcohol entirely unless interests explicitly mention it.");
  lines.push("7. Avoid generic, cliché gifts unless they genuinely fit the interests given.");
  if (pastItemNames.length) {
    lines.push("8. Do not repeat any item from the 'previously suggested items' list above, or a near-identical variant of one.");
  }
  lines.push("");
  lines.push("OUTPUT FORMAT:");
  lines.push(
    "Return JSON only, a single object (not an array) with fields: " +
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

- [ ] **Step 5: Run to verify the prompt tests pass**

Run: `npx vitest run src/lib/engine/prompt.test.ts`
Expected: PASS — all tests including the pre-existing `buildBundlePrompt` ones.

- [ ] **Step 6: Write the failing tests for the two new parsers**

Append to `src/lib/engine/golden-fixtures.test.ts` (reusing its existing `bundle()` fixture helper and imports):

```ts
import { parseItemResponse, parseSingleBundleResponse } from "./parse-response";

describe("parseItemResponse", () => {
  it("accepts a well-formed single item object", () => {
    const raw = JSON.stringify({
      name: "French Press",
      description: "A classic glass French press.",
      why: "Perfect for slow coffee mornings.",
      estPriceRange: "$20-30",
      searchQuery: "glass french press coffee maker",
      tags: ["coffee"],
    });
    const result = parseItemResponse(raw);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.item.name).toBe("French Press");
  });

  it("rejects a response missing a required field", () => {
    const raw = JSON.stringify({ name: "French Press", description: "A press." });
    expect(parseItemResponse(raw).ok).toBe(false);
  });

  it("rejects a response that's an array instead of a single object", () => {
    const raw = JSON.stringify([
      { name: "A", description: "d", why: "w", estPriceRange: "$1-2", searchQuery: "a", tags: ["x"] },
    ]);
    expect(parseItemResponse(raw).ok).toBe(false);
  });

  it("strips code fences like the bundle parser does", () => {
    const raw =
      "```json\n" +
      JSON.stringify({
        name: "French Press",
        description: "A press.",
        why: "Fits.",
        estPriceRange: "$20-30",
        searchQuery: "french press",
        tags: ["coffee"],
      }) +
      "\n```";
    expect(parseItemResponse(raw).ok).toBe(true);
  });
});

describe("parseSingleBundleResponse", () => {
  it("accepts a well-formed single bundle object", () => {
    const raw = JSON.stringify(bundle("Tea Ritual", "$40-55", 3, [["tea"], ["cozy"], ["reading"]]));
    const result = parseSingleBundleResponse(raw);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.bundle.theme).toBe("Tea Ritual");
  });

  it("rejects a response that's an array instead of a single object", () => {
    const raw = JSON.stringify([bundle("A", "$10-20", 3, [[], [], []])]);
    expect(parseSingleBundleResponse(raw).ok).toBe(false);
  });

  it("rejects a bundle with only 2 items (below the 3-6 range)", () => {
    const raw = JSON.stringify(bundle("Too Few", "$10-20", 2, [[], []]));
    expect(parseSingleBundleResponse(raw).ok).toBe(false);
  });
});
```

- [ ] **Step 7: Run to verify it fails**

Run: `npx vitest run src/lib/engine/golden-fixtures.test.ts`
Expected: FAIL — `parseItemResponse`/`parseSingleBundleResponse` not exported from `./parse-response`.

- [ ] **Step 8: Implement the two parsers**

Modify `src/lib/engine/parse-response.ts` — add these imports and two new exports (keep everything else, including `stripCodeFences` and `parseBundleResponse`, unchanged):

```ts
import { bundleContentSchema, bundleItemSchema, type BundleContent, type BundleItem } from "./schemas";

export type ParseItemResult = { ok: true; item: BundleItem } | { ok: false; error: string };

export function parseItemResponse(raw: string): ParseItemResult {
  const cleaned = stripCodeFences(raw);

  let json: unknown;
  try {
    json = JSON.parse(cleaned);
  } catch {
    return { ok: false, error: "Response was not valid JSON" };
  }

  const parsed = bundleItemSchema.safeParse(json);
  if (!parsed.success) {
    return { ok: false, error: `Response did not match expected shape: ${parsed.error.message}` };
  }

  return { ok: true, item: parsed.data };
}

export type ParseSingleBundleResult = { ok: true; bundle: BundleContent } | { ok: false; error: string };

export function parseSingleBundleResponse(raw: string): ParseSingleBundleResult {
  const cleaned = stripCodeFences(raw);

  let json: unknown;
  try {
    json = JSON.parse(cleaned);
  } catch {
    return { ok: false, error: "Response was not valid JSON" };
  }

  const parsed = bundleContentSchema.safeParse(json);
  if (!parsed.success) {
    return { ok: false, error: `Response did not match expected shape: ${parsed.error.message}` };
  }

  return { ok: true, bundle: parsed.data };
}
```

(The existing `import { bundleContentSchema, type BundleContent } from "./schemas";` line at the top of the file should be replaced by the combined import above, adding `bundleItemSchema` and `BundleItem` — don't leave a duplicate import line.)

- [ ] **Step 9: Run to verify it passes**

Run: `npx vitest run src/lib/engine/golden-fixtures.test.ts src/lib/engine/prompt.test.ts`
Expected: PASS, all tests.

- [ ] **Step 10: Run the full unit suite and typecheck**

Run: `npm test && npx tsc --noEmit`
Expected: all green, no type errors.

- [ ] **Step 11: Commit**

```bash
git add src/lib/engine/prompt.ts src/lib/engine/parse-response.ts src/lib/engine/prompt.test.ts src/lib/engine/golden-fixtures.test.ts
git commit -m "feat(engine): prompt builders + parsers for item-swap and bundle-regenerate"
```

---

### Task 2: Convex plumbing — parameterize `callGemini`, add bundle helper query/mutations

**Files:**
- Modify: `convex/generateBundles.ts`
- Modify: `convex/bundles.ts`

**Interfaces:**
- Consumes: `parseItemResponse`, `parseSingleBundleResponse`, `buildItemSwapPrompt`, `buildBundleRegeneratePrompt` from Task 1.
- Produces: `callGemini(prompt: string, responseSchema: object): Promise<string | null>` (now parameterized — Task 3 passes schema constants defined in this task); `enrichItemWithMedia(item: BundleItem, country: string, ebayToken: string | null): Promise<BundleItem>` (factored out, consumed by Task 3); in `convex/bundles.ts`: `internal.bundles.getByIdInternal` (query, `{id: Id<"bundles">}` → bundle doc or null), `internal.bundles.patchItems` (mutation, `{id, items}` → null), `internal.bundles.patchContent` (mutation, `{id, theme, rationale, estTotal, items}` → null) — all consumed by Task 3.

- [ ] **Step 1: Add the two Convex helper functions to `convex/bundles.ts`**

Modify the import line at the top of `convex/bundles.ts`:

```ts
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
```

Add these three exports (after `storeGenerated`, before `getByIds` — anywhere in the file works, but keep related internal functions grouped):

```ts
// Server-side-only bundle lookup — used by the swap/regenerate actions in
// generateBundles.ts, which need to read a bundle's current content before
// asking Gemini for a replacement.
export const getByIdInternal = internalQuery({
  args: { id: v.id("bundles") },
  handler: async (ctx, { id }) => ctx.db.get("bundles", id),
});

// Replaces just the items array (used by item-swap — the theme/rationale/
// estTotal stay the same, only one item changes).
export const patchItems = internalMutation({
  args: { id: v.id("bundles"), items: v.array(bundleItemValidator) },
  handler: async (ctx, { id, items }) => {
    await ctx.db.patch("bundles", id, { items });
    return null;
  },
});

// Replaces the whole bundle's content in place, keeping the same _id (used by
// per-bundle regenerate — the slot stays the same, its content is refreshed).
export const patchContent = internalMutation({
  args: {
    id: v.id("bundles"),
    theme: v.string(),
    rationale: v.string(),
    estTotal: v.string(),
    items: v.array(bundleItemValidator),
  },
  handler: async (ctx, { id, theme, rationale, estTotal, items }) => {
    await ctx.db.patch("bundles", id, { theme, rationale, estTotal, items });
    return null;
  },
});
```

- [ ] **Step 2: Deploy and confirm the new Convex functions typecheck**

Run: `npx convex dev --once` (or, if `npx convex dev` is already running in the background for this session, just watch its output)
Expected: "Convex functions ready!" with no TypeScript errors, and `internal.bundles.getByIdInternal`/`patchItems`/`patchContent` available in the generated API.

- [ ] **Step 3: Parameterize `callGemini`'s response schema**

In `convex/generateBundles.ts`, replace the `callGemini` function and its inline schema with a parameterized version. First, extract the schema constants (add these right before the `callGemini` function definition):

```ts
const BUNDLE_ITEM_RESPONSE_SCHEMA = {
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
};

const BUNDLE_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    theme: { type: "STRING" },
    rationale: { type: "STRING" },
    estTotal: { type: "STRING" },
    items: { type: "ARRAY", items: BUNDLE_ITEM_RESPONSE_SCHEMA },
  },
  required: ["theme", "rationale", "estTotal", "items"],
};

const THREE_BUNDLES_RESPONSE_SCHEMA = {
  type: "ARRAY",
  items: BUNDLE_RESPONSE_SCHEMA,
};
```

Then replace the existing `callGemini` function body (currently hardcodes the array-of-3-bundles schema inline in `generationConfig.responseSchema`) with:

```ts
async function callGemini(prompt: string, responseSchema: object): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema,
    },
  };

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(body),
    });
  } catch {
    return null; // network failure — treated as a clean generation failure upstream
  }

  if (!res.ok) return null;
  const json = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  return json.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
}
```

- [ ] **Step 4: Update the two existing `callGemini` call sites in the `generate` action to pass the schema**

In the `generate` action's handler, both `callGemini(prompt)` calls become `callGemini(prompt, THREE_BUNDLES_RESPONSE_SCHEMA)`:

```ts
    let raw = await callGemini(prompt, THREE_BUNDLES_RESPONSE_SCHEMA);
    let parsed = raw
      ? parseBundleResponse(raw)
      : ({ ok: false, error: "No response from Gemini" } as const);

    if (!parsed.ok) {
      // One retry on invalid/unparseable JSON, per docs/prd.md F2.
      raw = await callGemini(prompt, THREE_BUNDLES_RESPONSE_SCHEMA);
      parsed = raw
        ? parseBundleResponse(raw)
        : ({ ok: false, error: "No response from Gemini (retry)" } as const);
    }
```

- [ ] **Step 5: Factor `enrichItemWithMedia` out of `enrichBundlesWithMedia`**

Replace the existing `enrichBundlesWithMedia` function with:

```ts
// Attaches best-effort media to a single item: a real eBay product (photo +
// direct link + price) when available, else a representative stock image, else
// nothing. Never throws — media is best-effort and must never block generation.
async function enrichItemWithMedia(
  item: BundleItem,
  country: string,
  ebayToken: string | null
): Promise<BundleItem> {
  const realProduct = ebayToken
    ? await fetchEbayProduct(buildStockImageQuery(item), country, ebayToken)
    : null;
  const stock = await fetchStockImage(buildStockImageQuery(item));
  const media = chooseItemMedia({ realProduct, stock });
  return { ...item, ...media };
}

// Attaches best-effort media to every item of every bundle — see
// enrichItemWithMedia for the per-item logic.
async function enrichBundlesWithMedia(
  bundles: BundleContent[],
  country: string
): Promise<BundleContent[]> {
  const ebayToken = await getEbayToken();
  return Promise.all(
    bundles.map(async (bundle) => ({
      ...bundle,
      items: await Promise.all(
        bundle.items.map((item) => enrichItemWithMedia(item, country, ebayToken))
      ),
    }))
  );
}
```

- [ ] **Step 6: Update the `BundleContent`/`BundleItem` type import**

Change this existing import line in `convex/generateBundles.ts`:

```ts
import type { BundleContent } from "../src/lib/engine/schemas";
```

to:

```ts
import type { BundleContent, BundleItem } from "../src/lib/engine/schemas";
```

- [ ] **Step 7: Run typecheck and the full test suite**

Run: `npx tsc --noEmit && npm test`
Expected: clean typecheck, all Vitest tests still passing (this task only refactors — Task 3 is what actually wires the new actions).

- [ ] **Step 8: Commit**

```bash
git add convex/generateBundles.ts convex/bundles.ts
git commit -m "refactor(engine): parameterize callGemini's response schema, extract per-item media enrichment"
```

---

### Task 3: Convex actions `swapItem` and `regenerateBundle`

**Files:**
- Modify: `convex/generateBundles.ts`

**Interfaces:**
- Consumes: everything from Task 1 and Task 2.
- Produces: `api.generateBundles.swapItem` (action, args `{bundleId: Id<"bundles">, itemIndex: number, rateLimitKey: string}`, returns `SwapItemResult`); `api.generateBundles.regenerateBundle` (action, args `{bundleId: Id<"bundles">, rateLimitKey: string}`, returns `RegenerateBundleResult`) — both consumed by Task 4's UI.

- [ ] **Step 1: Add the two result types and import the new engine functions**

Add to the imports at the top of `convex/generateBundles.ts`:

```ts
import { buildBundlePrompt, buildItemSwapPrompt, buildBundleRegeneratePrompt } from "../src/lib/engine/prompt";
import { parseBundleResponse, parseItemResponse, parseSingleBundleResponse } from "../src/lib/engine/parse-response";
```

(These replace the existing single-import lines for `buildBundlePrompt` and `parseBundleResponse` — combine rather than duplicate.)

Add these two result types near the existing `GenerateResult` type:

```ts
export type SwapItemResult =
  | { status: "ok" }
  | { status: "rate_limited" }
  | { status: "failed"; reason: string };

export type RegenerateBundleResult =
  | { status: "ok" }
  | { status: "rate_limited" }
  | { status: "failed"; reason: string };
```

- [ ] **Step 2: Add the `swapItem` action**

Append after the existing `generate` action:

```ts
export const swapItem = action({
  args: {
    bundleId: v.id("bundles"),
    itemIndex: v.number(),
    rateLimitKey: v.string(),
  },
  handler: async (ctx, { bundleId, itemIndex, rateLimitKey }): Promise<SwapItemResult> => {
    const allowed: boolean = await ctx.runMutation(internal.rateLimit.checkAndConsume, {
      key: rateLimitKey,
      max: RATE_LIMIT_MAX,
      windowMs: RATE_LIMIT_WINDOW_MS,
    });
    if (!allowed) return { status: "rate_limited" };

    const bundle = await ctx.runQuery(internal.bundles.getByIdInternal, { id: bundleId });
    if (!bundle) return { status: "failed", reason: "Bundle not found" };
    if (itemIndex < 0 || itemIndex >= bundle.items.length) {
      return { status: "failed", reason: "Invalid item index" };
    }

    const itemToReplace = bundle.items[itemIndex];
    const otherItemNames = bundle.items.filter((_, i) => i !== itemIndex).map((it) => it.name);
    const prompt = buildItemSwapPrompt(
      bundle.quiz as QuizAnswers,
      bundle.theme,
      otherItemNames,
      itemToReplace.name
    );

    let raw = await callGemini(prompt, BUNDLE_ITEM_RESPONSE_SCHEMA);
    let parsed = raw
      ? parseItemResponse(raw)
      : ({ ok: false, error: "No response from Gemini" } as const);
    if (!parsed.ok) {
      raw = await callGemini(prompt, BUNDLE_ITEM_RESPONSE_SCHEMA);
      parsed = raw
        ? parseItemResponse(raw)
        : ({ ok: false, error: "No response from Gemini (retry)" } as const);
    }
    if (!parsed.ok) return { status: "failed", reason: parsed.error };

    const ebayToken = await getEbayToken();
    const enrichedItem = await enrichItemWithMedia(parsed.item, bundle.quiz.country, ebayToken);

    const newItems = [...bundle.items];
    newItems[itemIndex] = enrichedItem;
    await ctx.runMutation(internal.bundles.patchItems, { id: bundleId, items: newItems });

    return { status: "ok" };
  },
});
```

- [ ] **Step 3: Add the `regenerateBundle` action**

Append after `swapItem`:

```ts
export const regenerateBundle = action({
  args: {
    bundleId: v.id("bundles"),
    rateLimitKey: v.string(),
  },
  handler: async (ctx, { bundleId, rateLimitKey }): Promise<RegenerateBundleResult> => {
    const allowed: boolean = await ctx.runMutation(internal.rateLimit.checkAndConsume, {
      key: rateLimitKey,
      max: RATE_LIMIT_MAX,
      windowMs: RATE_LIMIT_WINDOW_MS,
    });
    if (!allowed) return { status: "rate_limited" };

    const bundle = await ctx.runQuery(internal.bundles.getByIdInternal, { id: bundleId });
    if (!bundle) return { status: "failed", reason: "Bundle not found" };

    const prompt = buildBundleRegeneratePrompt(bundle.quiz as QuizAnswers, bundle.theme);

    let raw = await callGemini(prompt, BUNDLE_RESPONSE_SCHEMA);
    let parsed = raw
      ? parseSingleBundleResponse(raw)
      : ({ ok: false, error: "No response from Gemini" } as const);
    if (!parsed.ok) {
      raw = await callGemini(prompt, BUNDLE_RESPONSE_SCHEMA);
      parsed = raw
        ? parseSingleBundleResponse(raw)
        : ({ ok: false, error: "No response from Gemini (retry)" } as const);
    }
    if (!parsed.ok) return { status: "failed", reason: parsed.error };

    const [enrichedBundle] = await enrichBundlesWithMedia([parsed.bundle], bundle.quiz.country);

    await ctx.runMutation(internal.bundles.patchContent, {
      id: bundleId,
      theme: enrichedBundle.theme,
      rationale: enrichedBundle.rationale,
      estTotal: enrichedBundle.estTotal,
      items: enrichedBundle.items,
    });

    return { status: "ok" };
  },
});
```

- [ ] **Step 4: Typecheck and deploy locally**

Run: `npx tsc --noEmit`
Expected: clean. Then confirm `npx convex dev` (already running for this session, or run `npx convex dev --once`) picks up the new actions without errors — check its terminal output for "Convex functions ready!".

- [ ] **Step 5: Manually verify one real call against local dev**

Run: `npx convex run testSupport:seedPopularBundle "{}"` and note the returned bundle id, then:

Run: `npx convex run generateBundles:swapItem '{"bundleId":"<paste-id>","itemIndex":0,"rateLimitKey":"manual-swap-test-1"}'`
Expected: `{"status":"ok"}`. Then run `npx convex run bundles:getByIdInternal '{"id":"<paste-id>"}'` and confirm `items[0]` changed from `"Popular Item One"` to something new.

Run: `npx convex run generateBundles:regenerateBundle '{"bundleId":"<paste-id>","rateLimitKey":"manual-regen-test-1"}'`
Expected: `{"status":"ok"}`. Confirm via `getByIdInternal` that `theme` changed from `"E2E Popular Bundle"` to something new and different, with 3-6 items.

- [ ] **Step 6: Commit**

```bash
git add convex/generateBundles.ts
git commit -m "feat(engine): add swapItem and regenerateBundle Convex actions"
```

---

### Task 4: BundleCard UI — swap and regenerate buttons

**Files:**
- Modify: `src/components/bundles/bundle-card.tsx`

**Interfaces:**
- Consumes: `api.generateBundles.swapItem`, `api.generateBundles.regenerateBundle` (Task 3); `getOrCreateSessionId` from `@/lib/session-id`; `"item_swapped"`/`"bundle_regenerated"` from the existing `AnalyticsEvent` union.

- [ ] **Step 1: Add imports and local state**

Add to the top of `src/components/bundles/bundle-card.tsx`:

```ts
import { useAction } from "convex/react";
import { getOrCreateSessionId } from "@/lib/session-id";
```

(`useMutation` is already imported — add `useAction` alongside it, e.g. `import { useMutation, useAction } from "convex/react";`.)

Inside the `BundleCard` function, alongside the existing `makePublic`/`record`/`shareState` hooks, add:

```ts
  const swapItem = useAction(api.generateBundles.swapItem);
  const regenerateBundle = useAction(api.generateBundles.regenerateBundle);
  const [swappingIndex, setSwappingIndex] = useState<number | null>(null);
  const [regenerating, setRegenerating] = useState(false);
```

- [ ] **Step 2: Add the per-bundle "Regenerate" button next to Save/Share**

In the header button row (the `bundleId ? (<div className="flex shrink-0 gap-2">...` block), add a third button after the existing Share button:

```tsx
        {bundleId ? (
          <div className="flex shrink-0 gap-2">
            <SaveButton bundleId={bundleId} />
            <button
              type="button"
              onClick={handleShare}
              disabled={shareState === "sharing"}
              className="rounded-full border border-foreground/20 px-3 py-1.5 text-xs transition hover:border-foreground/50"
            >
              {shareState === "copied" ? "Link copied!" : "Share"}
            </button>
            <button
              type="button"
              onClick={handleRegenerate}
              disabled={regenerating}
              className="rounded-full border border-foreground/20 px-3 py-1.5 text-xs transition hover:border-foreground/50 disabled:opacity-50"
            >
              {regenerating ? "Regenerating…" : "🔄 Regenerate"}
            </button>
          </div>
        ) : null}
```

- [ ] **Step 3: Add the `handleRegenerate` handler, next to the existing `handleShare`**

```ts
  const handleRegenerate = async () => {
    if (!bundleId || regenerating) return;
    setRegenerating(true);
    try {
      const result = await regenerateBundle({
        bundleId,
        rateLimitKey: getOrCreateSessionId(),
      });
      if (result.status === "ok") {
        track("bundle_regenerated", { bundle_id: bundleId });
      }
      // On "rate_limited" or "failed", silently no-op — the button just
      // re-enables below for the user to try again.
    } finally {
      setRegenerating(false);
    }
  };
```

- [ ] **Step 4: Add the per-item "Show me another" button and its handler**

In the items list, inside the buttons row for each item (the `<div className="mt-3 flex flex-wrap gap-2">` block), add a swap button — but only when `bundleId` is present (matching the Save/Share gating, since curated/shared-view bundles that lack a `bundleId` can't be patched):

```tsx
              <div className="mt-3 flex flex-wrap gap-2">
                {item.productUrl ? (
                  <a
                    href={item.productUrl}
                    target="_blank"
                    rel="noopener noreferrer sponsored"
                    onClick={() => onLinkClick?.(item.productMerchant ?? "sovrn", item)}
                    className="rounded-full bg-foreground px-3 py-1.5 text-xs text-background transition hover:opacity-85"
                  >
                    Buy{item.productMerchant ? ` at ${item.productMerchant}` : ""}
                  </a>
                ) : null}
                {links.map((link) => (
                  <a
                    key={link.retailer}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => onLinkClick?.(link.retailer, item)}
                    className="rounded-full border border-foreground/20 px-3 py-1.5 text-xs transition hover:border-foreground/50"
                  >
                    {item.productUrl ? `Or ${link.label}` : link.label}
                  </a>
                ))}
                {bundleId ? (
                  <button
                    type="button"
                    onClick={() => handleSwapItem(bundleId, itemIndex, item.name)}
                    disabled={swappingIndex === itemIndex}
                    className="rounded-full border border-foreground/20 px-3 py-1.5 text-xs opacity-70 transition hover:border-foreground/50 hover:opacity-100 disabled:opacity-40"
                  >
                    {swappingIndex === itemIndex ? "Swapping…" : "🔄 Show me another"}
                  </button>
                ) : null}
              </div>
```

This requires the `.map` over `content.items` to expose the index. Change the map callback signature from:

```ts
        {content.items.map((item) => {
```

to:

```ts
        {content.items.map((item, itemIndex) => {
```

Add the handler next to `handleRegenerate`:

```ts
  const handleSwapItem = async (id: Id<"bundles">, itemIndex: number, itemName: string) => {
    if (swappingIndex !== null) return;
    setSwappingIndex(itemIndex);
    try {
      const result = await swapItem({
        bundleId: id,
        itemIndex,
        rateLimitKey: getOrCreateSessionId(),
      });
      if (result.status === "ok") {
        track("item_swapped", { bundle_id: id, item_name: itemName });
      }
      // On "rate_limited" or "failed", silently no-op — the button re-enables.
    } finally {
      setSwappingIndex(null);
    }
  };
```

- [ ] **Step 5: Typecheck, lint, and build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: all clean.

- [ ] **Step 6: Manual smoke test in the browser**

Run: `npm run dev` (and `npx convex dev` if not already running), visit `http://localhost:3000/quiz`, complete a quiz to reach `/quiz/results`. Click "🔄 Show me another" on one item — confirm the button shows "Swapping…", then the item's name/description/image change after a few seconds. Click "🔄 Regenerate" on a whole bundle card — confirm "Regenerating…", then the theme/rationale/items all change.

- [ ] **Step 7: Commit**

```bash
git add src/components/bundles/bundle-card.tsx
git commit -m "feat(ui): add per-item swap and per-bundle regenerate buttons"
```

---

### Task 5: E2E test (one real Gemini call, chromium-only)

**Files:**
- Modify: `tests/e2e/auth-flow.spec.ts` (from the earlier E2E plan this session, `docs/superpowers/plans/2026-07-20-m5-authenticated-e2e.md`) — if that plan hasn't been executed yet in this session, create `tests/e2e/regenerate.spec.ts` as a new standalone file instead, following the same structure below minus the sign-in portion (regenerate/swap don't require auth — see Global Constraints, no ownership check on `bundles` docs).

**Interfaces:**
- Consumes: `testSupport:seedPopularBundle` (existing).

- [ ] **Step 1: Write the test**

If adding to `tests/e2e/auth-flow.spec.ts`, add a new `test()` inside the existing `test.describe` block, after the profile-creation assertions, reusing the same seeded `bundleIdLine` bundle:

```ts
    // --- Regenerate the bundle we just saved (one real Gemini call) ---
    await page.goto("/my-bundles");
    const regenerateButton = page.getByRole("button", { name: /Regenerate/ });
    await regenerateButton.click();
    await expect(page.getByRole("button", { name: "Regenerating…" })).toBeVisible();
    // Real Gemini call — allow up to 20s, matching quiz-flow.spec.ts's generation timeout.
    await expect(page.getByText("E2E Popular Bundle")).not.toBeVisible({ timeout: 20_000 });
```

If this plan is executed before the E2E auth plan (or that plan was skipped), create the standalone file instead:

```ts
// tests/e2e/regenerate.spec.ts
import { test, expect } from "@playwright/test";
import { execSync } from "node:child_process";

// Real Gemini call — runs once on chromium only, same convention as
// quiz-flow.spec.ts's full-completion test. No auth needed: swapItem/
// regenerateBundle have no ownership check, matching bundles.ts's existing
// trust model (see docs/superpowers/plans/2026-07-20-item-swap-bundle-regenerate.md).
test.describe("bundle regenerate", () => {
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "Real Gemini call — runs once on chromium only to conserve free-tier quota"
  );

  test("regenerating a bundle replaces its theme and items", async ({ page }) => {
    const output = execSync('npx convex run testSupport:seedPopularBundle "{}"', {
      encoding: "utf-8",
    });
    const bundleIdLine = output
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l.length > 0 && !l.toLowerCase().includes("assertion failed"));
    if (!bundleIdLine) {
      throw new Error(`Could not parse a bundle id from convex run output:\n${output}`);
    }

    await page.goto("/popular");
    await expect(page.getByText("E2E Popular Bundle")).toBeVisible();

    const regenerateButton = page.getByRole("button", { name: /Regenerate/ }).first();
    await regenerateButton.click();
    await expect(page.getByRole("button", { name: "Regenerating…" }).first()).toBeVisible();
    await expect(page.getByText("E2E Popular Bundle")).not.toBeVisible({ timeout: 20_000 });
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx playwright test tests/e2e/regenerate.spec.ts --project=chromium` (adjust the path if added to `auth-flow.spec.ts` instead)
Expected: PASS.

- [ ] **Step 3: Run the full E2E suite to confirm no regressions**

Run: `npm run test:e2e`
Expected: all tests pass, including this new one.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/
git commit -m "test(e2e): verify bundle regenerate replaces theme and items"
```

---

### Task 6: Update docs

**Files:**
- Modify: `docs/tasks.md`

- [ ] **Step 1: Move both Backlog items to done**

In the Backlog section, change:

```
- [ ] P1 Single-item swap ("show me another") — needs engine support for regenerating one bundle slot (new prompt variant scoped to a single item + existing bundle context); deferred from M2 results UI sprint
- [ ] P1 Per-bundle regenerate (distinct from whole-quiz "Start over") — same engine dependency as item swap
```

to:

```
- [x] P1 Single-item swap ("show me another") — `buildItemSwapPrompt`/`parseItemResponse` (`src/lib/engine/`), `generateBundles:swapItem` Convex action, `BundleCard` "🔄 Show me another" per-item button. Fires `item_swapped`. Plan: `docs/superpowers/plans/2026-07-20-item-swap-bundle-regenerate.md`
- [x] P1 Per-bundle regenerate (distinct from whole-quiz "Start over") — `buildBundleRegeneratePrompt`/`parseSingleBundleResponse`, `generateBundles:regenerateBundle` Convex action, `BundleCard` "🔄 Regenerate" per-bundle button. Fires `bundle_regenerated`. Same plan as above.
```

Also update the M2 Bundle Results UI section's now-stale line:

```
- [x] P0 Events: item_swapped, bundle_regenerated — event names reserved in `AnalyticsEvent` union; not fired yet since the features themselves are deferred (see Backlog)
```

to:

```
- [x] P0 Events: item_swapped, bundle_regenerated — now firing live, see Backlog section (2026-07-20)
```

- [ ] **Step 2: Commit**

```bash
git add docs/tasks.md
git commit -m "docs: mark item-swap and per-bundle-regenerate complete"
```

---

## Self-Review Notes

- **Spec coverage:** item swap ✅ (Task 3 `swapItem` + Task 4 button), per-bundle regenerate ✅ (Task 3 `regenerateBundle` + Task 4 button), both TDD'd at the pure-engine layer (Task 1), both get a real end-to-end test (Task 5), both fire their already-reserved analytics events (Task 4), docs updated (Task 6).
- **Placeholder scan:** no TBD/TODO; every code block is complete, derived from the actual current file contents read this session (not guessed) — `bundleItemValidator`, `BUNDLE_ITEM_RESPONSE_SCHEMA` field names, `chooseItemMedia` signature, etc. all match what's really in the codebase.
- **Type consistency:** `SwapItemResult`/`RegenerateBundleResult` (Task 3) match what Task 4's UI code checks (`result.status === "ok"`). `enrichItemWithMedia(item: BundleItem, country: string, ebayToken: string | null)` (Task 2) signature matches its two call sites in Task 2's rewritten `enrichBundlesWithMedia` and Task 3's `swapItem`. `parseItemResponse`/`parseSingleBundleResponse` return shapes (`{ok, item}` / `{ok, bundle}`) match how Task 3 destructures them (`parsed.item`, `parsed.bundle`).
- **Note on Task 5 sequencing:** this plan assumes it may run before or after the separate authenticated-E2E plan (`docs/superpowers/plans/2026-07-20-m5-authenticated-e2e.md`) from earlier this session — Task 5's Step 1 branches on which already exists, so either execution order works.
