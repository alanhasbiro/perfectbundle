"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { QuizAnswers } from "@/lib/quiz/types";

type LoadState = { loaded: false } | { loaded: true; answers: QuizAnswers | null };

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
  const [result, setResult] = useState<LoadState>({ loaded: false });
  const mountedRef = useRef(false);

  useEffect(() => {
    if (mountedRef.current) return; // StrictMode double-invoke guard
    mountedRef.current = true;
    setResult({ loaded: true, answers: readAnswers() });
  }, []);

  if (!result.loaded) return null;

  if (!result.answers) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="opacity-70">No quiz answers found.</p>
        <Link href="/quiz" className="rounded-full bg-foreground px-6 py-2.5 text-background">
          Take the quiz
        </Link>
      </main>
    );
  }

  const answers = result.answers;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center gap-4 px-6 py-10">
      <h1 className="text-3xl font-semibold">Got it! 🎁</h1>
      <p className="opacity-70">
        A {answers.occasion.toLowerCase()} gift for your {answers.relationship.toLowerCase()} (
        {answers.ageBand}), around {answers.budget} {answers.currency}, into{" "}
        {answers.interests.slice(0, 3).join(", ").toLowerCase() || "what you described"}.
      </p>
      <p className="rounded-xl border border-foreground/15 p-4 text-sm opacity-70">
        Bundle generation is coming in the next sprint — this page will show 3 themed bundles built
        just for them.
      </p>
      <Link href="/quiz" className="text-sm underline opacity-70 hover:opacity-100">
        ← Change my answers
      </Link>
    </main>
  );
}
