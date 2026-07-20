# dashboard-spec.md - PerfectBundle Proof Dashboard

Built in **PostHog (free tier)** — no custom dashboard code in MVP. Purpose: prove the app works, weekly.

> **Implemented 2026-07-20** as "PerfectBundle Proof Dashboard" (pinned in PostHog), built via the PostHog REST API with a scoped personal API key rather than by hand. Covers every section below except §6 Revenue (stays manual/P2 by design) and the Alerts section (optional, not set up). The "p90 latency" line under §4 was dropped — `bundles_generated` never actually captured a latency property (only `cache_hit`/`budget_band`), so add that property to the event first if you want the tile. See `docs/checkpoint.md` "3. Analytics" for the full build log.

## 1. Headline Metrics (top row, weekly, vs previous week)
| Tile | Definition | Target |
|------|------------|--------|
| Bundles generated | count of `bundles_generated` | 100+/wk by day 90 |
| Quiz completion % | `quiz_completed` / `quiz_started` | ≥60% |
| Buy-intent CTR | sessions with `retailer_link_clicked` / sessions with `bundles_generated` | ≥25% |
| Shares | count of `bundle_shared` | ≥5% of bundles |

## 2. Core Funnel (PostHog funnel insight)
`page_view → quiz_started → quiz_completed → bundles_generated → retailer_link_clicked`
- Breakdown by device and by utm_source. Watch: biggest drop-off stage each week.

## 3. Channel Attribution
- Bar: sessions and quiz_starts by `utm_source` (organic / social / share / direct)
- `utm_source=share` isolates the viral loop; `shared_bundle_viewed` → quiz_started conversion is the loop health metric.

## 4. Time-Series Trends
- Weekly lines: all 4 headline metrics, 12-week window
- Engine health: `bundles_generated` cache_hit rate; `bundle_generation_failed` count; p90 latency (from event property)

## 5. Retention view (after M4)
- `signup`, `bundle_saved`, `profile_created`, `reminder_set` weekly counts
- Reminder email funnel: `reminder_email_sent → reminder_email_clicked` (target CTR ≥20%)

## 6. Revenue view (P2, manual)
Affiliate commissions live in network dashboards; monthly numbers imported to Convex `affiliateRevenue` and reviewed alongside click counts (est. earnings-per-click by retailer).

## Alerts (free-tier friendly)
- Gemini quota usage >80% of daily cap → log + owner email (Convex cron check)
- `bundle_generation_failed` spike (>10% of attempts in a day)
- UptimeRobot: production URL down
