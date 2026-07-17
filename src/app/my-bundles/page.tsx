"use client";

import Link from "next/link";
import { useAuth, SignInButton } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { BundleCard } from "@/components/bundles/bundle-card";
import type { BundleItemLike } from "@/components/bundles/bundle-card-types";
import { track } from "@/lib/analytics";

export default function MyBundlesPage() {
  const { isLoaded, isSignedIn } = useAuth();
  const saved = useQuery(api.savedBundles.listMine, isSignedIn ? {} : "skip");

  if (!isLoaded) return null;

  if (!isSignedIn) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="text-2xl font-semibold">Your saved bundles</h1>
        <p className="opacity-70">Sign in to see the bundles you&apos;ve saved.</p>
        <SignInButton mode="modal">
          <button className="rounded-full bg-foreground px-6 py-2.5 text-background transition hover:opacity-85">
            Sign in
          </button>
        </SignInButton>
      </main>
    );
  }

  const handleLinkClick = (bundleId: string, retailer: string, item: BundleItemLike) => {
    track("retailer_link_clicked", { retailer, bundle_id: bundleId, item_tags: item.tags });
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 px-6 py-10">
      <h1 className="text-3xl font-semibold">Your saved bundles 🔖</h1>
      {saved === undefined ? (
        <p className="opacity-60">Loading…</p>
      ) : saved.length === 0 ? (
        <div className="flex flex-col items-start gap-4">
          <p className="opacity-70">You haven&apos;t saved any bundles yet.</p>
          <Link
            href="/quiz"
            className="rounded-full bg-foreground px-6 py-2.5 text-background transition hover:opacity-85"
          >
            Take the quiz
          </Link>
        </div>
      ) : (
        saved.map((bundle) => (
          <BundleCard
            key={bundle._id}
            content={bundle}
            budget={bundle.quiz.budget}
            country={bundle.quiz.country}
            urgency={bundle.quiz.urgency}
            bundleId={bundle._id}
            onLinkClick={(retailer, item) => handleLinkClick(bundle._id, retailer, item)}
          />
        ))
      )}
    </main>
  );
}
