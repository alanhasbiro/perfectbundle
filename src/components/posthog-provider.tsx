"use client";

import { useEffect } from "react";
import posthog from "posthog-js";

let initialized = false;

// Autocaptures $pageview/$pageleave and utm_* params — feeds the funnel and
// channel-attribution views in docs/dashboard-spec.md. Without this init call
// posthog-js never connects, so track() in src/lib/analytics.ts was a silent
// no-op in production even with a key configured.
export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (!key || initialized) return;
    posthog.init(key, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
      capture_pageview: true,
      capture_pageleave: true,
    });
    initialized = true;
  }, []);

  return <>{children}</>;
}
