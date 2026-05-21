# Missionry Server

EdgeSpark backend for Missionry. Public product routes live under `/api/public/*`.

## Run

```bash
cd missionry/server
cp ../.env.example .env
# Local no-E2B smoke:
#   DEMO_E2B_MODE=memory
#   EDGESPARK_ENV=development
#   EDGESPARK_DEV_AS_ADMIN=true
# Live sandbox mode:
#   DEMO_E2B_MODE=live
#   E2B_API_KEY=<dashboard key>
#   INTERNAL_REAP_TOKEN=<shared secret for /api/public/internal/reap>
#   MISSIONRY_SUPER_ADMIN_USER_IDS=<comma-separated better-auth user ids>

npm install
edgespark init --here
edgespark storage apply
edgespark db migrate
edgespark dev --port 7775
```

Health:

```bash
curl http://localhost:7775/api/public/health
```

Current user:

```bash
curl http://localhost:7775/api/public/me
```

## Golden Path Smoke

```bash
npm test
```

The smoke starts `edgespark dev` in memory mode, creates a user-owned Mission,
verifies an auto Leader agent instance, decomposes proposed work cards, starts one
card, checks events, and reads the file written in `/workspace/work-cards/`.

## API Examples

Create a Mission. User-owned missions automatically receive a default Leader
agent (`agt_forge`) unless `leaderAgentId` is supplied.

```bash
curl -s -X POST http://localhost:7775/api/public/missions \
  -H 'content-type: application/json' \
  -d '{"title":"Demo","objective":"Write a verifiable workspace file","owner":{"type":"user"},"dailyBudgetCents":500}'
```

Generate proposed work cards:

```bash
curl -s -X POST http://localhost:7775/api/public/missions/<MISSION_ID>/decompose
```

Start a proposed/approved/queued card:

```bash
curl -s -X POST http://localhost:7775/api/public/missions/<MISSION_ID>/work-cards/<WORK_CARD_ID>/start
```

Inspect Workroom, events, and files:

```bash
curl -s http://localhost:7775/api/public/missions/<MISSION_ID>/workroom
curl -s http://localhost:7775/api/public/missions/<MISSION_ID>/events
curl -s 'http://localhost:7775/api/public/missions/<MISSION_ID>/sandbox/files?path='
curl -s 'http://localhost:7775/api/public/missions/<MISSION_ID>/sandbox/file?path=work-cards/<WORK_CARD_ID>.md'
```

Create or reuse a direct thread for an AgentInstance:

```bash
curl -s -X POST http://localhost:7775/api/public/missions/<MISSION_ID>/agent-instances/<INSTANCE_ID>/direct-thread
```

Trigger the idle reaper:

```bash
curl -s -X POST http://localhost:7775/api/public/internal/reap \
  -H 'x-internal-token: <INTERNAL_REAP_TOKEN>'
```

## Public Contract Notes

- `GET /api/public/missions/:id/events` returns `{ items }`, newest first. Each item has `{ type, missionId, auditEventId?, actor?, authorName, actionLabel, payload, occurredAt }`.
- `GET /api/public/missions/:id/sandbox/files` accepts workspace-relative `path` (`""` for root, `docs` for `/workspace/docs`) and returns `{ path, state, entries }`.
- File entries have `{ name, path, displayPath?, type, size? }`; `path` is workspace-relative and can be passed directly to `/sandbox/file`.
- File entry `type` values are exactly `dir | file`.
- `GET /api/public/missions/:id/sandbox/file` accepts workspace-relative `path` and returns `{ path, state, content }`.
- `POST /api/public/missions/:id/work-cards/:workCardId/start` returns `{ actionId, status, workCard, workroom }`.
- `POST /api/public/missions/:id/agent-instances/:instanceId/direct-thread` returns `{ actionId, status, chatThreadId, created, auditEventId? }`.
- Pixel should trust `workroom.metricStrip.missionSpendCents` as the authoritative spend total.
