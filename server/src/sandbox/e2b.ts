import { secret, vars } from "edgespark";
import { db } from "edgespark";
import { and, eq } from "drizzle-orm";
import { agentInstances, sandboxRuntime } from "../defs/db_schema";
import { assertSafeId, assertSafeRelativePath } from "../lib/safe-paths";
import { assertUserBudgetForMission, getMission, updateMission, upsertSandboxRuntime, type SandboxRef } from "../state/missionState";

type SandboxTarget = "mission" | "private";

type MemorySandbox = {
  id: string;
  files: Map<string, string>;
  state: "running" | "paused";
};

type E2BCreateResponse = {
  sandboxID?: string;
  sandboxId?: string;
  envdAccessToken?: string | null;
  domain?: string | null;
  state?: string;
  lastActivityAt?: string;
};

const E2B_API_BASE = "https://api.e2b.app";
const DEFAULT_ENVD_PORT = 49983;
export const WORKSPACE_ROOT = "/workspace";
const memorySandboxes = new Map<string, MemorySandbox>();

function keyFor(missionId: string, target: SandboxTarget, instanceId?: string) {
  return target === "mission" ? `mission:${missionId}` : `agent:${missionId}:${instanceId}`;
}

export async function assertInstanceInMission(missionId: string, instanceId: string): Promise<void> {
  missionId = assertSafeId(missionId, "mission_id");
  instanceId = assertSafeId(instanceId, "instance_id");
  const [row] = await db
    .select({ id: agentInstances.id })
    .from(agentInstances)
    .where(and(eq(agentInstances.id, instanceId), eq(agentInstances.missionId, missionId)))
    .limit(1);
  if (!row) throw new Error("error.mission.access_denied");
}

async function e2bApiKey() {
  return Promise.resolve(secret.get("E2B_API_KEY")).catch(() => undefined);
}

export async function useMemoryMode() {
  const mode = vars.get("DEMO_E2B_MODE");
  const apiKey = await e2bApiKey();
  return mode === "memory" || !apiKey;
}

function isE2bNotFound(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("error.e2b.request_failed:404") || /not[-_\s]?found|expired/i.test(message);
}

async function ensureMemorySandbox(id: string): Promise<MemorySandbox> {
  let sandbox = memorySandboxes.get(id);
  if (!sandbox) {
    sandbox = { id, files: new Map(), state: "running" };
    memorySandboxes.set(id, sandbox);
  }
  sandbox.state = "running";
  return sandbox;
}

async function e2bFetch(path: string, init: RequestInit = {}) {
  const apiKey = await e2bApiKey();
  if (!apiKey) throw new Error("error.e2b.api_key_missing");
  const response = await fetch(`${E2B_API_BASE}${path}`, {
    ...init,
    headers: {
      "X-API-Key": apiKey,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (response.status === 204) return null;
  const contentType = response.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json") ? await response.json().catch(() => ({})) : await response.text().catch(() => "");
  if (!response.ok) {
    const message = typeof body === "object" && body && "message" in body ? String((body as { message?: unknown }).message) : String(body || response.status);
    throw new Error(`error.e2b.request_failed:${response.status}:${message}`);
  }
  return body;
}

function envdHostFor(sandboxID: string) {
  return `https://${DEFAULT_ENVD_PORT}-${sandboxID}.e2b.app`;
}

function basicUserHeader(username = "user") {
  const value = `${username}:`;
  if (typeof btoa === "function") return `Basic ${btoa(value)}`;
  const buffer = (globalThis as unknown as { Buffer?: { from(input: string): { toString(encoding: string): string } } }).Buffer;
  return `Basic ${buffer?.from(value).toString("base64") ?? value}`;
}

function decodeBase64Text(value: unknown) {
  if (typeof value !== "string") return "";
  try {
    const binary = typeof atob === "function" ? atob(value) : (globalThis as any).Buffer?.from(value, "base64").toString("binary");
    if (typeof binary !== "string") return value;
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return value;
  }
}

function normalizeWorkspaceRelativePath(path: string | undefined | null) {
  const raw = String(path ?? "").trim();
  if (!raw || raw === "." || raw === WORKSPACE_ROOT) return "";
  const withoutRoot = raw.startsWith(`${WORKSPACE_ROOT}/`) ? raw.slice(WORKSPACE_ROOT.length + 1) : raw;
  if (withoutRoot.startsWith("/")) throw new Error("error.path.relative_invalid");
  return assertSafeRelativePath(withoutRoot);
}

function workspacePath(path: string | undefined | null) {
  const relative = normalizeWorkspaceRelativePath(path);
  return relative ? `${WORKSPACE_ROOT}/${relative}` : WORKSPACE_ROOT;
}

function pathFromWorkspace(path: string | undefined | null) {
  const normalized = String(path ?? "").replace(/\/+/g, "/").replace(/\/$/, "");
  if (!normalized || normalized === WORKSPACE_ROOT) return "";
  if (normalized.startsWith(`${WORKSPACE_ROOT}/`)) return assertSafeRelativePath(normalized.slice(WORKSPACE_ROOT.length + 1));
  return normalizeWorkspaceRelativePath(normalized);
}

function joinRelative(dir: string, name: string) {
  const safeName = assertSafeRelativePath(name);
  return dir ? assertSafeRelativePath(`${dir}/${safeName}`) : safeName;
}

function requireEnvd(ref: SandboxRef) {
  if (!ref.e2bSandboxId) throw new Error("error.e2b.sandbox_id_missing");
  if (!ref.envdAccessToken) throw new Error("error.e2b.envd_access_token_missing");
  return {
    host: ref.envdHost || envdHostFor(ref.e2bSandboxId),
    token: ref.envdAccessToken,
  };
}

async function envdFetch(ref: SandboxRef, path: string, init: RequestInit = {}) {
  const envd = requireEnvd(ref);
  const response = await fetch(`${envd.host}${path}`, {
    ...init,
    headers: {
      "X-Access-Token": envd.token,
      ...(init.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
  });
  const contentType = response.headers.get("content-type") ?? "";
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`error.e2b.envd_request_failed:${response.status}:${body || response.statusText}`);
  }
  if (contentType.includes("application/json") || contentType.includes("application/connect+json")) return response.json().catch(() => ({}));
  return response.text();
}

async function envdRunCommand(ref: SandboxRef, command: string, cwd = WORKSPACE_ROOT, options: { throwOnNonZero?: boolean } = {}) {
  const envd = requireEnvd(ref);
  const response = await fetch(`${envd.host}/process.Process/Start`, {
    method: "POST",
    headers: {
      "X-Access-Token": envd.token,
      "Authorization": basicUserHeader(),
      "Connect-Protocol-Version": "1",
      "Connect-Timeout-Ms": "600000",
      "Content-Type": "application/connect+json",
      "Accept": "application/connect+json",
    },
    body: JSON.stringify({
      process: {
        cmd: "/bin/sh",
        args: ["-lc", command],
        envs: {},
        cwd,
      },
      stdin: false,
    }),
  });
  if (!response.ok) throw new Error(`error.e2b.envd_request_failed:${response.status}:${await response.text().catch(() => response.statusText)}`);
  const result = { stdout: "", stderr: "", exitCode: 0 };
  for (const frame of parseConnectJsonFrames(await response.arrayBuffer())) collectProcessEvent(frame, result);
  if (options.throwOnNonZero && result.exitCode !== 0) throw new Error(`error.e2b.process_failed:${result.exitCode}:${result.stderr || result.stdout}`);
  return result;
}

async function ensureWorkspaceRoot(ref: SandboxRef) {
  if (await useMemoryMode()) return;
  await envdRunCommand(ref, `mkdir -p ${WORKSPACE_ROOT} && test -d ${WORKSPACE_ROOT}`, "/home/user", { throwOnNonZero: true });
}

function parseConnectJsonFrames(buffer: ArrayBuffer): unknown[] {
  const bytes = new Uint8Array(buffer);
  const out: unknown[] = [];
  for (let offset = 0; offset + 5 <= bytes.length;) {
    const length = (bytes[offset + 1] << 24) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 8) | bytes[offset + 4];
    offset += 5;
    if (length < 0 || offset + length > bytes.length) break;
    const payload = new TextDecoder().decode(bytes.slice(offset, offset + length));
    offset += length;
    if (!payload.trim()) continue;
    try {
      out.push(JSON.parse(payload));
    } catch {
      // Ignore malformed keepalive/error trailers; status is handled by HTTP.
    }
  }
  if (out.length > 0) return out;
  const text = new TextDecoder().decode(bytes).trim();
  if (!text) return [];
  try {
    return [JSON.parse(text)];
  } catch {
    return text.split(/\n+/).flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });
  }
}

function collectProcessEvent(frame: unknown, acc: { stdout: string; stderr: string; exitCode: number }) {
  const event = (frame as any)?.event;
  const variant = event?.event ?? event;
  const data = variant?.case === "data" ? variant.value : variant?.data;
  const end = variant?.case === "end" ? variant.value : variant?.end;
  if (data) {
    const output = data.output;
    const stdout = output?.case === "stdout" ? output.value : data.stdout ?? output?.stdout;
    const stderr = output?.case === "stderr" ? output.value : data.stderr ?? output?.stderr;
    const pty = output?.case === "pty" ? output.value : data.pty ?? output?.pty;
    if (stdout) acc.stdout += decodeBase64Text(stdout);
    if (stderr) acc.stderr += decodeBase64Text(stderr);
    if (pty) acc.stdout += decodeBase64Text(pty);
  }
  if (end) {
    acc.exitCode = Number(end.exitCode ?? end.exit_code ?? acc.exitCode);
    if (end.error) acc.stderr += `${String(end.error)}\n`;
  }
}

export async function reconcileLiveRef(ref: SandboxRef): Promise<SandboxRef> {
  await assertRefAccess(ref);
  if (await useMemoryMode()) return ref;
  if (ref.state !== "running") return ref;
  if (!ref.e2bSandboxId) {
    const next = { ...ref, state: "none" as const, burnRateCentsPerMinute: 0 };
    await persistRef(missionIdFor(ref), next);
    return next;
  }
  try {
    const live = await e2bFetch(`/sandboxes/${encodeURIComponent(ref.e2bSandboxId)}`, { method: "GET" }) as E2BCreateResponse | null;
    const refreshed = {
      ...ref,
      envdAccessToken: live?.envdAccessToken ?? ref.envdAccessToken ?? null,
      envdHost: ref.envdHost ?? envdHostFor(ref.e2bSandboxId),
    };
    if (refreshed.envdAccessToken !== ref.envdAccessToken || refreshed.envdHost !== ref.envdHost) await persistRef(missionIdFor(ref), refreshed);
    return refreshed;
  } catch (error) {
    if (!isE2bNotFound(error)) throw error;
    const paused = { ...ref, state: "paused" as const, burnRateCentsPerMinute: 0 };
    await persistRef(missionIdFor(ref), paused);
    return paused;
  }
}

async function loadPersistedLiveRouting(refSandboxId: string): Promise<LiveSandboxRouting | null> {
  const [row] = await db.select().from(sandboxRuntime).where(eq(sandboxRuntime.sandboxId, refSandboxId)).limit(1);
  if (!row?.e2bSandboxId) return null;
  return {
    sandboxID: row.e2bSandboxId,
    envdAccessToken: row.envdAccessToken ?? null,
    envdHost: row.envdHost ?? envdHostFor(row.e2bSandboxId),
  };
}

async function createRealSandbox(input: { missionId: string; target: SandboxTarget; instanceId?: string }) {
  const templateID = vars.get("E2B_TEMPLATE_ID") || "base";
  const body = {
    // E2B lifecycle is platform API only; exec/files route to envd using
    // envdAccessToken persisted below.
    templateID,
    timeout: 3600,
    autoPause: true,
    secure: true,
    allow_internet_access: true,
    metadata: {
      app: "missionry",
      missionId: input.missionId,
      target: input.target,
      instanceId: input.instanceId ?? "",
    },
    envVars: {
      MISSION_ID: input.missionId,
      MISSIONRY_TARGET: input.target,
      ...(input.instanceId ? { AGENT_INSTANCE_ID: input.instanceId } : {}),
    },
  };
  const created = await e2bFetch("/sandboxes", { method: "POST", body: JSON.stringify(body) }) as E2BCreateResponse;
  const sandboxID = created.sandboxID ?? created.sandboxId;
  if (!sandboxID) throw new Error("error.e2b.sandbox_id_missing");
  return { sandboxID, envdAccessToken: created.envdAccessToken ?? null, domain: created.domain ?? null };
}

async function connectRealSandbox(sandboxID: string) {
  return e2bFetch(`/sandboxes/${encodeURIComponent(sandboxID)}/connect`, {
    method: "POST",
    body: JSON.stringify({ timeout: 3600 }),
  }) as Promise<E2BCreateResponse | null>;
}

type LiveSandboxRouting = { sandboxID: string; envdAccessToken?: string | null; envdHost?: string | null };

function refFor(input: { missionId: string; instanceId?: string; target: SandboxTarget }, routing: LiveSandboxRouting, state: "running" | "paused" = "running"): SandboxRef {
  const timestamp = new Date().toISOString();
  return {
    sandboxId: keyFor(input.missionId, input.target, input.instanceId),
    tier: input.target,
    ownerInstanceId: input.instanceId,
    state,
    e2bSandboxId: routing.sandboxID,
    envdAccessToken: routing.envdAccessToken ?? null,
    envdHost: routing.envdHost ?? envdHostFor(routing.sandboxID),
    lastActivityAt: timestamp,
    activeSince: state === "running" ? timestamp : undefined,
    burnRateCentsPerMinute: state === "running" ? 0.45 : 0,
    environmentVersionId: "env_v1",
    injectedCredentialIds: [],
    injectedVariableKeys: ["MISSION_ID"],
    environmentAccessMode: "inherit",
  };
}

async function persistRef(missionId: string, ref: SandboxRef) {
  await updateMission(missionId, (mission) => {
    if (ref.tier === "mission") mission.stateJson.sharedSandbox = ref;
    else if (ref.ownerInstanceId) mission.stateJson.privateSandboxes[ref.ownerInstanceId] = ref;
    return mission;
  });
  await upsertSandboxRuntime(ref, missionId);
}

export async function startShared(missionId: string): Promise<SandboxRef> {
  missionId = assertSafeId(missionId, "mission_id");
  return startOrResume({ missionId, target: "mission" });
}

export async function startPrivate(missionId: string, instanceId: string): Promise<SandboxRef> {
  await assertInstanceInMission(missionId, instanceId);
  return startOrResume({ missionId: assertSafeId(missionId, "mission_id"), instanceId: assertSafeId(instanceId, "instance_id"), target: "private" });
}

export async function resume(missionId: string, target: SandboxTarget, instanceId?: string): Promise<SandboxRef> {
  missionId = assertSafeId(missionId, "mission_id");
  if (target === "private" && instanceId) await assertInstanceInMission(missionId, instanceId);
  return startOrResume({ missionId, instanceId, target });
}

async function startOrResume(input: { missionId: string; instanceId?: string; target: SandboxTarget }): Promise<SandboxRef> {
  input.missionId = assertSafeId(input.missionId, "mission_id");
  if (input.instanceId) input.instanceId = assertSafeId(input.instanceId, "instance_id");
  await assertUserBudgetForMission(input.missionId, 1);
  const sandboxId = keyFor(input.missionId, input.target, input.instanceId);

  if (await useMemoryMode()) {
    await ensureMemorySandbox(sandboxId);
    const ref = refFor(input, { sandboxID: sandboxId });
    await persistRef(input.missionId, ref);
    return ref;
  }

  let routing: LiveSandboxRouting | null = await loadPersistedLiveRouting(sandboxId);
  if (routing?.sandboxID) {
    try {
      const connected = await connectRealSandbox(routing.sandboxID);
      routing = {
        sandboxID: connected?.sandboxID ?? connected?.sandboxId ?? routing.sandboxID,
        envdAccessToken: connected?.envdAccessToken ?? routing.envdAccessToken ?? null,
        envdHost: envdHostFor(connected?.sandboxID ?? connected?.sandboxId ?? routing.sandboxID),
      };
    } catch {
      routing = null;
    }
  }
  if (!routing) {
    const created = await createRealSandbox(input);
    routing = { sandboxID: created.sandboxID, envdAccessToken: created.envdAccessToken ?? null, envdHost: envdHostFor(created.sandboxID) };
  }
  const ref = refFor(input, routing);
  await ensureWorkspaceRoot(ref);
  await persistRef(input.missionId, ref);
  return ref;
}

async function ensureRunningRef(ref: SandboxRef) {
  await assertRefAccess(ref);
  if (await useMemoryMode()) {
    await ensureMemorySandbox(ref.sandboxId);
    return ref;
  }
  return startOrResume({ missionId: missionIdFor(ref), target: ref.tier, instanceId: ref.ownerInstanceId });
}

export async function runCommand(ref: SandboxRef, command: string) {
  const running = await ensureRunningRef(ref);
  if (await useMemoryMode()) {
    await touchSandbox(running);
    if (command.trim() === "false") return { exitCode: 1, stdout: "", stderr: "command exited with 1\n" };
    return {
      exitCode: 0,
      stdout: command === "pwd" ? "/workspace\n" : `demo:${running.sandboxId}$ ${command}\n`,
      stderr: "",
    };
  }
  const result = await envdRunCommand(running, `mkdir -p ${WORKSPACE_ROOT} && ${command}`, WORKSPACE_ROOT);
  await touchSandbox(running);
  return result;
}

export async function writeFile(ref: SandboxRef, path: string, content: string) {
  const running = await ensureRunningRef(ref);
  if (await useMemoryMode()) {
    const sandbox = await ensureMemorySandbox(running.sandboxId);
    sandbox.files.set(workspacePath(path), content);
    await touchSandbox(running);
    return;
  }
  const filePath = workspacePath(path);
  const form = new FormData();
  form.append("file", new Blob([content], { type: "text/plain;charset=utf-8" }), filePath.split("/").filter(Boolean).at(-1) ?? "file.txt");
  await envdFetch(running, `/files?path=${encodeURIComponent(filePath)}&username=user`, {
    method: "POST",
    body: form,
  });
  await touchSandbox(running);
}

export async function readFile(ref: SandboxRef, path: string) {
  const running = await ensureRunningRef(ref);
  if (await useMemoryMode()) {
    const sandbox = await ensureMemorySandbox(running.sandboxId);
    await touchSandbox(running);
    const value = sandbox.files.get(workspacePath(path)) ?? sandbox.files.get(path);
    if (value === undefined) throw new Error("error.file.not_found");
    return value;
  }
  const response = await envdFetch(running, `/files?path=${encodeURIComponent(workspacePath(path))}&username=user`, { method: "GET" });
  await touchSandbox(running);
  return typeof response === "string" ? response : String((response as { content?: unknown })?.content ?? "");
}

export async function pauseIfIdle(ref: SandboxRef) {
  await assertRefAccess(ref);
  if (await useMemoryMode()) {
    const sandbox = await ensureMemorySandbox(ref.sandboxId);
    sandbox.state = "paused";
  } else if (ref.e2bSandboxId) {
    try {
      await e2bFetch(`/sandboxes/${encodeURIComponent(ref.e2bSandboxId)}/pause`, { method: "POST" });
    } catch (error) {
      if (!isE2bNotFound(error)) throw error;
    }
  }
  const paused = { ...ref, state: "paused" as const, burnRateCentsPerMinute: 0 };
  await persistRef(missionIdFor(ref), paused);
  return paused;
}

export type SandboxFileEntry = { name: string; path: string; displayPath?: string; type: "dir" | "file"; size?: number };

function normalizeSandboxPath(path: string) {
  const withSlash = path.startsWith("/") ? path : `/${path}`;
  return withSlash.replace(/\/+/g, "/").replace(/\/$/, "") || "/";
}

function memoryChildEntries(files: Map<string, string>, dirPath: string): SandboxFileEntry[] {
  const relativeDir = normalizeWorkspaceRelativePath(dirPath);
  const normalizedDir = normalizeSandboxPath(workspacePath(relativeDir));
  const prefix = normalizedDir === "/" ? "/" : `${normalizedDir}/`;
  const entries = new Map<string, SandboxFileEntry>();
  for (const [rawPath, content] of files.entries()) {
    const filePath = normalizeSandboxPath(rawPath);
    if (!filePath.startsWith(prefix)) continue;
    const rest = filePath.slice(prefix.length);
    if (!rest) continue;
    const [name, ...remaining] = rest.split("/");
    if (!name) continue;
    const childPath = joinRelative(relativeDir, name);
    if (remaining.length > 0) entries.set(childPath, { name, path: childPath, displayPath: `${WORKSPACE_ROOT}/${childPath}`, type: "dir" });
    else entries.set(childPath, { name, path: childPath, displayPath: `${WORKSPACE_ROOT}/${childPath}`, type: "file", size: new TextEncoder().encode(content).length });
  }
  return Array.from(entries.values()).sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
}

export async function listFiles(ref: SandboxRef, path: string): Promise<{ state: SandboxRef["state"]; entries: SandboxFileEntry[] }> {
  await assertRefAccess(ref);
  if (ref.state !== "running") return { state: ref.state, entries: [] };
  const relativeDir = normalizeWorkspaceRelativePath(path);
  if (await useMemoryMode()) {
    const sandbox = memorySandboxes.get(ref.sandboxId);
    if (!sandbox || sandbox.state !== "running") return { state: "none", entries: [] };
    return { state: "running", entries: memoryChildEntries(sandbox.files, relativeDir) };
  }
  const response = await envdFetch(ref, "/filesystem.Filesystem/ListDir", {
    method: "POST",
    headers: {
      "Authorization": basicUserHeader(),
      "Connect-Protocol-Version": "1",
      "Connect-Timeout-Ms": "30000",
    },
    body: JSON.stringify({ path: workspacePath(relativeDir), depth: 1 }),
  }) as unknown;
  const rawEntries = Array.isArray(response)
    ? response
    : Array.isArray((response as { entries?: unknown[] })?.entries)
      ? (response as { entries: unknown[] }).entries
      : Array.isArray((response as { files?: unknown[] })?.files)
        ? (response as { files: unknown[] }).files
        : [];
  const entries = rawEntries.map((entry) => {
    const row = entry as Record<string, unknown>;
    const rawPath = String(row.path ?? "");
    const name = String(row.name ?? rawPath.split("/").filter(Boolean).at(-1) ?? "");
    const typeText = String(row.type ?? "").toLowerCase();
    const type = typeText === "dir" || typeText.includes("dir") || row.isDir === true || row.isDirectory === true ? "dir" as const : "file" as const;
    const size = row.size === undefined ? undefined : Number(row.size);
    const relativePath = rawPath ? pathFromWorkspace(rawPath) : joinRelative(relativeDir, name);
    return { name: name.split("/").filter(Boolean).at(-1) ?? name, path: relativePath, displayPath: `${WORKSPACE_ROOT}/${relativePath}`, type, ...(Number.isFinite(size) ? { size } : {}) };
  }).filter((entry) => entry.name);
  return { state: "running", entries };
}

export async function readWorkspaceFile(ref: SandboxRef, path: string, maxBytes = 256 * 1024): Promise<{ state: SandboxRef["state"]; content: string }> {
  await assertRefAccess(ref);
  if (ref.state !== "running") return { state: ref.state, content: "" };
  if (await useMemoryMode()) {
    const sandbox = memorySandboxes.get(ref.sandboxId);
    if (!sandbox || sandbox.state !== "running") return { state: "none", content: "" };
    const content = sandbox.files.get(workspacePath(path)) ?? sandbox.files.get(path) ?? sandbox.files.get(path.replace(/^\//, ""));
    if (content === undefined) return { state: "running", content: "" };
    return { state: "running", content: content.slice(0, maxBytes) };
  }
  if (!ref.e2bSandboxId) return { state: "none", content: "" };
  const response = await envdFetch(ref, `/files?path=${encodeURIComponent(workspacePath(path))}&username=user`, { method: "GET" });
  const content = typeof response === "string" ? response : String((response as { content?: unknown })?.content ?? "");
  return { state: "running", content: content.slice(0, maxBytes) };
}

export async function kill(ref: SandboxRef) {
  await assertRefAccess(ref);
  if (!(await useMemoryMode()) && ref.e2bSandboxId) {
    await e2bFetch(`/sandboxes/${encodeURIComponent(ref.e2bSandboxId)}`, { method: "DELETE" });
  }
  const killed = { ...ref, state: "killed" as const, burnRateCentsPerMinute: 0 };
  await persistRef(missionIdFor(ref), killed);
  return killed;
}

async function touchSandbox(ref: SandboxRef) {
  const missionId = missionIdFor(ref);
  const timestamp = new Date().toISOString();
  const next = { ...ref, lastActivityAt: timestamp };
  const mission = await getMission(missionId);
  const current = next.tier === "mission" ? mission.stateJson.sharedSandbox : next.ownerInstanceId ? mission.stateJson.privateSandboxes[next.ownerInstanceId] : next;
  next.e2bSandboxId = current?.e2bSandboxId ?? next.e2bSandboxId;
  next.envdAccessToken = current?.envdAccessToken ?? next.envdAccessToken ?? null;
  next.envdHost = current?.envdHost ?? next.envdHost ?? (next.e2bSandboxId ? envdHostFor(next.e2bSandboxId) : null);
  await persistRef(missionId, next);
}

function missionIdFor(ref: SandboxRef) {
  return ref.sandboxId.split(":")[1];
}

async function assertRefAccess(ref: SandboxRef) {
  assertSafeId(missionIdFor(ref), "mission_id");
  if (ref.tier === "private" && ref.ownerInstanceId) await assertInstanceInMission(missionIdFor(ref), ref.ownerInstanceId);
}
