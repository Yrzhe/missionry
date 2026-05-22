import { storage } from "edgespark";
import { buckets } from "../defs/storage_schema";
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

export async function ensureAgentFiles(agentId: string, displayName = agentId) {
  agentId = assertSafeId(agentId, "agent_id");
  await putIfMissing(`agents/${agentId}/soul.md`, `---\nmodel: gpt-4o-mini\n---\nYou are ${displayName}, a Missionry demo agent.`);
  await putIfMissing(`agents/${agentId}/identity.md`, `# ${displayName}\n\nPhase 1 demo agent.`);
  await putIfMissing(`agents/${agentId}/base-config.yaml`, "model: gpt-4o-mini\ndefaultSandboxTier: tier0\n");
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
  const skillIds = agentId === "agt_forge" ? ["demo-sandbox", "prd-template-v2"] : ["demo-sandbox"];
  const skillsIndex = (
    await Promise.all(
      skillIds.map(async (id) => {
        const skill = await getText(`agents/${agentId}/skills/${id}/SKILL.md`);
        if (!skill) return null;
        return {
          id,
          name: skill.match(/name:\s*(.+)/)?.[1]?.trim() ?? id,
          description: skill.match(/description:\s*(.+)/)?.[1]?.trim() ?? "",
          r2Path: `agents/${agentId}/skills/${id}/SKILL.md`,
        };
      }),
    )
  ).filter((skill): skill is { id: string; name: string; description: string; r2Path: string } => Boolean(skill));
  return { soul, identity, baseConfig: { model, tools: ["run_command", "use_skill"] }, skillsIndex, equippedSkillIds: skillsIndex.map((skill) => skill.id) };
}

export async function loadSkill(agentId: string, skillId: string): Promise<string> {
  agentId = assertSafeId(agentId, "agent_id");
  skillId = assertSafeId(skillId, "skill_id");
  const body = await getText(`agents/${agentId}/skills/${skillId}/SKILL.md`);
  if (!body) throw new Error("error.skill.not_found");
  return body;
}
