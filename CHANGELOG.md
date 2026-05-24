# Changelog

All notable changes to Missionry are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/); this project
uses date-based entries.

## [Unreleased]

### Fixed
- **Decompose piled every card on the leader instead of delegating.** When a
  mission was created with a leader but no members yet in the roster (e.g. the
  concierge created the specialist agents globally, then `create_mission` attached
  only the leader before decompose), every card's suggested assignee failed to
  match and silently fell back to the leader — so one agent got all the work and
  the rest sat idle. Two fixes: (1) the concierge `create_mission` now takes
  `memberAgentIds` and attaches the executor team **before** decompose; (2)
  decompose now spreads unmatched cards across members round-robin and only falls
  back to the leader when there are genuinely no members (leader does it himself).
  (`server/src/index.ts`)
- **All work cards failed at startup (`mkdir: /workspace: Permission denied`).**
  `WORKSPACE_ROOT` was `/workspace`, a root-owned top-level dir the sandbox's
  non-root `user` cannot create — so every runner launch died immediately (the
  `source: not found` lines were just harmless dash login-shell noise). Moved the
  workspace to `/home/user/workspace` (always writable by `user`) and routed every
  reference through the constant: runner launch, `git_clone`, artifact path
  normalization, and the in-sandbox runner (`ROOT` now reads
  `MISSIONRY_WORKSPACE_ROOT`, passed at launch). (`server/src/sandbox/e2b.ts`,
  `server/src/index.ts`, `server/src/tools/index.ts`, `server/src/runtime/agentRunner.ts`)
- **Concierge overview counted deleted missions.** An agent showed "in N missions"
  including missions already deleted (the "demo agent · 在 5 个 mission" with zero
  live missions). `adminAgentsOverview` now joins missions and excludes
  `status = deleted`. (`server/src/index.ts`)
- **Delete Mission "no reaction" root cause.** Both delete handlers gated on the
  native `window.confirm()`, which browsers/extensions can silently suppress
  ("don't allow this page to create more dialogs") — making delete do nothing with
  no request and no error. Replaced with an in-app `ConfirmModal` (no dependency on
  native dialogs) and surfaced delete failures inside the dialog.
  (`web/.../ConfirmModal.tsx`, `missions-home/MissionsHome.tsx`, `workroom/Workroom.tsx`)

### Changed
- **Mission (Workroom) page is now fixed-height.** The whole page no longer
  scrolls; the summary stays pinned and the two-column area (plan/activity/
  artifacts + team chat) fills the viewport with each panel scrolling internally
  (work-card list and chat scroll, not the page). The「展开设置」details panel
  (objective, budget guardrail, environment, agent sandboxes, danger zone) is now
  a **modal** instead of an inline expander that grew the page. Mobile stacks with
  natural heights. (`web/.../workroom/Workroom.tsx`, `web/src/index.css`)
- **Concierge (管家) page polish.** Removed the duplicate「管家」heading inside the
  chat (the page header already labels it) — now a slim one-line capability hint.
  The page fills the viewport height: chat column scrolls internally with the
  composer pinned, and the right「全局概览」is two fixed-height blocks (Agents /
  Missions) that each scroll independently. Mobile stacks with per-card heights.
  (`web/.../concierge/Concierge.tsx`, `web/src/index.css`)

### Fixed
- **Concurrency hardening (#3/#9/#10).** Three race/correctness fixes in the
  sandbox + budget path:
  - **#3 sandbox start race.** Concurrent `startOrResume` for the same sandbox no
    longer each spin up a real E2B sandbox (the duplicate leaked + burned money).
    A CAS lease (`claimSandboxStartLease`, `INSERT…ON CONFLICT DO UPDATE…WHERE…
    RETURNING`) lets exactly one caller create; losers wait for the winner's
    routing, with a stale-lease (90s) reclaim and a create-it-yourself fallback so
    it is never worse than before. Only engages on cold start.
  - **#9 atomic budget reserve.** The daily-cap check was read-then-check, so two
    concurrent ops could both pass and overspend. New `reserveUserSpend` does a
    single conditional UPDATE (reserve iff under cap), settled to real cost via
    `CostRecord.reservedUserCents`. Applied to the mission-chat and direct-thread
    replies, then extended via a `spendGuardedGenerateText` wrapper to **all**
    server-side LLM spends: mission decomposition, proactive chatter gate, memory
    review, and the concierge (user-scoped, settled against the owner's daily
    total). Conservative on error — reserve is released, can only over-count.
    (Skill-content security scan is the one remaining ungated call: no
    mission/user context, infrequent, user-initiated.)
  - **#10 stale env on resume.** Mission env was injected only at sandbox CREATE;
    a resumed sandbox kept stale values. The current mission env is now injected
    per-exec (threaded through `runCommand`→`envdRunCommand`) at runner launch, so
    the runner always sees up-to-date variables regardless of sandbox age.
  (`server/src/state/missionState.ts`, `server/src/sandbox/e2b.ts`,
  `server/src/sse/events.ts`, `server/src/index.ts`)

### Added
- **Skill library page (`/skills`).** Browse the team skill library; click a skill
  to see its SKILL.md and check which agents to equip it on (saves the full set).
  Endpoints `GET /skills`, `GET /skills/:id`, `PUT /skills/:id/agents`. Nav entry「技能库」.
  (`web/.../skill-library/SkillLibrary.tsx`, `server/src/index.ts`)
- **Team shared skill library.** Skills now live in a shared library
  (`skills` table + R2 `skills/{id}/SKILL.md`) that any agent can be equipped with;
  agents resolve a skill from their own folder first, then the library
  (`loadAgentBootFiles`/`loadSkill`). Concierge tools: `list_library_skills`,
  `add_library_skill` (author), `install_library_skill` (from GitHub, security-scanned),
  `equip_skill(agentId, skillId)`. Migration `0006`; added `skills/` + `users/` R2
  prefixes. (`server/src/index.ts`, `server/src/agents/files.ts`)
- **Concierge can search GitHub for skills (`find_skills`).** Given a capability,
  it searches GitHub — code search for `SKILL.md` when `GITHUB_TOKEN` is set, else
  unauthenticated repo search — returns candidates, then installs a chosen one via
  the security-scanned `install_skill_from_github`. (`server/src/index.ts`)
- **Concierge can craft agents + manage per-agent skills.** `create_agent` now
  writes a tailored SOUL/identity and authors+equips skills in one shot. New tools:
  `add_skill` (author a SKILL.md into an agent's own folder + equip) and
  `install_skill_from_github` (fetch a SKILL.md from a GitHub blob/raw URL → **security
  scan** for exfiltration / destructive commands / RCE / prompt-injection → install +
  equip only if safe, else refuse with the risks). Skills stay per-agent (downloaded
  into that agent's `skills/` folder). (`server/src/index.ts`, `server/src/agents/files.ts`)
- **Concierge (Admin) agent — control-plane orchestrator.** A new top-level
  「管家」 page where you chat with a workspace concierge that can inspect all agents
  and missions, **create agents**, and **create missions + assign a leader**
  (auto-plans) — but has **no execution tools** (no sandboxes/code/artifacts). Backed
  by a restricted tool loop (`list_agents` / `list_missions` / `create_agent` /
  `create_mission`), a workspace-level chat (`admin_chat_messages`, migration `0005`),
  and a live overview snapshot. Endpoints `GET /concierge/overview`,
  `GET/POST /concierge/chat`. (`server/src/index.ts`, `web/.../concierge/Concierge.tsx`)
- **Chat scrolls to bottom on load/refresh** (rAF + fallback, after markdown reflow).
- **Memory editor in the Agent Library.** The agent edit modal now shows and edits
  the agent's `MEMORY.md` (long-term memory) and the owner's shared `USER.md`
  profile. New endpoints `GET/PUT /agents/:agentId/memory` and
  `GET/PUT /me/memory-profile`. (`server/src/index.ts`, `web/.../agent-library/AgentLibrary.tsx`)
- **Layered agent memory (Hermes-style).** Agents now have long-term memory:
  `agents/{id}/MEMORY.md` (cross-mission lessons/conventions, cap ~2.4k) and a
  shared `users/{userId}/USER.md` owner profile (cap ~1.5k); the raw message log
  (mission_chat_messages + audit) is the `state.db` equivalent and isn't auto-loaded.
  Memory is injected into both chat replies and the in-sandbox runner. A background
  **self-improvement review** (cheap model, after each chat exchange) extracts
  durable agent lessons + owner-profile facts and saves them — capped, budget-gated,
  killable via `MISSIONRY_MEMORY_REVIEW=off`. Verified live: the runner task now
  carries a `memory` field. (`server/src/agents/files.ts`, `server/src/index.ts`,
  `server/src/runtime/agentRunner.ts`)
- **Proactive agent chatter (Phase 2.2).** Non-leader agents no longer speak only
  when @mentioned. On each USER team-chat message, a cheap gate model
  (`MISSIONRY_GATE_MODEL`, default `gpt-5-mini`) decides per candidate agent whether
  it's worth chiming in; the top 1–2 yes-voters then post a real reply (with tools).
  Guardrails: only reacts to user messages (no agent ping-pong), ≤2 speakers,
  per-agent cooldown (skips agents who spoke in the last 4 messages), skips when the
  daily budget cap is hit, kill switch `MISSIONRY_PROACTIVE_CHATTER=off`. Runs in the
  background (avoids Worker wall-clock limits); replies surface via the mission SSE.
  (`server/src/index.ts`, `server/src/defs/runtime.ts`)
- **Per-work-card discussion threads (Phase 2.1).** Each work card now has its own
  discussion (in the card detail modal): the user (and agents) can post messages,
  and **@mentioning an agent really triggers it** to reply/act scoped to that card —
  delegate "small tasks" without creating a new card. Messages carry a new
  `work_card_id` column (migration `0004`); card threads are excluded from the
  mission team chat. New endpoints `GET/POST /missions/:id/work-cards/:cardId/messages`.
  (`server/src/index.ts`, `server/src/defs/db_schema.ts`, `web/.../workroom/Workroom.tsx`)

- **Durable artifacts (产物 persist to R2).** On work-card completion the produced
  files are copied from the sandbox to R2 (`missions/{id}/artifacts/...`), so the
  Artifacts tab shows them even after the sandbox pauses/expires. New endpoints
  `GET /missions/:id/artifacts` (list, sourced from each card's
  `cost_json.runner.resultFiles` since the storage SDK has no `list()`) and
  `GET /missions/:id/artifacts/file`. The 产物 tab now shows durable "已保存产物"
  on top with the live sandbox file browser collapsible below.
  (`server/src/index.ts`, `web/.../workroom/Workroom.tsx`)

### Changed
- **Self-driving queue heartbeat.** Added token-gated `POST /api/public/internal/tick`
  (fails stuck cards + starts queued cards + pauses idle sandboxes) and a GitHub
  Actions cron workflow (`.github/workflows/missionry-tick.yml`, every 5 min) to
  drive it, since EdgeSpark has no cron. Note the autonomy chain already
  self-advances server-side (decompose→start, completion callback→start next); the
  tick covers cold-start and stall-recovery when nobody has the app open.
- **Directly @mentioned agents must answer.** The chat dispatcher previously told
  every agent (incl. the leader) it could reply `[NO]`; a direct @mention now
  forces a real, tool-using answer. (`server/src/index.ts`)

### Fixed (agent data)
- **Agents loaded with empty souls.** The old string-put bug left seeded agents'
  `soul.md`/`identity.md`/`base-config.yaml` as empty bodies, and `putIfMissing`
  wouldn't overwrite them. `ensureAgentFiles` now uses missing-or-empty writes that
  self-heal blank persona files on next load, with a richer default SOUL.md scaffold
  (identity / how-you-work / boundaries — OpenClaw/Hermes convention). Verified live:
  the runner now loads a real soul. (`server/src/agents/files.ts`)
- **Equipped skills were hardcoded.** `loadAgentBootFiles` now reads each agent's
  `equipped_skill_ids_json` from the DB (fallback to the demo skill) instead of a
  hardcoded per-agent list. (`server/src/agents/files.ts`)

### Fixed (logic-review batch 2)
- **PATCH work-card 500 on unassigned cards** — marking an unassigned card
  done/failed called `agentForInstance("")` and threw after the status was already
  changed; now it only chains the next card when an assignee exists.
- **Chat pagination skipped/duplicated rows** — the `before` cursor compared random
  message ids (`mcm_…`, not time-ordered); it now paginates by `createdAt`.
- **Direct-thread replies bypassed the budget gate** — they now run
  `BudgetService.assertCanSpend` before the model call, like mission chat.

  Deferred (need careful CAS + load testing): #3 sandbox start-race lease,
  #9 atomic budget reservation, #10 environment versioning on sandbox resume.

### Fixed (logic-review batch, from Codex review)
- **Concurrent runners overwrote each other** — runner files now stage to a
  per-work-card dir `.missionry/runs/{cardId}/` (was a shared fixed path), so two
  agents in the same shared sandbox can't clobber each other's task/status/log.
- **Stuck reaper killed legitimately long tasks** — the runner now sends a
  heartbeat each step to `POST /api/webhooks/work-card-heartbeat`, which bumps the
  card's `updated_at` so the 15-min stuck reaper doesn't fail a still-working task.
- **Private-sandbox artifacts were read from the shared sandbox** — completion now
  persists artifacts from the sandbox that actually ran the card (private vs shared).
- **Late callback could overwrite a terminal card** — completion is now an atomic
  conditional update (`WHERE status='running'`); if the user cancelled/deleted in
  the meantime it's ignored instead of resurrecting the card.
- **`startWorkCard` failure handler clobbered user intent** — it only marks failed
  if the card is still `running`.
- **`report_progress` could mark ANY card done** — now restricted to the calling
  agent's own assigned card.
- **Idle reaper over-protected (billing leak)** — it now protects only the specific
  sandbox carrying an in-flight card (by affinity), not every sandbox in the mission.
- **R2 stored EMPTY bodies (artifacts previewed as `[object Object]`).**
  `storage.put` requires `ArrayBuffer | ArrayBufferView`; passing a raw **string**
  stored a zero-byte body. Every text put (artifacts, agent soul/identity, tool
  write_file/write_artifact, env var content, audit rollback) now encodes via
  `TextEncoder`. Also `storage.get()` returns `{ body: ArrayBuffer, metadata }`
  (no `.text()`), so the read helpers now decode `body`
  (ArrayBuffer/typed-array/stream) and never fall back to `String(obj)`.
  Verified: artifact bytes restored and the preview renders.
  (`server/src/index.ts`, `server/src/agents/files.ts`, `server/src/tools/index.ts`)
- **Chat send blocked with the text stuck in the box.** Sending is now optimistic:
  the message appears immediately, the input clears, and an "AI replying…"
  indicator shows while the reply generates. **Enter sends, Shift+Enter newlines.**
  (`web/.../workroom/Workroom.tsx`)
- **Artifacts folder hierarchy + closeable preview.** The Saved-artifacts list is
  grouped by directory, and the preview pane has a close (×) button.
- **Work cards always failed: the in-sandbox runner never executed.**
  `envdRunCommand` POSTed a non-enveloped `JSON.stringify(...)` body to
  `process.Process/Start`, which is a Connect **server-streaming** RPC and
  requires a length-prefixed envelope (`[flag][4-byte BE length][payload]`).
  envd read the JSON's first bytes as the length ("promised N bytes"), returned
  HTTP 200 with an error frame, and the app parsed zero events → silent no-op
  with `exitCode 0`. So `nohup python3 runner.py &` never ran → no callback →
  15-min stuck-reaper marked the card failed. Now the request body is properly
  enveloped. (`server/src/sandbox/e2b.ts`) Verified live: runner advances
  starting→running and produces output files.
- **Runner callback was 403'd by Cloudflare WAF.** `runner.py` posted its
  completion callback with the default `Python-urllib/x` User-Agent, which the
  WAF in front of the Worker blocks (403). The card then hung until the reaper
  failed it. Runner now sends `User-Agent: Missionry-Runner/1.0` on both the
  callback and OpenAI calls. (`server/src/runtime/agentRunner.ts`) Verified
  live: custom UA reaches the webhook (404 card-not-found), default UA → 403.
- **Process exit codes were misread.** `collectProcessEvent` only looked for
  `exitCode`/`exit_code`, but envd emits `{ exited, status: "exit status N" }`;
  now parses the numeric code from `status` too. (`server/src/sandbox/e2b.ts`)

- **Idle reaper froze in-flight tasks.** `listIdleSandboxes` now skips any
  mission that has a work card in `running`/`allocated`/`assigned`. The agent
  runner executes *inside* the E2B sandbox, so pausing an active sandbox froze
  the task (card stuck "running" forever) and made its files disappear from the
  Artifacts view. (`server/src/state/missionState.ts`)
- **Sandbox idle timeout was 45s.** Raised `MISSIONRY_IDLE_MS` to `300000`
  (5 min) so sandboxes don't pause out from under an active task or a user
  browsing artifacts.
- **Chat messages rendered newest-first.** `GET /missions/:id/chat` now returns
  messages ascending (oldest→newest) so the transcript renders newest at the
  bottom, matching the optimistic-update sort and the column layout. Previously a
  later agent reply appeared above an earlier user message.
  (`server/src/index.ts`)
- **Chat didn't auto-scroll to the newest message.** The team-chat panel now
  pins to the bottom as messages arrive. (`web/src/components/magicpath/workroom/Workroom.tsx`)
- **Artifacts (产物) tab layout.** `.mp-file-browser` now packs rows to the top
  (`align-content: start`) and the file area fills the panel, removing the large
  empty gap that pushed "任务文件" into the vertical center. (`web/src/index.css`)

### Operational
- Cleared stuck/test missions from production and re-queued the frozen
  "写一个言情小说" cards after deploying the reaper fix.
