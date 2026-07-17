"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAction, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import type { QuizAnswers } from "@/lib/quiz/types";
import { getOrCreateSessionId } from "@/lib/session-id";
import { budgetBand } from "@/lib/bundles/budget-status";
import { track } from "@/lib/analytics";
import { BundleCard } from "@/components/bundles/bundle-card";
import type { BundleItemLike } from "@/components/bundles/bundle-card-types";

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

export default function ResultsPage() {
  const [answersState, setAnswersState] = useState<AnswersState>({ loaded: false });
  const mountedRef = useRef(false);

  useEffect(() => {
    if (mountedRef.current) return; // StrictMode double-invoke guard
    mountedRef.current = true;
    setAnswersState({ loaded: true, answers: readAnswers() });
  }, []);

  if (!answersState.loaded) return null;

  if (!answersState.answers) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="opacity-70">No quiz answers found.</p>
        <Link href="/quiz" className="rounded-full bg-foreground px-6 py-2.5 text-background">
          Take the quiz
        </Link>
      </main>
    );
  }

  return <ResultsForAnswers answers={answersState.answers} />;
}

function ResultsForAnswers({ answers }: { answers: QuizAnswers }) {
  const generate = useAction(api.generateBundles.generate);
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
      const result = await generate({ quiz: answers, rateLimitKey });
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

  const handleLinkClick = (bundleId: string, retailer: string, item: BundleItemLike) => {
    track("retailer_link_clicked", { retailer, bundle_id: bundleId, item_tags: item.tags });
  };

  if (genState.phase === "generating") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-lg">Building your bundles…</p>
        <p className="text-sm opacity-60">This usually takes a few seconds.</p>
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
          <p className="opacity-60">Loading…</p>
        ) : (
          curated.map((bundle) => (
            <BundleCard
              key={bundle._id}
              content={bundle}
              country="US"
              urgency="normal"
              onLinkClick={(retailer, item) => handleLinkClick(bundle._id, retailer, item)}
            />
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
        <p className="opacity-60">Loading…</p>
      ) : (
        generatedBundles.map((bundle) => (
          <BundleCard
            key={bundle._id}
            content={bundle}
            budget={answers.budget}
            country={answers.country}
            urgency={answers.urgency}
            bundleId={bundle._id}
            onLinkClick={(retailer, item) => handleLinkClick(bundle._id, retailer, item)}
          />
        ))
      )}
      <Link href="/quiz" className="text-sm underline opacity-70 hover:opacity-100">
        ← Start over
      </Link>
    </main>
  );
}
