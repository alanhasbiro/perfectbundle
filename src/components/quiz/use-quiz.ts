"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { QuizAnswers, QuizState } from "@/lib/quiz/types";
import {
  QUIZ_STEPS,
  back,
  canAdvance,
  currentStep,
  emptyQuizState,
  next,
  progress,
  setAnswers,
  toQuizAnswers,
} from "@/lib/quiz/machine";
import { detectCountry, currencyForCountry } from "@/lib/quiz/country";
import { track } from "@/lib/analytics";

// Exported so the recipient-profiles "New bundles for X" flow can pre-seed the
// same storage the quiz hydrates from (keys must stay in one place).
export const STATE_KEY = "pb.quizState";
export const STARTED_KEY = "pb.quizStartedAt";
export const PROFILE_ID_KEY = "pb.quizProfileId";
const ANSWERS_KEY = "pb.quizAnswers";

function loadInitial(): { state: QuizState; fresh: boolean } {
  const country = detectCountry(
    typeof navigator !== "undefined" ? navigator.language : undefined
  );
  const fallback = emptyQuizState(country, currencyForCountry(country));
  try {
    const raw = sessionStorage.getItem(STATE_KEY);
    if (raw) return { state: JSON.parse(raw) as QuizState, fresh: false };
  } catch {
    // ignore corrupt storage — start fresh
  }
  return { state: fallback, fresh: true };
}

export function useQuiz() {
  const router = useRouter();
  // Starts null so server and first client render match; real state is hydrated
  // from sessionStorage in the mount effect (browser-only APIs can't run on the
  // server, and reading them during render would cause a hydration mismatch).
  const [state, setState] = useState<QuizState | null>(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    if (mountedRef.current) return; // StrictMode double-invoke guard
    mountedRef.current = true;

    const { state: initial, fresh } = loadInitial();
    if (fresh) {
      sessionStorage.setItem(STARTED_KEY, String(Date.now()));
      track("quiz_started");
    }
    // Intentional one-time hydration from browser storage after mount.
    setState(initial);
  }, []);

  useEffect(() => {
    if (state) sessionStorage.setItem(STATE_KEY, JSON.stringify(state));
  }, [state]);

  const patch = useCallback((p: Partial<QuizAnswers>) => {
    setState((s) => (s ? setAnswers(s, p) : s));
  }, []);

  const goNext = useCallback(() => {
    setState((s) => {
      if (!s || !canAdvance(s)) return s;
      track("quiz_step_completed", { step: currentStep(s) });
      return next(s);
    });
  }, []);

  const goBack = useCallback(() => {
    setState((s) => (s ? back(s) : s));
  }, []);

  const submit = useCallback(() => {
    // No state mutation happens here (the quiz is done) — read `state` directly
    // from closure rather than going through a setState updater. Calling
    // router.push() from inside a setState updater triggers React's "cannot
    // update a component while rendering a different component" warning,
    // since the updater can run during the render phase.
    if (!state) return;
    const answers = toQuizAnswers(state);
    if (!answers) return;
    track("quiz_step_completed", { step: currentStep(state) });
    const startedAt = Number(sessionStorage.getItem(STARTED_KEY) ?? Date.now());
    track("quiz_completed", {
      duration_s: Math.round((Date.now() - startedAt) / 1000),
    });
    sessionStorage.setItem(ANSWERS_KEY, JSON.stringify(answers));
    if (state.profileId) {
      sessionStorage.setItem(PROFILE_ID_KEY, state.profileId);
    } else {
      sessionStorage.removeItem(PROFILE_ID_KEY);
    }
    sessionStorage.removeItem(STATE_KEY);
    router.push("/quiz/results");
  }, [state, router]);

  const step = state ? currentStep(state) : QUIZ_STEPS[0];
  const canGoNext = state ? canAdvance(state) : false;
  const progressValue = state ? progress(state) : 0;
  const isLastStep = state ? state.stepIndex === QUIZ_STEPS.length - 1 : false;

  return useMemo(
    () => ({
      state,
      step,
      patch,
      goNext,
      goBack,
      submit,
      canGoNext,
      progressValue,
      isLastStep,
    }),
    [state, step, patch, goNext, goBack, submit, canGoNext, progressValue, isLastStep]
  );
}
