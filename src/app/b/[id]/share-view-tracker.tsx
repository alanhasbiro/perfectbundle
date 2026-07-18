"use client";

import { useEffect, useRef } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { track } from "@/lib/analytics";

export function ShareViewTracker({ bundleId }: { bundleId: string }) {
  const firedRef = useRef(false);
  const record = useMutation(api.engagement.record);
  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    track("shared_bundle_viewed", { bundle_id: bundleId });
    void record({ bundleId, kind: "generated", type: "views" });
    // record is a stable Convex mutation ref; bundleId is the only real input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bundleId]);
  return null;
}
