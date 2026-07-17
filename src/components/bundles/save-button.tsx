"use client";

import { useAuth, SignInButton } from "@clerk/nextjs";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { track } from "@/lib/analytics";

const BASE_CLASS =
  "rounded-full border px-3 py-1.5 text-xs transition";

export function SaveButton({ bundleId }: { bundleId: Id<"bundles"> }) {
  const { isSignedIn, isLoaded } = useAuth();

  // Guests get the signup upsell: clicking Save opens Clerk's modal (which has
  // a sign-up toggle) rather than silently failing. Only after signing in does
  // the real save toggle below mount.
  if (!isLoaded || !isSignedIn) {
    return (
      <SignInButton mode="modal">
        <button
          type="button"
          className={`${BASE_CLASS} border-foreground/20 hover:border-foreground/50`}
        >
          Save
        </button>
      </SignInButton>
    );
  }

  return <SavedToggle bundleId={bundleId} />;
}

function SavedToggle({ bundleId }: { bundleId: Id<"bundles"> }) {
  const saved = useQuery(api.savedBundles.isSaved, { bundleId });
  const save = useMutation(api.savedBundles.save);
  const remove = useMutation(api.savedBundles.remove);

  const handleClick = async () => {
    if (saved) {
      await remove({ bundleId });
    } else {
      await save({ bundleId });
      track("bundle_saved", { bundle_id: bundleId });
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={saved === undefined}
      className={`${BASE_CLASS} ${
        saved
          ? "border-foreground/50 bg-foreground text-background"
          : "border-foreground/20 hover:border-foreground/50"
      }`}
    >
      {saved ? "Saved ✓" : "Save"}
    </button>
  );
}
