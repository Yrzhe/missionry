# Missionry — Contributor Rules

> Hard rules for any AI agent or human contributor working on this repo.
> Read these before opening a PR.

## Product principles

- **Mission-first.** Every piece of work is a Mission. Repos are optional inputs.
- **Cost is a first-class signal.** Active sandbox count, burn rate, Mission spend, and budget caps must be visible in any UI surface that touches sandboxes.
- **Lazy by default.** Pure-reasoning agents use no sandbox. A sandbox is created only on the first code/file/exec tool call.

## Hard UI rules

### i18n (mandatory)
All UI must support **Chinese (zh) and English (en)** from day one. Every visible string goes through an i18n layer; no hardcoded copy in components. Design layouts must accommodate both languages (text expansion).

### Screens are PRODUCT UI, not landing pages
Every screen is a working product surface (functional dashboard / app view), not a marketing landing page. When a visual reference is a marketing site, borrow only its atmosphere (canvas, gradients, shadows, color/type tokens) — never its page structure (oversized hero, marketing copy, CTA-driven scroll). Information density and real controls/data come first.

### Visual baseline
Use the **plain, utilitarian** style of the reference under [`prototype/`](prototype) — sidebar IA `Missions / Agent Library / Artifacts` (+ `Growth Center`, `Extensions`, `Settings`). Plain + useful + dense over decorative.

### Responsive / mobile (mandatory)
Every screen must adapt to mobile as well as desktop. Responsive layouts (breakpoints, stacking, touch targets) from the start — not a retrofit.

## Backend rules

- Bind to the API surface in [`server/`](server) (do not invent endpoints; if you need a new one, propose it in an Issue).
- Every SSE event carries an `auditEventId`.
- Self-update mutations write a new R2 object version and emit an audit event; rollback is a `restoreObjectVersion`.
- Cost events (`cost_event`, `sandbox_burn`) accumulate into Mission spend; daily/global budget caps gate the next LLM call.

## Code rules

- TypeScript strict. `tsc --noEmit` must be green before commit.
- Conventional Commits: `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`, `test:`, `perf:`, `ci:`.
- One concern per PR. Reference an Issue when applicable.
- Never commit `.env`, real tokens/keys/credentials, or anything under `node_modules/`, `.edgespark/state/`, `.wrangler/`.

## What's where

- [`server/`](server) — EdgeSpark backend (Hono + Vercel AI SDK + D1 + R2 + E2B).
- [`prototype/`](prototype) — original no-build React prototype, kept as visual style reference.
- Top-level meta — `README.md`, `LICENSE`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `.env.example`.

## When in doubt

Open an Issue before writing code. We'd rather discuss approach than redo a PR.
