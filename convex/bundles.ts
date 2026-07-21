import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

const bundleItemValidator = v.object({
  name: v.string(),
  description: v.string(),
  why: v.string(),
  estPriceRange: v.string(),
  searchQuery: v.string(),
  tags: v.array(v.string()),
  imageUrl: v.optional(v.string()),
  imageIsRepresentative: v.optional(v.boolean()),
  imageCreditName: v.optional(v.string()),
  imageCreditUrl: v.optional(v.string()),
  imageSource: v.optional(v.string()),
  productUrl: v.optional(v.string()),
  productPrice: v.optional(v.string()),
  productMerchant: v.optional(v.string()),
});

const bundleContentValidator = v.object({
  theme: v.string(),
  rationale: v.string(),
  estTotal: v.string(),
  items: v.array(bundleItemValidator),
});

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

export const storeGenerated = internalMutation({
  args: {
    quizHash: v.string(),
    quiz: quizValidator,
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

// Client-callable — the results UI (next sprint) fetches generated bundles by
// the IDs returned from generateBundles:generate.
export const getByIds = query({
  args: { ids: v.array(v.id("bundles")) },
  handler: async (ctx, { ids }) => {
    const docs = await Promise.all(ids.map((id) => ctx.db.get("bundles", id)));
    return docs.filter((d): d is NonNullable<typeof d> => d !== null);
  },
});

export const makePublic = mutation({
  args: { id: v.id("bundles") },
  handler: async (ctx, { id }) => {
    // No ownership check: there's no auth system yet (M4). Anyone who generated
    // a bundle in their own session already has its id and can choose to share
    // it — this is the same trust model as "anyone with the link" doc sharing.
    await ctx.db.patch("bundles", id, { isPublic: true });
    return null;
  },
});

export const getPublic = query({
  args: { id: v.id("bundles") },
  handler: async (ctx, { id }) => {
    const doc = await ctx.db.get("bundles", id);
    if (!doc || !doc.isPublic) return null;
    return doc;
  },
});
