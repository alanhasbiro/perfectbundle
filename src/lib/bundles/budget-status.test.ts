import { describe, it, expect } from "vitest";
import { classifyBudgetStatus, budgetBand } from "./budget-status";

describe("classifyBudgetStatus", () => {
  it("classifies a range comfortably within budget", () => {
    expect(classifyBudgetStatus("$45-60", 55)).toBe("within");
  });

  it("classifies a range that overshoots by more than 20% as over", () => {
    expect(classifyBudgetStatus("$80-100", 50)).toBe("over");
  });

  it("classifies a range far below budget as under", () => {
    expect(classifyBudgetStatus("$10-15", 100)).toBe("under");
  });

  it("handles currency symbols placed before each number", () => {
    expect(classifyBudgetStatus("£35-£50", 45)).toBe("within");
  });

  it("handles a single number (no range)", () => {
    expect(classifyBudgetStatus("$50", 50)).toBe("within");
  });

  it("returns unknown when no numbers are present", () => {
    expect(classifyBudgetStatus("varies", 50)).toBe("unknown");
  });
});

describe("budgetBand", () => {
  it("buckets budgets into the expected bands", () => {
    expect(budgetBand(10)).toBe("<25");
    expect(budgetBand(25)).toBe("25-50");
    expect(budgetBand(49)).toBe("25-50");
    expect(budgetBand(50)).toBe("50-100");
    expect(budgetBand(150)).toBe("100-200");
    expect(budgetBand(300)).toBe("200+");
  });
});
