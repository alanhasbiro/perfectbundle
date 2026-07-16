import { query } from "./_generated/server";

export const listApproved = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("curatedBundles").collect();
    return all
      .filter((b) => b.approved)
      .sort((a, b) => b.sortWeight - a.sortWeight);
  },
});
