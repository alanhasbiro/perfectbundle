# Warm & Bold Visual Redesign — Design Spec

**Date:** 2026-07-23
**Status:** Approved, ready for implementation plan

## Problem

The current UI is functionally complete (all of M1–M5 shipped) but visually generic: pure black-on-white (`--background:#fff` / `--foreground:#171717`), no color anywhere, flat rectangular black buttons, default Tailwind spacing. It doesn't read as a gift-picking product — it reads as an unstyled scaffold. There are no known UX/functional problems with any specific page; this is a visual-identity pass only.

Also found in exploration: `globals.css` hardcodes `font-family: Arial, Helvetica, sans-serif` on `body`, silently overriding the Geist Sans variable that's loaded via `next/font` but never actually applied. Real (if invisible) bug, fixed as part of this pass.

## Direction

Explored via the brainstorming visual companion: three initial directions (Warm & Giftable, Premium & Editorial, Bold & Colorful) using the site's real homepage copy, then two hybrids blending Warm and Bold. **Approved: Hybrid 1 — "Warm base, bold accents."** Soft cream-to-apricot backgrounds and warm ink text carry the everyday surface; a saturated orange→pink gradient is reserved for primary actions and accents so it reads as intentional emphasis, not everywhere-fatigue.

## Design Tokens

New CSS custom properties in `src/app/globals.css`, replacing the current two-variable palette. Both light and dark values defined explicitly (current dark mode is a bare `prefers-color-scheme` swap to near-black/near-white with no relationship to the light palette):

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#FFFBF5` | `#1A1210` | page background |
| `--bg-alt` | `#FFF1E0` | `#241813` | section/card backgrounds |
| `--fg` | `#3D2B1F` | `#FBE9D8` | primary text |
| `--fg-muted` | `#8B6A4F` | `#C9A47C` | secondary text/captions |
| `--accent-from` | `#F97316` | `#F97316` | gradient CTA start |
| `--accent-to` | `#DB2777` | `#DB2777` | gradient CTA end |
| `--accent-solid` | `#EA580C` | `#FB923C` | links, focus rings, icons (non-gradient contexts) |
| `--border` | `#FFE0BE` | `#3A2A20` | card/input borders |

Typography stays 100% Geist (already self-hosted via `next/font` — no new font load, no risk to the existing Lighthouse baseline). Headlines move to `font-bold`/`font-extrabold`; body text stays regular weight. Every token pair must be verified ≥4.5:1 contrast before this ships — the same bar the 2026-07-22 a11y pass enforced (it caught and fixed `opacity-50` text scoring 3.4:1).

## Components & Motion

- **Primary buttons** (Start the quiz, Buy links, Save, Sign up): gradient pill — `linear-gradient(var(--accent-from), var(--accent-to))`, `rounded-full`, soft drop shadow. Replaces the current flat `bg-foreground` black rectangle.
- **Secondary/tertiary actions** (Regenerate, Show me another, nav links, "browse trending" text links): outline or text style using `--accent-solid`, not the gradient — keeps the gradient reserved for the highest-intent actions.
- **`BundleCard`** (shared by results/trending/popular/share/my-bundles — one change propagates to all five): `--bg-alt` background, 1px `--border`, larger corner radius; item swatches/images get matching radius.
- **Header/nav** (`SiteHeader`): `--bg` background, hover/active states use `--accent-solid` instead of default underline-only.
- **Motion:** unchanged. Keep the existing Framer Motion fades/transitions and the already-built `prefers-reduced-motion` support in `motion-config-provider.tsx` as-is. This is a palette/component pass, not a new animation system — no new motion-related a11y risk.
- **Clerk UI** (sign-in/sign-up/UserButton): re-themed via Clerk's `appearance` prop to reference the same CSS variables, so auth screens visually match the rest of the site instead of looking like a foreign popup.

## Scope

Applied in one pass, site-wide (owner's explicit choice over a phased rollout): `/` (landing), header/nav, quiz wizard steps, `/quiz/results`, `BundleCard` (covers results/trending/popular/share/my-bundles), `/trending`, `/popular`, `/b/[id]`, `/profiles`, `/my-bundles`, Clerk sign-in/sign-up.

AdSense ad units are left visually as-is (their internal chrome is controlled by Google, not us) — only the surrounding spacing/margins around the fluid in-feed unit are adjusted so it sits naturally between the new-style cards.

**Explicitly out of scope:** no data model, routing, Convex schema, or business-logic changes. This is CSS tokens + component class edits only.

## Testing / Verification

Purely visual/regression risk, not functional — verification plan:

1. Full Playwright E2E suite reconfirmed green (currently 71 passed / 6 skipped) — catches any broken selector or interaction, not just visual drift.
2. Full Vitest unit suite reconfirmed green (currently 132/132).
3. Re-run the same Lighthouse mobile audit method used 2026-07-22 (`next build && next start`; Puppeteer + Lighthouse Node API to get past `/quiz/results`'s sessionStorage gate) on `/`, `/quiz`, `/quiz/results`. Confirm accessibility stays at 100 and performance doesn't regress below the current baseline (94 on `/quiz/results`, 74 on `/quiz` — the `/quiz` number's ceiling is Clerk-dev-keys/no-custom-domain, already documented as unrelated to app code; this pass must not make it worse).
4. Manual contrast spot-check on every new token pair actually used for text-on-background — the exact class of bug the 2026-07-22 a11y pass caught.

## Open Questions

None — all three design sections (tokens, components/motion, scope/verification) were presented and approved in-session.
