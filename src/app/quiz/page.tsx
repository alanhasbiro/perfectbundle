import { QuizWizard } from "@/components/quiz/quiz-wizard";
import { OccasionStep } from "@/components/quiz/steps/occasion-step";
import { RecipientStep } from "@/components/quiz/steps/recipient-step";
import { InterestsStep } from "@/components/quiz/steps/interests-step";
import { BudgetStep } from "@/components/quiz/steps/budget-step";
import { UrgencyStep } from "@/components/quiz/steps/urgency-step";
import { ExclusionsStep } from "@/components/quiz/steps/exclusions-step";

export const metadata = { title: "The gift quiz — PerfectBundle" };

export default function QuizPage() {
  return (
    <QuizWizard
      steps={{
        occasion: OccasionStep,
        recipient: RecipientStep,
        interests: InterestsStep,
        budget: BudgetStep,
        urgency: UrgencyStep,
        exclusions: ExclusionsStep,
      }}
    />
  );
}
