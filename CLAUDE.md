# CLAUDE.md - PerfectBundle

@AGENTS.md

## Project Overview

AI gift bundle picker: short quiz about the recipient → 3 themed bundles of 3–6 complementary items → region-aware retailer links (Amazon/Etsy/eBay, affiliate-ready). Web first; React Native (Expo) later.

**Tech Stack:** Next.js (App Router) + TypeScript + Tailwind + Framer Motion · Convex (DB/actions/cron) · Gemini Flash (engine) · Clerk (auth, M4) · Resend (email, M4) · PostHog (analytics) · Playwright + Vitest

**HARD CONSTRAINT: $0 operating cost.** Every service runs on a permanent free tier. NEVER add a paid service, paid API, or paid tier without explicit owner approval. Protect free quotas: cache, rate-limit, fallback.

---

## Quick Reference

### Commands
```bash
npm run dev           # Next.js dev server
npx convex dev        # Convex dev backend (run alongside)
npm run build         # Production build
npm test              # Vitest unit tests
npx playwright test   # E2E tests
npm run lint          # Lint
```
(Verify against package.json once scaffolded — M1 not started yet.)

### Key Files
| File | Purpose |
|------|---------|
| `docs/prd.md` | Product requirements + analytics spine (canonical event names) |
| `docs/tasks.md` | **Single source of truth** for milestones and work items |
| `docs/planning.md` | Architecture, stack, cost policy, dev workflow |
| `docs/checkpoint.md` | Progress tracking — update before every commit |
| `docs/data-schema.md` | Convex table shapes |
| `docs/dashboard-spec.md` | PostHog proof-dashboard spec |
| `docs/superpowers/specs/` | Approved design specs |
| `docs/superpowers/plans/` | Per-feature execution plans (`superpowers:writing-plans`) |

---

## Development Workflow (Superpowers)

**YOU MUST follow this pattern when starting any new development work.**

1. **Read the 4 source-of-truth docs first:** `docs/prd.md`, `docs/tasks.md`, `docs/planning.md`, `docs/checkpoint.md`
2. **Plan** — invoke `superpowers:writing-plans` against the next unstarted P0/P1 task in `docs/tasks.md`; plan lands in `docs/superpowers/plans/YYYY-MM-DD-<feature>.md`
3. **Execute** — `superpowers:executing-plans` (or `superpowers:subagent-driven-development` for multi-task plans)
4. **TDD** — `superpowers:test-driven-development`: no production code without a failing test first
5. **Verify** — `superpowers:verification-before-completion` before any "done" claim
6. **Track** — edit `docs/tasks.md` and `docs/checkpoint.md` directly as work lands. Do NOT use the native task list.

---

## MCP Tools

| Tool | Purpose | When |
|------|---------|------|
| **Context7 MCP** (`mcp__plugin_context7_context7__*`) | Current library docs | Planning, implementation, debugging — query before architecture decisions and when APIs act unexpectedly (Next.js, Convex, Clerk, PostHog change fast) |
| **Playwright CLI** (`npx playwright test`) | E2E testing | Every sprint — 95% pass rate required before sprint completion |
| **Convex MCP** (if configured) | DB inspection | Database operations/debugging |

---

## Sprint Completion Requirements

A sprint is NOT complete until ALL of:
- [ ] E2E tests pass at ≥95% (fresh run, per `superpowers:verification-before-completion`)
- [ ] Golden-fixture engine suite green (budget bounds, exclusions, age rails)
- [ ] `docs/checkpoint.md` updated (progress, test results, change log)
- [ ] `docs/tasks.md` checkboxes flipped; discovered tasks added
- [ ] `docs/planning.md` updated if architecture changed
- [ ] All changes committed

---

## Project Structure (target)
```
src/
├── app/              # Next.js App Router pages
├── components/       # React components
└── lib/
    ├── engine/       # Bundle engine: prompts, Zod schemas (UI-independent)
    └── links/        # Link builder: pure, unit-tested, affiliate slots
convex/               # Schema, queries, mutations, actions, cron
tests/                # Playwright E2E + golden fixtures
docs/                 # Source-of-truth docs
```
Keep `lib/engine` and `lib/links` free of React/Next imports — they get reused by the Expo mobile app later.

## Conventions
- TypeScript strict; Server Components by default; components PascalCase, files kebab-case
- Analytics event names are canonical in `docs/prd.md` §2.3 — never invent variants
- Commits: `type(scope): description` + note doc updates; types: feat, fix, docs, refactor, test, chore

## Important Notes
- NEVER hardcode API keys; Gemini calls are server-side (Convex) only
- NEVER add paid services (see hard constraint above)
- Prices shown to users are always estimates — never present as live quotes
- ALWAYS update `docs/checkpoint.md` before commits
- Affiliate links require a visible disclosure once tags go live (FTC + program ToS)
