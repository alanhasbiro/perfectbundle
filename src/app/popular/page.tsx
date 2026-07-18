"use client";

import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { BundleCard } from "@/components/bundles/bundle-card";
import { track } from "@/lib/analytics";
import type { BundleItemLike } from "@/components/bundles/bundle-card-types";

export default function PopularPage() {
  const popular = useQuery(api.engagement.listPopular, {});
  const record = useMutation(api.engagement.record);

  const handleLinkClick = (bundleId: string, retailer: string, item: BundleItemLike) => {
    track("retailer_link_clicked", { retailer, bundle_id: bundleId, item_tags: item.tags });
    void record({ bundleId, kind: "generated", type: "linkClicks" });
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 px-6 py-10">
      <div>
        <h1 className="text-3xl font-semibold">Popular bundles</h1>
        <p className="mt-2 text-sm opacity-70">
          Real bundles people made and shared, ranked by what others clicked, saved, and shared.
        </p>
      </div>
      {popular === undefined ? (
        <p className="opacity-60">Loading…</p>
      ) : popular.length === 0 ? (
        <p className="rounded-xl border border-foreground/15 p-4 text-sm opacity-70">
          No popular bundles yet — take the quiz and share yours to get things started.
        </p>
      ) : (
        popular.map((bundle) => (
          <BundleCard
            key={bundle._id}
            content={bundle}
            country={bundle.quiz.country}
            urgency={bundle.quiz.urgency}
            bundleId={bundle._id}
            onLinkClick={(retailer, item) => handleLinkClick(bundle._id, retailer, item)}
          />
        ))
      )}
      <div className="flex flex-wrap gap-4 text-sm">
        <Link href="/trending" className="underline opacity-70 hover:opacity-100">
          Browse trending bundles →
        </Link>
        <Link href="/quiz" className="underline opacity-70 hover:opacity-100">
          Take the quiz →
        </Link>
      </div>
    </main>
  );
}
