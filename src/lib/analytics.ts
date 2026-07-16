import posthog from "posthog-js";

// Event names are canonical in docs/prd.md §2.3 — never invent variants.
export type AnalyticsEvent =
  | "quiz_started"
  | "quiz_step_completed"
  | "quiz_completed"
  | "bundles_generated"
  | "bundle_generation_failed"
  | "retailer_link_clicked"
  | "item_swapped"
  | "bundle_regenerated"
  | "bundle_saved"
  | "bundle_shared"
  | "shared_bundle_viewed"
  | "trending_viewed"
  | "curated_bundle_opened";

export function track(event: AnalyticsEvent, properties?: Record<string, unknown>): void {
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return; // no-op without key
  posthog.capture(event, properties);
}
