import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const port = Number(process.env.MISSIONRY_TEST_PORT ?? 7795);
const base = `http://127.0.0.1:${port}/api/public`;
const cwd = fileURLToPath(new URL("..", import.meta.url));
let logs = "";
const env = {
  ...process.env,
  EDGESPARK_ENV: "development",
  EDGESPARK_DEV_AS_ADMIN: "true",
  DEMO_E2B_MODE: "memory",
  MISSIONRY_FORCE_MOCK_AI: "true",
  INTERNAL_REAP_TOKEN: "test-reap-token",
  E2B_API_KEY: "",
  OPENAI_API_KEY: "",
};

function sqlite(args, options = {}) {
  const result = spawnSync("sqlite3", args, { cwd, encoding: "utf8", ...options });
  if (result.status !== 0) {
    throw new Error(`sqlite3 ${args.join(" ")} failed\n${result.stdout}\n${result.stderr}`);
  }
  return result.stdout.trim();
}

function localD1Files() {
  const d1Dir = join(cwd, ".edgespark", "state", "d1", "miniflare-D1DatabaseObject");
  if (!existsSync(d1Dir)) return [];
  return readdirSync(d1Dir)
    .filter((name) => name.endsWith(".sqlite") && name !== "metadata.sqlite")
    .map((name) => join(d1Dir, name));
}

async function waitForLocalD1File(childProcess) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const files = localD1Files();
    if (files.length > 0) return files;
    if (childProcess.exitCode !== null) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`local D1 file was not created\n\n${logs.slice(-4000)}`);
}

function hasMissionsTable(file) {
  const output = sqlite([file, "select name from sqlite_master where type='table' and name='missions';"]);
  return output === "missions";
}

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function missionryDbFile() {
  const file = localD1Files().find(hasMissionsTable);
  if (!file) throw new Error("missionry local D1 file not found");
  return file;
}

function applyLocalMigrations(files) {
  const migrationDir = join(cwd, "drizzle");
  const migrations = readdirSync(migrationDir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => readFileSync(join(migrationDir, name), "utf8"))
    .join("\n");
  for (const file of files) {
    if (!hasMissionsTable(file)) sqlite([file], { input: migrations });
  }
}

async function ensureLocalD1Schema() {
  let files = localD1Files();
  if (files.length === 0) {
    const bootstrap = spawn("edgespark", ["dev", "--port", String(port), "--reset"], {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    bootstrap.stdout.on("data", (chunk) => { logs += chunk.toString(); });
    bootstrap.stderr.on("data", (chunk) => { logs += chunk.toString(); });
    try {
      files = await waitForLocalD1File(bootstrap);
    } finally {
      if (bootstrap.exitCode === null) {
        bootstrap.kill("SIGTERM");
        await new Promise((resolve) => bootstrap.once("exit", resolve));
      }
    }
  }
  applyLocalMigrations(files);
}

await ensureLocalD1Schema();

const child = spawn("edgespark", ["dev", "--port", String(port)], {
  cwd,
  env,
  stdio: ["ignore", "pipe", "pipe"],
});
child.stdout.on("data", (chunk) => { logs += chunk.toString(); });
child.stderr.on("data", (chunk) => { logs += chunk.toString(); });

async function request(path, init = {}) {
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`${init.method ?? "GET"} ${path} -> ${response.status}: ${text}\n\n${logs.slice(-4000)}`);
  }
  return body;
}

async function waitForServer() {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      await request("/health");
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw new Error(`server did not start\n\n${logs.slice(-8000)}`);
}

async function waitForCompletedCard(missionId) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const workroom = await request(`/missions/${missionId}/workroom`);
    const card = workroom.workCards.find((item) => item.status === "done") ?? workroom.workCards.find((item) => item.status === "running");
    if (card) return card;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`mission did not auto-run a work card\n\n${logs.slice(-4000)}`);
}

try {
  await waitForServer();

  const mission = await request("/missions", {
    method: "POST",
    body: JSON.stringify({
      title: "Golden path smoke",
      objective: "Write a verifiable file from a started work card.",
      owner: { type: "user" },
      dailyBudgetCents: 500,
    }),
  });
  assert.match(mission.missionId, /^mis_/);
  assert.match(mission.leaderInstanceId, /^ins_/);

  const agentRequestId = `agr_smoke_${Date.now()}`;
  const requestPayload = {
    role: "QA agent",
    displayName: "Smoke QA",
    reason: "Verify the request approval path.",
    requestedByAgentId: "agt_forge",
    requestedByInstanceId: mission.leaderInstanceId,
    missionId: mission.missionId,
  };
  sqlite([
    missionryDbFile(),
    [
      "insert into growth_candidates (id,type,title,rationale,evidence_event_ids_json,source_mission_ids_json,scope,status,estimated_future_cost_hint,created_at,enabled_at,enabled_by) values (",
      [
        sqlString(agentRequestId),
        sqlString("agent_request"),
        sqlString("Smoke QA"),
        sqlString(JSON.stringify(requestPayload)),
        sqlString("[]"),
        sqlString(JSON.stringify([mission.missionId])),
        sqlString("mission"),
        sqlString("pending"),
        "null",
        sqlString(new Date().toISOString()),
        "null",
        "null",
      ].join(","),
      ");",
    ].join(""),
  ]);
  const agentRequests = await request(`/missions/${mission.missionId}/agent-requests`);
  assert.ok(agentRequests.items.some((item) => item.id === agentRequestId && item.status === "pending"));
  const approvedRequest = await request(`/missions/${mission.missionId}/agent-requests/${agentRequestId}/approve`, { method: "POST", body: JSON.stringify({}) });
  assert.equal(approvedRequest.request.status, "approved");
  assert.match(approvedRequest.agent.id, /^agt_/);
  assert.match(approvedRequest.instanceId, /^ins_/);

  const decomposition = await request(`/missions/${mission.missionId}/decompose`, { method: "POST" });
  assert.equal(decomposition.mock, true);
  assert.ok(decomposition.created.length >= 1);
  assert.equal(decomposition.created[0].status, "queued");

  const completed = await waitForCompletedCard(mission.missionId);
  assert.match(completed.status, /^(running|done)$/);
  const workCardId = completed.id;

  const events = await request(`/missions/${mission.missionId}/events`);
  assert.ok(events.items.some((event) => ["work_card_completed", "sandbox_burn", "sandbox_burn_recorded"].includes(event.type)));

  const files = await request(`/missions/${mission.missionId}/sandbox/files?path=work-cards`);
  assert.equal(files.state, "running");
  assert.ok(files.entries.some((entry) => entry.name === `${workCardId}.md` && entry.path === `work-cards/${workCardId}.md` && entry.type === "file"));

  const file = await request(`/missions/${mission.missionId}/sandbox/file?path=work-cards/${workCardId}.md`);
  assert.equal(file.state, "running");
  assert.match(file.content, /Golden path|Clarify execution plan|workspace/i);

  const deleted = await request(`/missions/${mission.missionId}`, { method: "DELETE" });
  assert.equal(deleted.deleted, true);
  assert.equal(deleted.status, "completed");
  const deletedWorkroom = await request(`/missions/${mission.missionId}/workroom`);
  assert.equal(deletedWorkroom.mission.status, "deleted");
  assert.ok(deletedWorkroom.workCards.every((item) => item.status === "cancelled"));
  const listAfterDelete = await request("/missions");
  assert.ok(!listAfterDelete.items.some((item) => item.id === mission.missionId || item.missionId === mission.missionId));
} finally {
  child.kill("SIGTERM");
}
