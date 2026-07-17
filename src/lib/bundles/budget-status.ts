// NOTE: keep this file free of React/Next imports — pure display-logic helpers.

export type BudgetStatus = "within" | "over" | "under" | "unknown";

function parseNumbers(estTotal: string): number[] {
  const matches = estTotal.match(/\d+(?:\.\d+)?/g);
  return matches ? matches.map(Number) : [];
}

export function classifyBudgetStatus(estTotal: string, budget: number): BudgetStatus {
  const numbers = parseNumbers(estTotal);
  if (numbers.length === 0) return "unknown";
  const max = Math.max(...numbers);
  if (max > budget * 1.2) return "over";
  if (max < budget * 0.5) return "under";
  return "within";
}

export function budgetBand(budget: number): string {
  if (budget < 25) return "<25";
  if (budget < 50) return "25-50";
  if (budget < 100) return "50-100";
  if (budget < 200) return "100-200";
  return "200+";
}
