# Changelog

All notable changes to Missionry are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/); this project
uses date-based entries.

## [Unreleased]

### Added
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
