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
      await ctx.db.patch("generationCache", existing._id, doc);
    } else {
      await ctx.db.insert("generationCache", doc);
    }
  },
});
