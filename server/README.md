# Missionry Server Phase 1

EdgeSpark backend demo for the Missionry v0.5 contract.

## Run

```bash
cd missionry/server
cp ../.env.example .env
# Fill E2B_API_KEY and OPENAI_API_KEY when you want real integrations.
# Leave DEMO_E2B_MODE=memory or omit E2B_API_KEY for the local no-E2B smoke path.

npm install
edgespark init --here
edgespark storage apply
edgespark db migrate
edgespark dev
```

Health:

```bash
curl http://localhost:8787/api/health
```

## Demo Script

Create three real Missions owned by the same global Agent. Each creation reserves
the shared sandbox slot as `mission:<id>` with `state: none`; no E2B runtime is
created yet.

```bash
curl -s -X POST http://localhost:8787/api/missions \
  -H 'content-type: application/json' \
  -d '{"title":"Demo A","objective":"Prove lazy slot A","owner":{"type":"agent","agentId":"agt_forge"},"dailyBudgetCents":500}'

curl -s -X POST http://localhost:8787/api/missions \
  -H 'content-type: application/json' \
  -d '{"title":"Demo B","objective":"Prove queue B","owner":{"type":"agent","agentId":"agt_forge"},"dailyBudgetCents":500}'

curl -s -X POST http://localhost:8787/api/missions \
  -H 'content-type: application/json' \
  -d '{"title":"Demo C","objective":"Prove queue C","owner":{"type":"agent","agentId":"agt_forge"},"dailyBudgetCents":500}'
```

List Missions and inspect Workroom. Use the returned Mission id. The first card
for `agt_forge` is `running`; later cards are `pending` because the global Agent
is single-tasking across Missions.

```bash
curl -s 'http://localhost:8787/api/missions?ownerAgentId=agt_forge'
curl -s http://localhost:8787/api/missions/<MISSION_ID>/workroom
```

Attach another AgentInstance if needed. This reserves a private sandbox slot as
`agent:<missionId>:<instanceId>` with `state: none`.

```bash
curl -s -X POST http://localhost:8787/api/missions/<MISSION_ID>/agents/agt_pixel/instances
```

Lazy-start Tier 1 shared sandbox with a sandbox-backed tool call.

```bash
curl -s -X POST http://localhost:8787/api/missions/<MISSION_ID>/work-cards \
  -H 'content-type: application/json' \
  -d '{"title":"Run shared pwd","assigneeInstanceId":"ins_<MISSION_ID>_forge","sandboxAffinity":{"tier":"mission","reason":"demo"},"demoAction":"run_shared","command":"pwd"}'
```

Agent B writes a shared file into the same Tier 1 sandbox.

```bash
curl -s -X POST http://localhost:8787/api/missions/<MISSION_ID>/work-cards \
  -H 'content-type: application/json' \
  -d '{"title":"Write shared file","assigneeInstanceId":"ins_<MISSION_ID>_pixel","sandboxAffinity":{"tier":"mission","reason":"demo"},"demoAction":"write_shared","path":"/workspace/shared.txt","content":"visible to both agents"}'
```

Agent A reads the shared file.

```bash
curl -s -X POST http://localhost:8787/api/missions/<MISSION_ID>/work-cards \
  -H 'content-type: application/json' \
  -d '{"title":"Read shared file","assigneeInstanceId":"ins_<MISSION_ID>_forge","sandboxAffinity":{"tier":"mission","reason":"demo"},"demoAction":"read_shared","path":"/workspace/shared.txt"}'
```

Escalate Agent A to Tier 2 private and write a private file.

```bash
curl -s -X POST http://localhost:8787/api/missions/<MISSION_ID>/work-cards \
  -H 'content-type: application/json' \
  -d '{"title":"Private escalation","assigneeInstanceId":"ins_<MISSION_ID>_forge","sandboxAffinity":{"tier":"private","reason":"demo isolation"},"demoAction":"escalate_private","path":"/workspace/private.txt","content":"private to Forge"}'
```

Mark the running card done to promote the oldest pending card for `agt_forge`
across Missions.

```bash
curl -s -X PATCH http://localhost:8787/api/missions/<MISSION_ID>/work-cards/<RUNNING_WORK_CARD_ID> \
  -H 'content-type: application/json' \
  -d '{"status":"done"}'
```

Trigger the idle reaper after `MISSIONRY_IDLE_MS` has elapsed. In deployed demo, an external cron should call this every 30 seconds.

```bash
curl -s -X POST http://localhost:8787/api/internal/reap
```

Watch live cost events:

```bash
curl -N http://localhost:8787/api/missions/<MISSION_ID>/events
```

Expected signals:

- Mission creation reserves `mission:<id>` with `state: none` and $0 burn.
- Agent attach reserves `agent:<missionId>:<instanceId>` with `state: none`.
- `run_shared` starts `mission:<id>`.
- `write_shared` and `read_shared` use the same shared sandbox.
- `escalate_private` starts `agent:<missionId>:ins_<missionId>_forge`.
- `POST /api/internal/reap` pauses both after idle and writes:
  - `missions/<missionId>/snapshots/shared/latest.json`
  - `missions/<missionId>/snapshots/private/<instanceId>/latest.json`
- SSE emits `cost_event` and `sandbox_burn`.

Legacy instant seed remains available:

```bash
curl -s -X POST http://localhost:8787/api/missions/demo \
  -H 'content-type: application/json' \
  -d '{"missionId":"mis_demo"}'
```
