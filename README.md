# Missionry

[![status](https://img.shields.io/badge/status-alpha-orange)](#status)
[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![runtime](https://img.shields.io/badge/runtime-EdgeSpark%20%C2%B7%20Vercel%20AI%20SDK%20%C2%B7%20E2B-purple)](#architecture)

> **A local-first, cost-conscious multi-agent workspace.** Work is organized per Mission. Each Mission can optionally pull a GitHub repo, define a Mission-scoped Environment, recruit multiple reusable Agents, and coordinate them through a shared Mission sandbox plus per-Agent private sandboxes — lazily, with audited self-evolution.

## What it is

- **Mission-first.** Every piece of work is a Mission. Repos are optional inputs.
- **Two-tier sandbox model.** A shared Mission sandbox (Tier 1, cheap by default) plus on-demand per-Agent private sandboxes (Tier 2, for isolation / secrets / destructive work). Pure-reasoning agents use no sandbox at all (Tier 0).
- **Cost as a first-class signal.** Burn rate, active-sandbox count, Mission spend, and daily/global caps are surfaced everywhere — not an afterthought.
- **Agent data as markdown.** Soul / Identity / Memory / Skills are versioned files. Self-update writes a new version + audit event; rollback restores the previous one.
- **Two-tier self-evolution.** Agents evolve on themselves automatically (with audit + one-click rollback); changes that would affect others surface as opt-in candidates, never an approval queue.

## Architecture

```
   Browser
       │
       ▼
  ┌────────────────────────────────────────────────┐
  │ EdgeSpark Workers (Hono)                       │
  │   • Vercel AI SDK (OpenAI default, multi-LLM)  │
  │   • 13-tool kit (run_command, write_file, …)   │
  │   • SSE: cost_event, sandbox_burn, audit       │
  └──────────────┬─────────────────┬───────────────┘
                 │                 │
                 ▼                 ▼
        ┌────────────────┐  ┌─────────────────┐
        │ D1 (Mission    │  │ R2 (markdown    │
        │ state, audit,  │  │ agent files,    │
        │ budget, spend) │  │ sandbox snaps)  │
        └────────────────┘  └─────────────────┘
                 │
                 ▼  on-demand only
        ┌──────────────────────────┐
        │ E2B sandboxes            │
        │   Tier 1: 1 per mission  │
        │   Tier 2: 1 per agent    │
        │   pause-on-idle, $0 idle │
        └──────────────────────────┘
```

## Status

**Alpha.** Backend Phase 1 (in [`server/`](server)) is runnable end-to-end via `edgespark dev`. The web client is not yet open-sourced. Not production-ready.

## Run

```bash
cd server
cp ../.env.example .env          # fill E2B_API_KEY, OPENAI_API_KEY, etc.
edgespark init --here
edgespark storage apply
edgespark db migrate
edgespark dev                    # http://localhost:8787
```

Demo runbook & acceptance signals: [`server/README.md`](server/README.md).

## Cost

At demo scale (1 mission · ~14 min · 3 code-touching agents · auto-pause): **≈ $0.018 per mission**, **≈ 563 missions per $10 of E2B credit**.

## Layout

| Folder | Purpose |
|---|---|
| [`server/`](server) | EdgeSpark backend — Hono + Vercel AI SDK + D1 + R2 + E2B |
| [`prototype/`](prototype) | Original no-build React prototype, kept as the visual style reference |

## Contributing

Issues and PRs welcome. Please read [AGENTS.md](AGENTS.md) (hard rules for human and AI contributors) and [CONTRIBUTING.md](CONTRIBUTING.md) before submitting.

## License

[MIT](LICENSE) © 2026 yrzhe ([@yrzhe_top](https://x.com/yrzhe_top))
