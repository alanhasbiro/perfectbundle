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
