import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { buildBundlePrompt } from "../src/lib/engine/prompt";
import { parseBundleResponse } from "../src/lib/engine/parse-response";
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
import type { BundleContent } from "../src/lib/engine/schemas";
import { hashQuizAnswers } from "../src/lib/quiz/hash";
import type { QuizAnswers } from "../src/lib/quiz/types";

// Gemini free-tier Flash model. "gemini-flash-latest" is Google's rolling alias
// for the current-generation Flash model (verified live 2026-07-17, resolved to
// gemini-3.5-flash) — this stays current without code changes as Google upgrades
// it. If generations start failing with a 404 "model not found", check
// https://ai.google.dev/gemini-api/docs/models and pin an explicit version here.
export const GEMINI_MODEL = "gemini-flash-latest";

const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

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

// fetch() is available in Convex's default runtime — no "use node" needed here,
// and this file must not export queries/mutations alongside a node runtime anyway.
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

// Unsplash is the primary stock-image source; Pexels is the fallback. Running
// both doubles our free-tier headroom and covers gaps where one has no match.
// Each returns null on any failure / missing key — media is best-effort and must
// never throw.
async function fetchUnsplashImage(query: string): Promise<StockImage | null> {
  const apiKey = process.env.UNSPLASH_ACCESS_KEY;
  if (!apiKey) return null;
  try {
    const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=1`;
    const res = await fetch(url, { headers: { Authorization: `Client-ID ${apiKey}` } });
    if (!res.ok) return null;
    return parseUnsplashResponse(await res.json());
  } catch {
    return null;
  }
}

async function fetchPexelsImage(query: string): Promise<StockImage | null> {
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

async function fetchStockImage(query: string): Promise<StockImage | null> {
  return (await fetchUnsplashImage(query)) ?? (await fetchPexelsImage(query));
}

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

// Attaches best-effort media to every item of every bundle: a real eBay
// product (photo + direct link + price) when available, else a representative
// stock image. Any per-provider failure yields no media for that item; the
// overall generation is never blocked.
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

// Client-callable entry point for the results UI (next sprint). Everything lives
// in one `action` (rather than an internalAction + wrapper) because it doesn't
// need to cross runtimes — fetch() works in the default runtime — and per the
// Convex guidelines, action-to-action calls should be avoided when a plain
// helper function (this one) will do.
export const generate = action({
  args: {
    quiz: quizValidator,
    rateLimitKey: v.string(),
    profileId: v.optional(v.id("recipientProfiles")),
  },
  handler: async (ctx, args): Promise<GenerateResult> => {
    const quiz = args.quiz as QuizAnswers;

    const allowed: boolean = await ctx.runMutation(internal.rateLimit.checkAndConsume, {
      key: args.rateLimitKey,
      max: RATE_LIMIT_MAX,
      windowMs: RATE_LIMIT_WINDOW_MS,
    });
    if (!allowed) return { status: "rate_limited" };

    // If a profileId was supplied, verify the caller actually owns that
    // profile before trusting (or writing to) its past-item memory. A
    // mismatch or missing identity silently falls back to no-profile
    // behaviour rather than failing the whole generation — dedup memory is a
    // nice-to-have, not a security boundary for the bundle itself.
    let verifiedProfileId: Id<"recipientProfiles"> | null = null;
    let pastItemNames: string[] = [];
    if (args.profileId) {
      const identity = await ctx.auth.getUserIdentity();
      if (identity) {
        const profile = await ctx.runQuery(internal.recipientProfiles.getByIdInternal, {
          id: args.profileId,
        });
        if (profile && profile.userId === identity.subject) {
          verifiedProfileId = args.profileId;
          pastItemNames = profile.pastItemNames ?? [];
        }
      }
    }

    const quizHash = hashQuizAnswers(quiz);
    // Fold the profile id into the cache key so a cache hit can never return
    // bundles generated (and thus dedup-checked) for a different profile, or
    // skip a live profile's dedup exclusion.
    const cacheKey = verifiedProfileId ? `${quizHash}:${verifiedProfileId}` : quizHash;

    const cached = await ctx.runQuery(internal.generationCache.getFresh, {
      quizHash: cacheKey,
      maxAgeMs: CACHE_TTL_MS,
    });
    if (cached) return { status: "ok", bundleIds: cached.bundleIds, cacheHit: true };

    const prompt = buildBundlePrompt(quiz, pastItemNames);

    let raw = await callGemini(prompt);
    let parsed = raw
      ? parseBundleResponse(raw)
      : ({ ok: false, error: "No response from Gemini" } as const);

    if (!parsed.ok) {
      // One retry on invalid/unparseable JSON, per docs/prd.md F2.
      raw = await callGemini(prompt);
      parsed = raw
        ? parseBundleResponse(raw)
        : ({ ok: false, error: "No response from Gemini (retry)" } as const);
    }

    if (!parsed.ok) {
      return { status: "failed", reason: parsed.error };
    }

    const enrichedBundles = await enrichBundlesWithMedia(parsed.bundles, quiz.country);

    const bundleIds: Id<"bundles">[] = await ctx.runMutation(internal.bundles.storeGenerated, {
      quizHash,
      quiz,
      bundles: enrichedBundles,
    });

    await ctx.runMutation(internal.generationCache.store, {
      quizHash: cacheKey,
      bundleIds,
      ttl: CACHE_TTL_MS,
    });

    if (verifiedProfileId) {
      const newItemNames = parsed.bundles.flatMap((b) => b.items.map((item) => item.name));
      await ctx.runMutation(internal.recipientProfiles.appendPastItemsInternal, {
        id: verifiedProfileId,
        itemNames: newItemNames,
      });
    }

    return { status: "ok", bundleIds, cacheHit: false };
  },
});
