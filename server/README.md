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

Create the first Mission. This seeds two demo Agents and two WorkCards.

```bash
curl -s -X POST http://localhost:8787/api/missions \
  -H 'content-type: application/json' \
  -d '{"missionId":"mis_demo"}'
```

Read Workroom. It should show no running sandbox initially.

```bash
curl -s http://localhost:8787/api/missions/mis_demo/workroom
```

Lazy-start Tier 1 shared sandbox with Agent A.

```bash
curl -s -X POST http://localhost:8787/api/missions/mis_demo/work-cards \
  -H 'content-type: application/json' \
  -d '{"title":"Run shared pwd","assigneeInstanceId":"ins_mis_demo_forge","sandboxAffinity":{"tier":"mission","reason":"demo"},"demoAction":"run_shared","command":"pwd"}'
```

Agent B writes a shared file into the same Tier 1 sandbox.

```bash
curl -s -X POST http://localhost:8787/api/missions/mis_demo/work-cards \
  -H 'content-type: application/json' \
  -d '{"title":"Write shared file","assigneeInstanceId":"ins_mis_demo_pixel","sandboxAffinity":{"tier":"mission","reason":"demo"},"demoAction":"write_shared","path":"/workspace/shared.txt","content":"visible to both agents"}'
```

Agent A reads the shared file.

```bash
curl -s -X POST http://localhost:8787/api/missions/mis_demo/work-cards \
  -H 'content-type: application/json' \
  -d '{"title":"Read shared file","assigneeInstanceId":"ins_mis_demo_forge","sandboxAffinity":{"tier":"mission","reason":"demo"},"demoAction":"read_shared","path":"/workspace/shared.txt"}'
```

Escalate Agent A to Tier 2 private and write a private file.

```bash
curl -s -X POST http://localhost:8787/api/missions/mis_demo/work-cards \
  -H 'content-type: application/json' \
  -d '{"title":"Private escalation","assigneeInstanceId":"ins_mis_demo_forge","sandboxAffinity":{"tier":"private","reason":"demo isolation"},"demoAction":"escalate_private","path":"/workspace/private.txt","content":"private to Forge"}'
```

Create a second Mission to inspect isolation by separate D1 rows and R2 prefixes.

```bash
curl -s -X POST http://localhost:8787/api/missions \
  -H 'content-type: application/json' \
  -d '{"missionId":"mis_demo_2"}'

curl -s http://localhost:8787/api/missions/mis_demo_2/workroom
```

Trigger the idle reaper after `MISSIONRY_IDLE_MS` has elapsed. In deployed demo, an external cron should call this every 30 seconds.

```bash
curl -s -X POST http://localhost:8787/api/internal/reap
```

Watch live cost events:

```bash
curl -N http://localhost:8787/api/missions/mis_demo/events
```

Expected signals:

- `run_shared` starts `mission:mis_demo`.
- `write_shared` and `read_shared` use the same shared sandbox.
- `escalate_private` starts `agent:mis_demo:ins_mis_demo_forge`.
- `POST /api/internal/reap` pauses both after idle and writes:
  - `missions/mis_demo/snapshots/shared/latest.json`
  - `missions/mis_demo/snapshots/private/ins_mis_demo_forge/latest.json`
- SSE emits `cost_event` and `sandbox_burn`.
