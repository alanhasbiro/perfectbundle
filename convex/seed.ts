import { internalMutation } from "./_generated/server";
import { seedCuratedBundles } from "./seedData";

export const seedCurated = internalMutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("curatedBundles").first();
    if (existing !== null) return "already seeded — skipping";
    for (const bundle of seedCuratedBundles) {
      await ctx.db.insert("curatedBundles", bundle);
    }
    return `seeded ${seedCuratedBundles.length} curated bundles`;
  },
});

// One-time top-up for the 2026-07-20 content batch (5 -> 23 curated bundles):
// seedCurated above only runs once ever (skips if anything already exists), so
// this inserts whichever entries in seedCuratedBundles aren't in the table yet
// (matched by title), safe to re-run without duplicating the original 5.
export const seedAdditionalCurated = internalMutation({
  args: {},
  handler: async (ctx) => {
    const existingTitles = new Set(
      (await ctx.db.query("curatedBundles").collect()).map((b) => b.title)
    );
    let count = 0;
    for (const bundle of seedCuratedBundles) {
      if (existingTitles.has(bundle.title)) continue;
      await ctx.db.insert("curatedBundles", bundle);
      count++;
    }
    return `seeded ${count} additional curated bundles`;
  },
});
