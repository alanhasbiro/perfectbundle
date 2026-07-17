import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const bundleItem = v.object({
  name: v.string(),
  description: v.string(),
  why: v.string(),
  estPriceRange: v.string(),
  searchQuery: v.string(),
  tags: v.array(v.string()),
});

export default defineSchema({
  bundles: defineTable({
    createdAt: v.number(),
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
    theme: v.string(),
    rationale: v.string(),
    estTotal: v.string(),
    items: v.array(bundleItem),
    isPublic: v.boolean(),
    ownerId: v.optional(v.string()),
  })
    .index("by_quizHash", ["quizHash"])
    .index("by_ownerId", ["ownerId"]),

  curatedBundles: defineTable({
    title: v.string(),
    theme: v.string(),
    rationale: v.string(),
    estTotal: v.string(),
    items: v.array(bundleItem),
    season: v.optional(v.string()),
    priceBand: v.string(),
    approved: v.boolean(),
    sortWeight: v.number(),
  }),

  generationCache: defineTable({
    quizHash: v.string(),
    bundleIds: v.array(v.id("bundles")),
    createdAt: v.number(),
    ttl: v.number(),
  }).index("by_quizHash", ["quizHash"]),

  savedBundles: defineTable({
    userId: v.string(),
    bundleId: v.id("bundles"),
    savedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_bundle", ["userId", "bundleId"]),

  recipientProfiles: defineTable({
    userId: v.string(),
    name: v.string(),
    relationship: v.string(),
    ageBand: v.string(),
    gender: v.optional(v.string()),
    interests: v.array(v.string()),
    notes: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_user", ["userId"]),

  engagementCounters: defineTable({
    bundleId: v.string(),
    kind: v.union(v.literal("curated"), v.literal("generated")),
    linkClicks: v.number(),
    saves: v.number(),
    shares: v.number(),
    views: v.number(),
  }).index("by_bundleId", ["bundleId"]),

  rateLimits: defineTable({
    key: v.string(),
    windowStart: v.number(),
    count: v.number(),
  }).index("by_key", ["key"]),
});
