import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Clerk user id (identity.subject) owns saved bundles. All functions require
// auth — the UI only exposes save to signed-in users (guests get a signup
// upsell), but we enforce it server-side too rather than trusting the client.

export const save = mutation({
  args: { bundleId: v.id("bundles") },
  handler: async (ctx, { bundleId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) throw new Error("Not authenticated");

    const existing = await ctx.db
      .query("savedBundles")
      .withIndex("by_user_bundle", (q) =>
        q.eq("userId", identity.subject).eq("bundleId", bundleId)
      )
      .unique();
    if (existing) return existing._id; // idempotent — already saved

    return await ctx.db.insert("savedBundles", {
      userId: identity.subject,
      bundleId,
      savedAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { bundleId: v.id("bundles") },
  handler: async (ctx, { bundleId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) throw new Error("Not authenticated");

    const existing = await ctx.db
      .query("savedBundles")
      .withIndex("by_user_bundle", (q) =>
        q.eq("userId", identity.subject).eq("bundleId", bundleId)
      )
      .unique();
    if (existing) await ctx.db.delete("savedBundles", existing._id);
    return null;
  },
});

export const isSaved = query({
  args: { bundleId: v.id("bundles") },
  handler: async (ctx, { bundleId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) return false;
    const existing = await ctx.db
      .query("savedBundles")
      .withIndex("by_user_bundle", (q) =>
        q.eq("userId", identity.subject).eq("bundleId", bundleId)
      )
      .unique();
    return existing !== null;
  },
});

export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) return [];

    const saved = await ctx.db
      .query("savedBundles")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .order("desc")
      .collect();

    const bundles = await Promise.all(
      saved.map(async (row) => {
        const bundle = await ctx.db.get("bundles", row.bundleId);
        return bundle ? { ...bundle, savedAt: row.savedAt } : null;
      })
    );
    return bundles.filter((b): b is NonNullable<typeof b> => b !== null);
  },
});
