"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { ComponentType } from "react";
import type { QuizAnswers, QuizState } from "@/lib/quiz/types";
import type { QuizStepId } from "@/lib/quiz/machine";
import { useQuiz } from "./use-quiz";

export interface StepProps {
  state: QuizState;
  patch: (p: Partial<QuizAnswers>) => void;
}

export function QuizWizard({ steps }: { steps: Record<QuizStepId, ComponentType<StepProps>> }) {
  const { state, step, patch, goNext, goBack, submit, canGoNext, progressValue, isLastStep } =
    useQuiz();

  if (!state) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="opacity-60">Loading…</p>
      </main>
    );
  }

  const StepComponent = steps[step];

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col px-6 py-10">
      <div className="mb-8 h-1.5 w-full overflow-hidden rounded-full bg-foreground/10">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-accent-from to-accent-to"
          animate={{ width: `${Math.max(progressValue * 100, 4)}%` }}
          transition={{ duration: 0.4 }}
        />
      </div>

      <div className="flex flex-1 flex-col">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.3 }}
            className="flex-1"
          >
            <StepComponent state={state} patch={patch} />
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="mt-10 flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={goBack}
          disabled={state.stepIndex === 0}
          className="rounded-full px-5 py-2.5 text-sm opacity-70 transition hover:opacity-100 disabled:invisible"
        >
          ← Back
        </button>
        <button
          type="button"
          onClick={isLastStep ? submit : goNext}
          disabled={!canGoNext}
          className="btn-primary px-8 py-3"
        >
          {isLastStep ? "Build my bundles" : "Next"}
        </button>
      </div>
    </main>
  );
}
