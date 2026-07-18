// NOTE: keep this file free of React/Next/Convex imports — pure + mobile-reusable.

export interface EngagementCounts {
  linkClicks: number;
  saves: number;
  shares: number;
  views: number;
}

// Popularity weighting is canonical in docs/data-schema.md: a retailer-link
// click is the strongest buy-intent signal, a save/share a medium signal, a
// view the weakest.
export function popularityScore(c: EngagementCounts): number {
  return 3 * c.linkClicks + 2 * c.saves + 2 * c.shares + c.views;
}
