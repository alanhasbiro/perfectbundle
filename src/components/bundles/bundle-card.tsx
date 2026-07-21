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
  // Show the FTC/affiliate disclosure only when this card actually contains
  // affiliate ("Buy at …") links — i.e. once Sovrn has populated productUrl.
  const hasAffiliateLinks = content.items.some((item) => item.productUrl);

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
    <article
      data-testid={bundleId ? `bundle-card-${bundleId}` : undefined}
      className="flex flex-col gap-4 rounded-2xl border border-foreground/15 p-6"
    >
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
              <div className="flex gap-3">
                {item.imageUrl ? (
                  <div className="shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.imageUrl}
                      alt={item.name}
                      loading="lazy"
                      className="h-24 w-24 rounded-lg object-cover"
                    />
                  </div>
                ) : null}
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{item.name}</p>
                  <p className="mt-1 text-sm opacity-70">{item.description}</p>
                  <p className="mt-1 text-sm italic opacity-60">{item.why}</p>
                </div>
              </div>
              {item.imageIsRepresentative ? (
                <p className="mt-2 text-xs opacity-50">
                  Representative image
                  {item.imageCreditName ? (
                    <>
                      {" · Photo by "}
                      {item.imageCreditUrl ? (
                        <a
                          href={item.imageCreditUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline hover:opacity-80"
                        >
                          {item.imageCreditName}
                        </a>
                      ) : (
                        item.imageCreditName
                      )}
                      {item.imageSource === "unsplash"
                        ? " on Unsplash"
                        : item.imageSource === "pexels"
                          ? " on Pexels"
                          : ""}
                    </>
                  ) : null}
                </p>
              ) : null}
              <p className="mt-2 text-sm font-medium">
                {item.productPrice ? item.productPrice : item.estPriceRange}
                {item.productPrice ? (
                  <span className="ml-1 text-xs font-normal opacity-50">at {item.productMerchant}</span>
                ) : null}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {item.productUrl ? (
                  <a
                    href={item.productUrl}
                    target="_blank"
                    rel="noopener noreferrer sponsored"
                    onClick={() => onLinkClick?.(item.productMerchant ?? "sovrn", item)}
                    className="rounded-full bg-foreground px-3 py-1.5 text-xs text-background transition hover:opacity-85"
                  >
                    Buy{item.productMerchant ? ` at ${item.productMerchant}` : ""}
                  </a>
                ) : null}
                {links.map((link) => (
                  <a
                    key={link.retailer}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => onLinkClick?.(link.retailer, item)}
                    className="rounded-full border border-foreground/20 px-3 py-1.5 text-xs transition hover:border-foreground/50"
                  >
                    {item.productUrl ? `Or ${link.label}` : link.label}
                  </a>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
      {hasAffiliateLinks ? (
        <p className="text-xs opacity-50">
          Some “Buy” links are affiliate links — we may earn a small commission at no extra cost to you.
        </p>
      ) : null}
    </article>
  );
}
