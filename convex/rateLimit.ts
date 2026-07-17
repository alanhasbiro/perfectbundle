import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

// Simple fixed-window rate limit. Returns true if the request is allowed
// (and consumes one unit of quota), false if the caller is over the limit.
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
        await ctx.db.patch("rateLimits", existing._id, { windowStart: now, count: 1 });
      } else {
        await ctx.db.insert("rateLimits", { key, windowStart: now, count: 1 });
      }
      return true;
    }

    if (existing.count >= max) return false;

    await ctx.db.patch("rateLimits", existing._id, { count: existing.count + 1 });
    return true;
  },
});
