import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Recipient profiles let a signed-in user save the people they buy for, so
// they can regenerate bundles without re-answering the "who is it for" fields.
// All functions require auth and enforce ownership (identity.subject === userId).

const profileFields = {
  name: v.string(),
  relationship: v.string(),
  ageBand: v.string(),
  gender: v.optional(v.string()),
  interests: v.array(v.string()),
  notes: v.optional(v.string()),
};

export const create = mutation({
  args: profileFields,
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) throw new Error("Not authenticated");
    return await ctx.db.insert("recipientProfiles", {
      userId: identity.subject,
      createdAt: Date.now(),
      ...args,
    });
  },
});

export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) return [];
    return await ctx.db
      .query("recipientProfiles")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .order("desc")
      .collect();
  },
});

export const update = mutation({
  args: { id: v.id("recipientProfiles"), ...profileFields },
  handler: async (ctx, { id, ...fields }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) throw new Error("Not authenticated");
    const existing = await ctx.db.get("recipientProfiles", id);
    if (!existing || existing.userId !== identity.subject) {
      throw new Error("Profile not found");
    }
    await ctx.db.patch("recipientProfiles", id, fields);
    return null;
  },
});

export const remove = mutation({
  args: { id: v.id("recipientProfiles") },
  handler: async (ctx, { id }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) throw new Error("Not authenticated");
    const existing = await ctx.db.get("recipientProfiles", id);
    if (!existing || existing.userId !== identity.subject) {
      throw new Error("Profile not found");
    }
    await ctx.db.delete("recipientProfiles", id);
    return null;
  },
});
