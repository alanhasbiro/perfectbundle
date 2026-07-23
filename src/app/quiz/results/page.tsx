"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import type { QuizAnswers } from "@/lib/quiz/types";
import { getOrCreateSessionId } from "@/lib/session-id";
import { budgetBand } from "@/lib/bundles/budget-status";
import { track } from "@/lib/analytics";
import { BundleCard } from "@/components/bundles/bundle-card";
import { AdUnit } from "@/components/ad-unit";
import type { BundleItemLike } from "@/components/bundles/bundle-card-types";
import { PROFILE_ID_KEY } from "@/components/quiz/use-quiz";

type AnswersState = { loaded: false } | { loaded: true; answers: QuizAnswers | null };

function readAnswers(): QuizAnswers | null {
  try {
    const raw = sessionStorage.getItem("pb.quizAnswers");
    if (raw) return JSON.parse(raw) as QuizAnswers;
  } catch {
    // corrupt storage — treat as no answers
  }
  return null;
}

function readProfileId(): string | null {
  try {
    return sessionStorage.getItem(PROFILE_ID_KEY);
  } catch {
    return null;
  }
}

export default function ResultsPage() {
  const [answersState, setAnswersState] = useState<AnswersState>({ loaded: false });
  const [profileId, setProfileId] = useState<string | null>(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    if (mountedRef.current) return; // StrictMode double-invoke guard
    mountedRef.current = true;
    setAnswersState({ loaded: true, answers: readAnswers() });
    setProfileId(readProfileId());
  }, []);

  if (!answersState.loaded) return null;

  if (!answersState.answers) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="opacity-70">No quiz answers found.</p>
        <Link href="/quiz" className="btn-primary">
          Take the quiz
        </Link>
      </main>
    );
  }

  return <ResultsForAnswers answers={answersState.answers} profileId={profileId} />;
}

function ResultsForAnswers({
  answers,
  profileId,
}: {
  answers: QuizAnswers;
  profileId: string | null;
}) {
  const generate = useAction(api.generateBundles.generate);
  const record = useMutation(api.engagement.record);
  type GenState =
    | { phase: "generating" }
    | { phase: "ok"; bundleIds: Id<"bundles">[]; cacheHit: boolean }
    | { phase: "failed"; reason: string };
  const [genState, setGenState] = useState<GenState>({ phase: "generating" });
  const requestedRef = useRef(false);
  const trackedOutcomeRef = useRef(false);

  useEffect(() => {
    if (requestedRef.current) return; // StrictMode double-invoke guard
    requestedRef.current = true;
    (async () => {
      const rateLimitKey = getOrCreateSessionId();
      const result = await generate({
        quiz: answers,
        rateLimitKey,
        ...(profileId ? { profileId: profileId as Id<"recipientProfiles"> } : {}),
      });
      if (result.status === "ok") {
        setGenState({ phase: "ok", bundleIds: result.bundleIds, cacheHit: result.cacheHit });
      } else if (result.status === "rate_limited") {
        setGenState({ phase: "failed", reason: "rate_limited" });
      } else {
        setGenState({ phase: "failed", reason: result.reason });
      }
    })();
    // Deliberately run once on mount only: `answers` is this component's own
    // prop (stable per quiz submission) and `generate` is a stable Convex
    // action reference — re-running on their identity would trigger duplicate
    // Gemini calls, which the requestedRef guard above exists to prevent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const generatedBundles = useQuery(
    api.bundles.getByIds,
    genState.phase === "ok" ? { ids: genState.bundleIds } : "skip"
  );
  const curated = useQuery(api.curated.listApproved);

  useEffect(() => {
    if (trackedOutcomeRef.current) return;
    if (genState.phase === "ok" && generatedBundles) {
      trackedOutcomeRef.current = true;
      track("bundles_generated", {
        cache_hit: genState.cacheHit,
        budget_band: budgetBand(answers.budget),
      });
    } else if (genState.phase === "failed") {
      trackedOutcomeRef.current = true;
      track("bundle_generation_failed", { reason: genState.reason });
    }
  }, [genState, generatedBundles, answers.budget]);

  const handleLinkClick = (
    bundleId: string,
    retailer: string,
    item: BundleItemLike,
    kind: "generated" | "curated" = "generated"
  ) => {
    track("retailer_link_clicked", { retailer, bundle_id: bundleId, item_tags: item.tags });
    void record({ bundleId, kind, type: "linkClicks" });
  };

  if (genState.phase === "generating") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-lg">Building your bundles…</p>
        <p className="text-sm opacity-70">This usually takes a few seconds.</p>
      </main>
    );
  }

  if (genState.phase === "failed") {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 px-6 py-10">
        <p className="rounded-xl border border-foreground/15 p-4 text-sm opacity-70">
          We hit a snag generating something new — here are some crowd-pleasers instead.
        </p>
        {curated === undefined ? (
          <p className="opacity-70">Loading…</p>
        ) : (
          curated.map((bundle, i) => (
            <div key={bundle._id} className="flex flex-col gap-6">
              <BundleCard
                content={bundle}
                country="US"
                urgency="normal"
                onLinkClick={(retailer, item) => handleLinkClick(bundle._id, retailer, item, "curated")}
              />
              {i === 1 ? (
                <AdUnit slot="8812435332" format="fluid" layoutKey="-fc+5g+70-cl-1m" />
              ) : null}
            </div>
          ))
        )}
        <Link href="/quiz" className="text-sm underline opacity-70 hover:opacity-100">
          ← Try the quiz again
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 px-6 py-10">
      <h1 className="text-3xl font-semibold">Your gift bundles 🎁</h1>
      {generatedBundles === undefined ? (
        <p className="opacity-70">Loading…</p>
      ) : (
        generatedBundles.map((bundle, i) => (
          <div key={bundle._id} className="flex flex-col gap-6">
            <BundleCard
              content={bundle}
              budget={answers.budget}
              country={answers.country}
              urgency={answers.urgency}
              bundleId={bundle._id}
              onLinkClick={(retailer, item) => handleLinkClick(bundle._id, retailer, item)}
            />
            {i === 1 ? (
              <AdUnit slot="8812435332" format="fluid" layoutKey="-fc+5g+70-cl-1m" />
            ) : null}
          </div>
        ))
      )}
      <Link href="/quiz" className="text-sm underline opacity-70 hover:opacity-100">
        ← Start over
      </Link>
    </main>
  );
}
