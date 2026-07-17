"use client";

import { MotionConfig } from "framer-motion";
import type { ReactNode } from "react";

// Respects the user's OS/browser "prefers-reduced-motion" setting site-wide:
// Framer Motion skips transform/opacity entrance animations for those users
// (e.g. the landing headline's fade-in), so content never renders in a
// transiently low-contrast or invisible state for people who need reduced
// motion. See tests/e2e/accessibility.spec.ts.
export function MotionConfigProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
