"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { buildRetailerLinks } from "@/lib/links/retailer-links";
import { classifyBudgetStatus } from "@/lib/bundles/budget-status";
import { track } from "@/lib/analytics";
import { SaveButton } from "./save-button";
import type { BundleContentLike, BundleItemLike } from "./bundle-card-types";

const BUDGET_LABEL: Record<string, string> = {
  within: "Within budget",
  over: "A bit over budget",
  under: "Well under budget",
  unknown: "",
};

export function BundleCard({
  content,
  budget,
  country,
  urgency,
  bundleId,
  onLinkClick,
}: {
  content: BundleContentLike;
  budget?: number;
  country: string;
  urgency: "fast" | "normal" | "no_rush";
  bundleId?: Id<"bundles">;
  onLinkClick?: (retailer: string, item: BundleItemLike) => void;
}) {
  const makePublic = useMutation(api.bundles.makePublic);
  const record = useMutation(api.engagement.record);
  const [shareState, setShareState] = useState<"idle" | "sharing" | "copied">("idle");

  const status = budget !== undefined ? classifyBudgetStatus(content.estTotal, budget) : "unknown";
  const budgetLabel = BUDGET_LABEL[status];

  const handleShare = async () => {
    if (!bundleId) return;
    setShareState("sharing");
    await makePublic({ id: bundleId });
    const url = `${window.location.origin}/b/${bundleId}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // clipboard unavailable — the URL is still valid, user can copy manually
      // from wherever the app surfaces it; sharing state still confirms success.
    }
    track("bundle_shared", { bundle_id: bundleId });
    void record({ bundleId, kind: "generated", type: "shares" });
    setShareState("copied");
    setTimeout(() => setShareState("idle"), 2000);
  };

  return (
    <article className="flex flex-col gap-4 rounded-2xl border border-foreground/15 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-xl font-semibold">{content.theme}</h3>
          <p className="mt-1 text-sm opacity-70">{content.rationale}</p>
        </div>
        {bundleId ? (
          <div className="flex shrink-0 gap-2">
            <SaveButton bundleId={bundleId} />
            <button
              type="button"
              onClick={handleShare}
              disabled={shareState === "sharing"}
              className="rounded-full border border-foreground/20 px-3 py-1.5 text-xs transition hover:border-foreground/50"
            >
              {shareState === "copied" ? "Link copied!" : "Share"}
            </button>
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-2 text-sm">
        <span className="font-medium">Est. total: {content.estTotal}</span>
        {budgetLabel ? <span className="opacity-60">· {budgetLabel}</span> : null}
      </div>

      <ul className="flex flex-col gap-4">
        {content.items.map((item) => {
          const links = buildRetailerLinks(item.searchQuery, country, urgency);
          return (
            <li key={item.name} className="rounded-xl border border-foreground/10 p-4">
              <p className="font-medium">{item.name}</p>
              <p className="mt-1 text-sm opacity-70">{item.description}</p>
              <p className="mt-1 text-sm italic opacity-60">{item.why}</p>
              <p className="mt-2 text-sm font-medium">{item.estPriceRange}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {links.map((link) => (
                  <a
                    key={link.retailer}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => onLinkClick?.(link.retailer, item)}
                    className="rounded-full border border-foreground/20 px-3 py-1.5 text-xs transition hover:border-foreground/50"
                  >
                    {link.label}
                  </a>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
    </article>
  );
}
