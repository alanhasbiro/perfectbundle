# data-schema.md - PerfectBundle (Convex)

Convex schema (TypeScript validators). Phase noted per table. Fields marked `?` optional.

## bundles (M2)
Generated bundles, persisted on share/save.
```
{
  createdAt: number,
  quizHash: string,            // normalized quiz fingerprint
  quiz: {                      // denormalized inputs for regeneration
    occasion: string, ageBand: string, gender?: string, relationship: string,
    interests: string[], freeText?: string, budget: number, currency: string,
    urgency: "fast" | "normal" | "no_rush", exclusions: string[], country: string
  },
  theme: string, rationale: string, estTotal: string,
  items: [{
    name: string, description: string, why: string,
    estPriceRange: string, searchQuery: string, tags: string[]
  }],
  isPublic: boolean,           // true once shared (/b/<id>)
  ownerId?: string             // Clerk user id once saved (M4)
}
```
Indexes: by_quizHash, by_ownerId.

## curatedBundles (M2)
Same bundle shape minus quiz, plus: `title, season?: string, priceBand: string, approved: boolean, sortWeight: number`.

## generationCache (M2)
`{ quizHash: string, bundleIds: Id<bundles>[], createdAt: number, ttl: number }` — index by_quizHash.

## engagementCounters (M3)
`{ bundleId: Id<bundles> | Id<curatedBundles>, kind: "curated" | "generated", linkClicks: number, saves: number, shares: number, views: number }` — index by_bundleId. Popularity score = 3·linkClicks + 2·saves + 2·shares + views (tunable).

## rateLimits (M2)
`{ key: string /* ip or userId */, windowStart: number, count: number }` — index by_key.

## users (M4)
Clerk-synced: `{ clerkId: string, email: string, country?: string, createdAt: number }` — index by_clerkId.

## recipientProfiles (M4)
`{ ownerId: string, name: string, ageBand: string, gender?: string, relationship: string, interests: string[], notes?: string, pastItemNames: string[] /* dedup memory */ }` — index by_ownerId.

## reminders (M4)
`{ ownerId: string, profileId: Id<recipientProfiles>, label: string /* birthday etc */, month: number, day: number, lastSentYear?: number, stage?: "t14" | "t3" }` — indexes by_ownerId, by_month_day (cron scan).

## affiliateRevenue (P2, backlog)
`{ month: string, retailer: string, clicks: number, conversions?: number, commission: number, currency: string }` — manual monthly import from network dashboards.

## Analytics events
Event names/properties are canonical in `docs/prd.md` §2.3 and §4. PostHog is the event store; Convex `engagementCounters` mirror only what ranking needs (must work if PostHog is unavailable).
