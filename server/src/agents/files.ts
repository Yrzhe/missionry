import { storage, db } from "edgespark";
import { eq } from "drizzle-orm";
import { buckets } from "../defs/storage_schema";
import { agents } from "../defs/db_schema";
import { assertSafeId } from "../lib/safe-paths";

export type AgentBootFiles = {
  soul: string;
  identity: string;
  baseConfig: { model?: string; tools?: string[]; defaultSandboxTier?: string };
  skillsIndex: Array<{ id: string; name: string; description: string; r2Path: string }>;
  equippedSkillIds: string[];
};

// EdgeSpark storage.get() returns { body, metadata } (no .text()), so decode
// whatever `body` is. Never String(obj) — that yields "[object Object]".
async function decodeValue(value: unknown): Promise<string | null> {
  if (value == null) return null;
  if (typeof value === "string") return value;
  if (value instanceof Uint8Array) return new TextDecoder().decode(value);
  if (value instanceof ArrayBuffer) return new TextDecoder().decode(new Uint8Array(value));
  if (ArrayBuffer.isView(value)) return new TextDecoder().decode(new Uint8Array((value as ArrayBufferView).buffer));
  const v = value as Record<string, unknown>;
  if (typeof v.text === "function") return await (v.text as () => Promise<string>).call(value);
  if (typeof v.arrayBuffer === "function") return new TextDecoder().decode(await (v.arrayBuffer as () => Promise<ArrayBuffer>).call(value));
  if (typeof v.getReader === "function") {
    const reader = (value as ReadableStream<Uint8Array>).getReader();
    const chunks: Uint8Array[] = [];
    for (;;) {
      const { done, value: chunk } = await reader.read();
      if (done) break;
      if (chunk) chunks.push(chunk);
    }
    const total = chunks.reduce((n, c) => n + c.length, 0);
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.length; }
    return new TextDecoder().decode(merged);
  }
  return null;
}

async function getText(key: string): Promise<string | null> {
  const obj = await storage.from(buckets.missionryWorkspaces).get(key);
  if (!obj) return null;
  const direct = await decodeValue(obj);
  if (direct != null) return direct;
  const wrapped = obj as unknown as Record<string, unknown>;
  for (const k of ["body", "content", "data", "value"]) {
    const decoded = await decodeValue(wrapped[k]);
    if (decoded != null) return decoded;
  }
  return null;
}

// storage.put stores an EMPTY body for a raw string — encode to ArrayBuffer.
function textBytes(text: string): ArrayBuffer {
  const u8 = new TextEncoder().encode(text);
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;
}

async function putIfMissing(key: string, value: string) {
  const bucket = storage.from(buckets.missionryWorkspaces);
  const existing = await bucket.get(key);
  if (!existing) await bucket.put(key, textBytes(value));
}

// Write the default if the object is missing OR blank. Self-heals files that the
// old string-put bug stored as empty bodies, without clobbering real content.
async function putIfMissingOrEmpty(key: string, value: string) {
  const current = await getText(key);
  if (current === null || current.trim() === "") {
    await storage.from(buckets.missionryWorkspaces).put(key, textBytes(value));
  }
}

function defaultSoul(displayName: string) {
  // SOUL.md = persona/system prompt (OpenClaw/Hermes convention): identity, how you
  // work, and boundaries. Self-evolution / the owner can refine it later.
  return [
    "---",
    "model: gpt-5.5",
    "---",
    `# ${displayName}`,
    "",
    `You are ${displayName}, an agent in the Missionry multi-agent workspace.`,
    "",
    "## How you work",
    "- Bias to action: use your tools to produce real artifacts, not just descriptions.",
    "- Be concise and concrete. Finish with a short summary of what you did and which files changed.",
    "- Collaborate: when another agent or skill is a better fit, hand off or ask.",
    "",
    "## Boundaries",
    "- Stay within the current Mission's sandbox and scope.",
    "- Don't fabricate results; if something failed, say so plainly.",
  ].join("\n");
}

export async function ensureAgentFiles(agentId: string, displayName = agentId) {
  agentId = assertSafeId(agentId, "agent_id");
  // Use missing-or-empty for the core persona files so the empty bodies left by the
  // old string-put bug get repaired on next load.
  await putIfMissingOrEmpty(`agents/${agentId}/soul.md`, defaultSoul(displayName));
  await putIfMissingOrEmpty(`agents/${agentId}/identity.md`, `# ${displayName}\n\nMission agent. Role and background are refined as the agent works.`);
  await putIfMissingOrEmpty(`agents/${agentId}/base-config.yaml`, "model: gpt-5.5\ndefaultSandboxTier: tier0\n");
  await putIfMissing(
    `agents/${agentId}/skills/demo-sandbox/SKILL.md`,
    "---\nname: demo-sandbox\ndescription: Use for Missionry sandbox demo tasks.\n---\nRun only the requested demo tool.",
  );
  if (agentId === "agt_forge") {
    await putIfMissing(
      "agents/agt_forge/skills/prd-template-v2/SKILL.md",
      [
        "---",
        "name: prd-template-v2",
        "description: Draft dense Missionry product requirement documents with objective, users, scope, API contract, acceptance checks, and rollout risks.",
        "---",
        "# PRD Template v2",
        "",
        "Use this structure when a Mission needs a product requirements draft:",
        "",
        "1. Objective",
        "2. Users and jobs",
        "3. Functional scope",
        "4. API/data contract",
        "5. Acceptance checks",
        "6. Rollout risks",
      ].join("\n"),
    );
  }
}

export async function ensureAgentInstanceFiles(missionId: string, instanceId: string) {
  missionId = assertSafeId(missionId, "mission_id");
  instanceId = assertSafeId(instanceId, "instance_id");
  const prefix = `missions/${missionId}/agent-instances/${instanceId}`;
  await putIfMissing(`${prefix}/memory/demo.md`, "# Demo memory\n\nMission-scoped; do not share across missions.");
  await putIfMissing(`${prefix}/config-overrides.yaml`, "overrides: {}\n");
  await putIfMissing(`${prefix}/work-state.json`, JSON.stringify({ status: "idle" }, null, 2));
}

export async function loadAgentBootFiles(agentId: string): Promise<AgentBootFiles> {
  agentId = assertSafeId(agentId, "agent_id");
  await ensureAgentFiles(agentId);
  const soul = (await getText(`agents/${agentId}/soul.md`)) ?? "";
  const identity = (await getText(`agents/${agentId}/identity.md`)) ?? "";
  const base = (await getText(`agents/${agentId}/base-config.yaml`)) ?? "";
  const model = base.match(/model:\s*(.+)/)?.[1]?.trim();
  // Equipped skills come from the agent's DB row (equipped_skill_ids_json), not a
  // hardcoded list. Fall back to the demo skill if the row is missing/empty.
  let skillIds: string[] = [];
  try {
    const [row] = await db.select({ equipped: agents.equippedSkillIdsJson }).from(agents).where(eq(agents.id, agentId)).limit(1);
    const parsed = row?.equipped ? JSON.parse(row.equipped) : [];
    if (Array.isArray(parsed)) skillIds = parsed.filter((s): s is string => typeof s === "string");
  } catch {
    skillIds = [];
  }
  if (skillIds.length === 0) skillIds = ["demo-sandbox"];
  const skillsIndex = (
    await Promise.all(
      skillIds.map(async (id) => {
        // Resolve a skill from the agent's own folder first (bespoke), then the
        // shared team library (skills/{id}/SKILL.md).
        const agentPath = `agents/${agentId}/skills/${id}/SKILL.md`;
        const libPath = `skills/${id}/SKILL.md`;
        const agentSkill = await getText(agentPath);
        const skill = agentSkill ?? (await getText(libPath));
        if (!skill) return null;
        return {
          id,
          name: skill.match(/name:\s*(.+)/)?.[1]?.trim() ?? id,
          description: skill.match(/description:\s*(.+)/)?.[1]?.trim() ?? "",
          r2Path: agentSkill ? agentPath : libPath,
        };
      }),
    )
  ).filter((skill): skill is { id: string; name: string; description: string; r2Path: string } => Boolean(skill));
  return { soul, identity, baseConfig: { model, tools: ["run_command", "use_skill"] }, skillsIndex, equippedSkillIds: skillsIndex.map((skill) => skill.id) };
}

// Write the agent's persona files (only the provided ones).
export async function setAgentSoulIdentity(agentId: string, soul?: string, identity?: string) {
  agentId = assertSafeId(agentId, "agent_id");
  const bucket = storage.from(buckets.missionryWorkspaces);
  if (soul && soul.trim()) await bucket.put(`agents/${agentId}/soul.md`, textBytes(soul));
  if (identity && identity.trim()) await bucket.put(`agents/${agentId}/identity.md`, textBytes(identity));
}

// Install a skill INTO this agent's own folder (per-agent, no shared library).
export async function writeAgentSkill(agentId: string, skillId: string, content: string) {
  agentId = assertSafeId(agentId, "agent_id");
  skillId = assertSafeId(skillId, "skill_id");
  await storage.from(buckets.missionryWorkspaces).put(`agents/${agentId}/skills/${skillId}/SKILL.md`, textBytes(content));
}

// Add skill ids to the agent's equipped list (deduped).
export async function equipSkills(agentId: string, skillIds: string[]) {
  agentId = assertSafeId(agentId, "agent_id");
  const [row] = await db.select({ equipped: agents.equippedSkillIdsJson }).from(agents).where(eq(agents.id, agentId)).limit(1);
  let current: string[] = [];
  try { const parsed = row?.equipped ? JSON.parse(row.equipped) : []; if (Array.isArray(parsed)) current = parsed.filter((s): s is string => typeof s === "string"); } catch { current = []; }
  const merged = Array.from(new Set([...current, ...skillIds]));
  await db.update(agents).set({ equippedSkillIdsJson: JSON.stringify(merged), updatedAt: new Date().toISOString() }).where(eq(agents.id, agentId));
  return merged;
}

export async function listAgentSkillIds(agentId: string): Promise<string[]> {
  const [row] = await db.select({ equipped: agents.equippedSkillIdsJson }).from(agents).where(eq(agents.id, assertSafeId(agentId, "agent_id"))).limit(1);
  try { const parsed = row?.equipped ? JSON.parse(row.equipped) : []; return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === "string") : []; } catch { return []; }
}

export async function loadSkill(agentId: string, skillId: string): Promise<string> {
  agentId = assertSafeId(agentId, "agent_id");
  skillId = assertSafeId(skillId, "skill_id");
  // Agent-local first, then the shared team library.
  const body = (await getText(`agents/${agentId}/skills/${skillId}/SKILL.md`)) ?? (await getText(`skills/${skillId}/SKILL.md`));
  if (!body) throw new Error("error.skill.not_found");
  return body;
}

// Team-shared skill library (R2 skills/{id}/SKILL.md).
export async function writeLibrarySkill(skillId: string, content: string) {
  skillId = assertSafeId(skillId, "skill_id");
  await storage.from(buckets.missionryWorkspaces).put(`skills/${skillId}/SKILL.md`, textBytes(content));
}
export async function loadLibrarySkill(skillId: string): Promise<string | null> {
  return getText(`skills/${assertSafeId(skillId, "skill_id")}/SKILL.md`);
}

// ── Layered memory (Hermes-style) ─────────────────────────────────────────────
// MEMORY.md = the agent's cross-mission lessons/conventions/tool quirks (the brain).
// USER.md   = the owner's profile/preferences, shared across all agents.
// The raw message log (state.db equivalent) already lives in mission_chat_messages
// + audit and is NOT auto-loaded.
const AGENT_MEMORY_CAP = 2400;
const USER_PROFILE_CAP = 1500;

function agentMemoryKey(agentId: string) {
  return `agents/${assertSafeId(agentId, "agent_id")}/MEMORY.md`;
}
function userProfileKey(userId: string) {
  // userId comes from auth (better-auth) — keep it filesystem-safe.
  const safe = String(userId || "system").replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 80) || "system";
  return `users/${safe}/USER.md`;
}

export async function loadAgentMemory(agentId: string): Promise<string> {
  return (await getText(agentMemoryKey(agentId)))?.trim() ?? "";
}
export async function loadUserProfile(userId: string): Promise<string> {
  return (await getText(userProfileKey(userId)))?.trim() ?? "";
}

// Append bullet lines, dedup exact repeats, and trim oldest lines past the cap.
function mergeMemory(current: string, additions: string[], cap: number): string {
  const existing = current.split("\n").map((l) => l.trim()).filter(Boolean);
  const seen = new Set(existing.map((l) => l.replace(/^[-*]\s*/, "")));
  for (const raw of additions) {
    const line = `- ${raw.trim().replace(/^[-*]\s*/, "")}`;
    const norm = line.replace(/^[-*]\s*/, "");
    if (norm && !seen.has(norm)) { existing.push(line); seen.add(norm); }
  }
  let out = existing.join("\n");
  while (out.length > cap && existing.length > 1) {
    existing.shift(); // drop oldest
    out = existing.join("\n");
  }
  return out;
}

export async function appendAgentMemory(agentId: string, lines: string[]) {
  if (!lines.length) return;
  const key = agentMemoryKey(agentId);
  const next = mergeMemory(await loadAgentMemory(agentId), lines, AGENT_MEMORY_CAP);
  await storage.from(buckets.missionryWorkspaces).put(key, textBytes(next));
}
export async function appendUserProfile(userId: string, lines: string[]) {
  if (!lines.length) return;
  const key = userProfileKey(userId);
  const next = mergeMemory(await loadUserProfile(userId), lines, USER_PROFILE_CAP);
  await storage.from(buckets.missionryWorkspaces).put(key, textBytes(next));
}

// Full-replace setters for the memory editor (capped, never empty-bodies).
export async function setAgentMemory(agentId: string, content: string) {
  const trimmed = (content ?? "").slice(0, AGENT_MEMORY_CAP);
  await storage.from(buckets.missionryWorkspaces).put(agentMemoryKey(agentId), textBytes(trimmed));
}
export async function setUserProfile(userId: string, content: string) {
  const trimmed = (content ?? "").slice(0, USER_PROFILE_CAP);
  await storage.from(buckets.missionryWorkspaces).put(userProfileKey(userId), textBytes(trimmed));
}

// Build the injectable memory block for an agent's system context.
export async function buildMemoryContext(agentId: string, userId?: string): Promise<string> {
  const [mem, user] = await Promise.all([
    loadAgentMemory(agentId),
    userId ? loadUserProfile(userId) : Promise.resolve(""),
  ]);
  const parts: string[] = [];
  if (mem) parts.push(`## Your long-term memory (lessons across missions)\n${mem}`);
  if (user) parts.push(`## What you know about the owner\n${user}`);
  return parts.join("\n\n");
}
