import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { popularityScore } from "../src/lib/bundles/popularity";

const counterType = v.union(
  v.literal("linkClicks"),
  v.literal("saves"),
  v.literal("shares"),
  v.literal("views")
);

// Client-callable, unauthenticated (same trust model as bundles.makePublic).
// Upserts the per-bundle counter row and increments one field. Fire-and-forget
// from the UI — a failure here must never block the user action that triggered
// it, so callers do not await/handle the result.
export const record = mutation({
  args: {
    bundleId: v.string(),
    kind: v.union(v.literal("curated"), v.literal("generated")),
    type: counterType,
  },
  handler: async (ctx, { bundleId, kind, type }) => {
    const existing = await ctx.db
      .query("engagementCounters")
      .withIndex("by_bundleId", (q) => q.eq("bundleId", bundleId))
      .unique();
    if (existing) {
      await ctx.db.patch("engagementCounters", existing._id, {
        [type]: existing[type] + 1,
      });
    } else {
      await ctx.db.insert("engagementCounters", {
        bundleId,
        kind,
        linkClicks: 0,
        saves: 0,
        shares: 0,
        views: 0,
        [type]: 1,
      });
    }
    return null;
  },
});

// Ranks publicly-shared user-generated bundles by engagement score. Curated
// bundles are excluded — they live on /trending, ranked editorially by
// sortWeight. Reads all counter rows and joins per-bundle: fine at MVP scale;
// revisit with an index/pagination if the counter table grows large.
export const listPopular = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const counters = await ctx.db.query("engagementCounters").collect();
    type Ranked = Doc<"bundles"> & { score: number };
    const scored: Ranked[] = [];
    for (const counter of counters) {
      if (counter.kind !== "generated") continue;
      const bundle = await ctx.db.get("bundles", counter.bundleId as Id<"bundles">);
      if (!bundle || !bundle.isPublic) continue;
      scored.push({ ...bundle, score: popularityScore(counter) });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit ?? 20);
  },
});
