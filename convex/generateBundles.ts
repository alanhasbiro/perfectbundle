import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { buildBundlePrompt } from "../src/lib/engine/prompt";
import { parseBundleResponse } from "../src/lib/engine/parse-response";
import { buildStockImageQuery, parsePexelsResponse, chooseItemMedia } from "../src/lib/engine/media";
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

    const enrichedBundles = await enrichBundlesWithMedia(parsed.bundles);

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
