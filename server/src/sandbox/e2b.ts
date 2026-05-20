import type { EdgeSparkDb, EdgeSparkSecret, EdgeSparkStorage, EdgeSparkVars } from "../defs/runtime";
import { updateMission, type SandboxRef } from "../state/missionState";

type SandboxTarget = "mission" | "private";

type MemorySandbox = {
  id: string;
  files: Map<string, string>;
  state: "running" | "paused";
};

const memorySandboxes = new Map<string, MemorySandbox>();

type E2BContext = {
  db: EdgeSparkDb;
  storage: EdgeSparkStorage;
  secret: EdgeSparkSecret;
  vars: EdgeSparkVars;
};

function keyFor(missionId: string, target: SandboxTarget, instanceId?: string) {
  return target === "mission" ? `mission:${missionId}` : `agent:${missionId}:${instanceId}`;
}

async function useMemoryMode(secret: EdgeSparkSecret, vars: EdgeSparkVars) {
  const mode = vars.get("DEMO_E2B_MODE");
  const apiKey = await secret.get("E2B_API_KEY");
  return mode === "memory" || !apiKey;
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

export async function startShared(ctx: E2BContext, missionId: string): Promise<SandboxRef> {
  return startOrResume(ctx, { missionId, target: "mission" });
}

export async function startPrivate(ctx: E2BContext, missionId: string, instanceId: string): Promise<SandboxRef> {
  return startOrResume(ctx, { missionId, instanceId, target: "private" });
}

export async function resume(ctx: E2BContext, missionId: string, target: SandboxTarget, instanceId?: string): Promise<SandboxRef> {
  return startOrResume(ctx, { missionId, instanceId, target });
}

async function startOrResume(
  ctx: E2BContext,
  input: { missionId: string; instanceId?: string; target: SandboxTarget },
): Promise<SandboxRef> {
  const sandboxId = keyFor(input.missionId, input.target, input.instanceId);
  let e2bSandboxId = sandboxId;
  if (await useMemoryMode(ctx.secret, ctx.vars)) {
    await ensureMemorySandbox(sandboxId);
  } else {
    const mod = (await import("@e2b/sdk")) as Record<string, unknown>;
    const Sandbox = mod.Sandbox as { create?: (opts?: unknown) => Promise<{ sandboxId?: string; id?: string }> };
    const created = Sandbox?.create ? await Sandbox.create({ apiKey: await ctx.secret.get("E2B_API_KEY") }) : undefined;
    e2bSandboxId = created?.sandboxId ?? created?.id ?? sandboxId;
  }

  const now = new Date().toISOString();
  const ref: SandboxRef = {
    sandboxId,
    tier: input.target,
    ownerInstanceId: input.instanceId,
    state: "running",
    e2bSandboxId,
    lastActivityAt: now,
    activeSince: now,
    burnRateCentsPerMinute: input.target === "mission" ? 0.45 : 0.45,
    environmentVersionId: "env_v1",
    injectedCredentialIds: [],
    injectedVariableKeys: ["MISSION_ID"],
    environmentAccessMode: "inherit",
  };

  await updateMission(ctx.db, input.missionId, (mission) => {
    if (input.target === "mission") mission.stateJson.sharedSandbox = ref;
    else mission.stateJson.privateSandboxes[input.instanceId ?? "unknown"] = ref;
    mission.burnRateCentsPerMinute = Object.values(mission.stateJson.privateSandboxes)
      .filter((item) => item.state === "running")
      .reduce((sum, item) => sum + item.burnRateCentsPerMinute, mission.stateJson.sharedSandbox.state === "running" ? mission.stateJson.sharedSandbox.burnRateCentsPerMinute : 0);
    return mission;
  });
  return ref;
}

export async function runCommand(ctx: E2BContext, ref: SandboxRef, command: string) {
  if (await useMemoryMode(ctx.secret, ctx.vars)) {
    await ensureMemorySandbox(ref.sandboxId);
    return {
      exitCode: 0,
      stdout: command === "pwd" ? "/workspace\n" : `demo:${ref.sandboxId}$ ${command}\n`,
      stderr: "",
    };
  }
  return { exitCode: 0, stdout: "e2b command submitted\n", stderr: "" };
}

export async function writeFile(ctx: E2BContext, ref: SandboxRef, path: string, content: string) {
  const sandbox = await ensureMemorySandbox(ref.sandboxId);
  sandbox.files.set(path, content);
  await touchSandbox(ctx.db, ref);
}

export async function readFile(ctx: E2BContext, ref: SandboxRef, path: string) {
  const sandbox = await ensureMemorySandbox(ref.sandboxId);
  await touchSandbox(ctx.db, ref);
  const value = sandbox.files.get(path);
  if (value === undefined) throw new Error("error.file.not_found");
  return value;
}

export async function pauseIfIdle(ctx: E2BContext, ref: SandboxRef) {
  const sandbox = await ensureMemorySandbox(ref.sandboxId);
  sandbox.state = "paused";
  return { ...ref, state: "paused" as const, burnRateCentsPerMinute: 0 };
}

async function touchSandbox(db: EdgeSparkDb, ref: SandboxRef) {
  const missionId = ref.sandboxId.split(":")[1];
  const now = new Date().toISOString();
  await updateMission(db, missionId, (mission) => {
    if (ref.tier === "mission") mission.stateJson.sharedSandbox.lastActivityAt = now;
    if (ref.tier === "private" && ref.ownerInstanceId) mission.stateJson.privateSandboxes[ref.ownerInstanceId].lastActivityAt = now;
    return mission;
  });
}
