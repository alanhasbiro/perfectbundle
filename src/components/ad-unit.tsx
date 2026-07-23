"use client";

import { useEffect, useRef } from "react";

declare global {
  interface Window {
    adsbygoogle: unknown[];
  }
}

export function AdUnit({
  slot,
  format = "auto",
  layoutKey,
  fullWidthResponsive,
}: {
  slot: string;
  format?: string;
  layoutKey?: string;
  fullWidthResponsive?: boolean;
}) {
  const pushedRef = useRef(false);

  useEffect(() => {
    if (pushedRef.current) return; // StrictMode double-invoke guard
    pushedRef.current = true;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      // AdSense script blocked or not yet loaded — non-fatal
    }
  }, []);

  return (
    <ins
      className="adsbygoogle"
      style={{ display: "block" }}
      data-ad-client="ca-pub-9391534437442090"
      data-ad-slot={slot}
      data-ad-format={format}
      data-ad-layout-key={layoutKey}
      data-full-width-responsive={fullWidthResponsive ? "true" : undefined}
    />
  );
}
