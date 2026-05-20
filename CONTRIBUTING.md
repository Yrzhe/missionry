# Contributing to Missionry

Thanks for your interest. Missionry is in **alpha** — read this first.

## Before you start

1. Read [`README.md`](README.md) for the product overview.
2. Read [`AGENTS.md`](AGENTS.md) — these are **hard rules** for any AI agent and for humans editing the codebase (i18n, responsive, product-UI-not-landing, plain visual baseline).
3. Look at [`server/README.md`](server/README.md) for the backend orientation and demo runbook.

## How to propose a change

| You want to… | Open… |
|---|---|
| Report a bug or behavior question | An **Issue** with reproduction steps |
| Propose a small fix | A **PR** with a clear title and a test plan |
| Propose a larger feature or architecture change | An **Issue** first to discuss before writing code |
| Suggest a design / UX change | An **Issue** with a sketch or mockup |
| Add a new Skill (Claude-Code SKILL.md style) | A **PR** to `agents/<id>/skills/<skill-id>/SKILL.md` with frontmatter `description` |

## Development setup

Phase 1 runs entirely locally via EdgeSpark + Miniflare. See [`server/README.md`](server/README.md) for the runbook. E2B credentials are the one external dependency.

## Hard rules (from `AGENTS.md`)

- **i18n from day one** — every UI string goes through an i18n layer; never hardcoded copy in components. Provide both `zh` and `en`.
- **Product UI, not landing pages** — dense, functional dashboards. Borrow visual *atmosphere* from references, never their hero/CTA marketing structure.
- **Responsive from the start** — every screen must work on mobile.
- **No secrets in the repo** — `.env`, `*credentials*`, keys, tokens are gitignored; reviewers will reject PRs that leak them.
- **One `AGENTS.md` per repo** — do not create `CLAUDE.md` or `GEMINI.md` in subfolders.

## Commit & PR style

- Conventional Commits: `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`, `test:`, `perf:`, `ci:`.
- Keep PRs small and reviewable. One concern per PR.
- Reference an Issue when applicable: `feat: add Tier 2 escalation reaper (#42)`.
- Include a brief test plan in the PR description (what you ran, what you expect a reviewer to verify).

## Code review

- All non-trivial PRs need at least one reviewer.
- CI must be green (typecheck + tests, when those land).
- For agent-generated code, the human author is responsible for reading the diff before merging.

## Code of Conduct

By contributing you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
