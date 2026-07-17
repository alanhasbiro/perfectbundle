"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { BundleCard } from "@/components/bundles/bundle-card";
import { track } from "@/lib/analytics";
import type { BundleItemLike } from "@/components/bundles/bundle-card-types";

// Curated bundles aren't tied to a quiz, so there's no known shopper country/
// urgency yet. Defaulting to US/normal is a known simplification — revisit if
// client-side country detection (src/lib/quiz/country.ts) gets threaded through
// browse pages too.
const DEFAULT_COUNTRY = "US";
const DEFAULT_URGENCY = "normal" as const;

export default function TrendingPage() {
  const curated = useQuery(api.curated.listApproved);
  const viewedRef = useRef(false);

  useEffect(() => {
    if (viewedRef.current) return;
    viewedRef.current = true;
    track("trending_viewed");
  }, []);

  const handleLinkClick = (bundleId: string, retailer: string, item: BundleItemLike) => {
    track("curated_bundle_opened", { bundle_id: bundleId, retailer, item_tags: item.tags });
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 px-6 py-10">
      <div>
        <h1 className="text-3xl font-semibold">Trending bundles</h1>
        <p className="mt-2 text-sm opacity-70">
          Crowd-pleasing bundles you can browse without taking the quiz.
        </p>
      </div>
      {curated === undefined ? (
        <p className="opacity-60">Loading…</p>
      ) : (
        curated.map((bundle) => (
          <BundleCard
            key={bundle._id}
            content={bundle}
            country={DEFAULT_COUNTRY}
            urgency={DEFAULT_URGENCY}
            onLinkClick={(retailer, item) => handleLinkClick(bundle._id, retailer, item)}
          />
        ))
      )}
      <Link href="/quiz" className="text-sm underline opacity-70 hover:opacity-100">
        Or take the quiz for a bundle picked just for someone →
      </Link>
    </main>
  );
}
