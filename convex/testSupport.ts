// TEST-ONLY: used by the Playwright E2E suite (tests/e2e/share.spec.ts) to seed
// a real public bundle without spending Gemini quota or depending on a full
// quiz->share click-through. Not gated behind auth since there is no auth
// system yet (same trust model as bundles:makePublic). If this project ever
// deploys with real users before an admin/auth layer exists, delete this file
// or gate it behind an environment check before launch — tracked in
// docs/tasks.md Milestone 6 backlog.
import { mutation } from "./_generated/server";

export const seedPublicBundle = mutation({
  args: {},
  handler: async (ctx) => {
    const id = await ctx.db.insert("bundles", {
      createdAt: Date.now(),
      quizHash: "e2e-test-fixture",
      quiz: {
        occasion: "Birthday",
        ageBand: "25-34",
        relationship: "Friend",
        interests: ["Testing"],
        budget: 50,
        currency: "USD",
        urgency: "normal",
        exclusions: [],
        country: "US",
      },
      theme: "E2E Test Bundle",
      rationale: "Seeded directly for Playwright share-page tests.",
      estTotal: "$40-50",
      items: [
        {
          name: "Test Item One",
          description: "A test item.",
          why: "For testing.",
          estPriceRange: "$10-15",
          searchQuery: "test item one",
          tags: ["test"],
        },
        {
          name: "Test Item Two",
          description: "A test item.",
          why: "For testing.",
          estPriceRange: "$15-20",
          searchQuery: "test item two",
          tags: ["test"],
        },
        {
          name: "Test Item Three",
          description: "A test item.",
          why: "For testing.",
          estPriceRange: "$10-15",
          searchQuery: "test item three",
          tags: ["test"],
        },
      ],
      isPublic: true,
    });
    return id;
  },
});

// TEST-ONLY: seeds a public generated bundle plus an engagementCounters row so
// the /popular page (api.engagement.listPopular) has deterministic content in
// Playwright. Same trust caveat as seedPublicBundle above.
export const seedPopularBundle = mutation({
  args: {},
  handler: async (ctx) => {
    const id = await ctx.db.insert("bundles", {
      createdAt: Date.now(),
      quizHash: "e2e-popular-fixture",
      quiz: {
        occasion: "Birthday",
        ageBand: "25-34",
        relationship: "Friend",
        interests: ["Testing"],
        budget: 50,
        currency: "USD",
        urgency: "normal",
        exclusions: [],
        country: "US",
      },
      theme: "E2E Popular Bundle",
      rationale: "Seeded directly for Playwright popular-page tests.",
      estTotal: "$40-50",
      items: [
        {
          name: "Popular Item One",
          description: "A test item.",
          why: "For testing.",
          estPriceRange: "$10-15",
          searchQuery: "popular item one",
          tags: ["test"],
        },
        {
          name: "Popular Item Two",
          description: "A test item.",
          why: "For testing.",
          estPriceRange: "$15-20",
          searchQuery: "popular item two",
          tags: ["test"],
        },
        {
          name: "Popular Item Three",
          description: "A test item.",
          why: "For testing.",
          estPriceRange: "$10-15",
          searchQuery: "popular item three",
          tags: ["test"],
        },
      ],
      isPublic: true,
    });
    await ctx.db.insert("engagementCounters", {
      bundleId: id,
      kind: "generated",
      linkClicks: 5,
      saves: 2,
      shares: 1,
      views: 10,
    });
    return id;
  },
});
