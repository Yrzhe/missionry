import { secret, vars } from "edgespark";
import { assertUserBudgetForMission, updateMission, upsertSandboxRuntime, type SandboxRef } from "../state/missionState";

type SandboxTarget = "mission" | "private";

type MemorySandbox = {
  id: string;
  files: Map<string, string>;
  state: "running" | "paused";
};

const memorySandboxes = new Map<string, MemorySandbox>();

function keyFor(missionId: string, target: SandboxTarget, instanceId?: string) {
  return target === "mission" ? `mission:${missionId}` : `agent:${missionId}:${instanceId}`;
}

async function useMemoryMode() {
  const mode = vars.get("DEMO_E2B_MODE");
  const apiKey = await secret.get("E2B_API_KEY");
  return mode === "memory" || !apiKey;
}

async function assertRunnableWorkerMode() {
  if (await useMemoryMode()) return;
  throw new Error("error.e2b.real_path_not_implemented_use_REST_API_via_fetch_in_phase2");
}

async function ensureMemorySandbox(id: string): Promise<MemorySandbox> {
  let sandbox = memorySandboxes.get(id);
  if (!sandbox) {
    sandbox = { id, files: new Map(), state: "running" };
    sandbox.files.set("/workspace/README.md", `# ${id}\n`);
    memorySandboxes.set(id, sandbox);
  }
  sandbox.state = "running";
  return sandbox;
}

export async function startShared(missionId: string): Promise<SandboxRef> {
  return startOrResume({ missionId, target: "mission" });
}

export async function startPrivate(missionId: string, instanceId: string): Promise<SandboxRef> {
  return startOrResume({ missionId, instanceId, target: "private" });
}

export async function resume(missionId: string, target: SandboxTarget, instanceId?: string): Promise<SandboxRef> {
  return startOrResume({ missionId, instanceId, target });
}

async function startOrResume(input: { missionId: string; instanceId?: string; target: SandboxTarget }): Promise<SandboxRef> {
  await assertUserBudgetForMission(input.missionId, 1);
  await assertRunnableWorkerMode();
  const sandboxId = keyFor(input.missionId, input.target, input.instanceId);
  await ensureMemorySandbox(sandboxId);
  const timestamp = new Date().toISOString();
  const ref: SandboxRef = {
    sandboxId,
    tier: input.target,
    ownerInstanceId: input.instanceId,
    state: "running",
    e2bSandboxId: sandboxId,
    lastActivityAt: timestamp,
    activeSince: timestamp,
    burnRateCentsPerMinute: 0.45,
    environmentVersionId: "env_v1",
    injectedCredentialIds: [],
    injectedVariableKeys: ["MISSION_ID"],
    environmentAccessMode: "inherit",
  };

  await updateMission(input.missionId, (mission) => {
    if (input.target === "mission") mission.stateJson.sharedSandbox = ref;
    else mission.stateJson.privateSandboxes[input.instanceId ?? "unknown"] = ref;
    return mission;
  });
  await upsertSandboxRuntime(ref, input.missionId);
  return ref;
}

export async function runCommand(ref: SandboxRef, command: string) {
  await assertRunnableWorkerMode();
  await ensureMemorySandbox(ref.sandboxId);
  await touchSandbox(ref);
  if (command.trim() === "false") return { exitCode: 1, stdout: "", stderr: "command exited with 1\n" };
  return {
    exitCode: 0,
    stdout: command === "pwd" ? "/workspace\n" : `demo:${ref.sandboxId}$ ${command}\n`,
    stderr: "",
  };
}

export async function writeFile(ref: SandboxRef, path: string, content: string) {
  await assertRunnableWorkerMode();
  const sandbox = await ensureMemorySandbox(ref.sandboxId);
  sandbox.files.set(path, content);
  await touchSandbox(ref);
}

export async function readFile(ref: SandboxRef, path: string) {
  await assertRunnableWorkerMode();
  const sandbox = await ensureMemorySandbox(ref.sandboxId);
  await touchSandbox(ref);
  const value = sandbox.files.get(path);
  if (value === undefined) throw new Error("error.file.not_found");
  return value;
}

export async function pauseIfIdle(ref: SandboxRef) {
  await assertRunnableWorkerMode();
  const sandbox = await ensureMemorySandbox(ref.sandboxId);
  sandbox.state = "paused";
  const paused = { ...ref, state: "paused" as const, burnRateCentsPerMinute: 0 };
  await upsertSandboxRuntime(paused, missionIdFor(ref));
  return paused;
}

async function touchSandbox(ref: SandboxRef) {
  const missionId = missionIdFor(ref);
  const timestamp = new Date().toISOString();
  const next = { ...ref, lastActivityAt: timestamp };
  await updateMission(missionId, (mission) => {
    if (next.tier === "mission") mission.stateJson.sharedSandbox = next;
    if (next.tier === "private" && next.ownerInstanceId) mission.stateJson.privateSandboxes[next.ownerInstanceId] = next;
    return mission;
  });
  await upsertSandboxRuntime(next, missionId);
}

function missionIdFor(ref: SandboxRef) {
  return ref.sandboxId.split(":")[1];
}
