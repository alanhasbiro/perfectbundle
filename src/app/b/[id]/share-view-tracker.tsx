"use client";

import { useEffect, useRef } from "react";
import { track } from "@/lib/analytics";

export function ShareViewTracker({ bundleId }: { bundleId: string }) {
  const firedRef = useRef(false);
  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    track("shared_bundle_viewed", { bundle_id: bundleId });
  }, [bundleId]);
  return null;
}
