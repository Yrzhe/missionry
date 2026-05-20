import { storage } from "edgespark";
import { buckets } from "../defs/storage_schema";

export type AgentBootFiles = {
  soul: string;
  identity: string;
  baseConfig: { model?: string; tools?: string[]; defaultSandboxTier?: string };
  skillsIndex: Array<{ id: string; name: string; description: string; r2Path: string }>;
};

async function getText(key: string): Promise<string | null> {
  const obj = await storage.from(buckets.missionryWorkspaces).get(key);
  return obj ? obj.text() : null;
}

async function putIfMissing(key: string, value: string) {
  const bucket = storage.from(buckets.missionryWorkspaces);
  const existing = await bucket.get(key);
  if (!existing) await bucket.put(key, value);
}

export async function ensureAgentFiles(agentId: string, displayName = agentId) {
  await putIfMissing(`agents/${agentId}/soul.md`, `---\nmodel: gpt-4o-mini\n---\nYou are ${displayName}, a Missionry demo agent.`);
  await putIfMissing(`agents/${agentId}/identity.md`, `# ${displayName}\n\nPhase 1 demo agent.`);
  await putIfMissing(`agents/${agentId}/base-config.yaml`, "model: gpt-4o-mini\ndefaultSandboxTier: tier0\n");
  await putIfMissing(
    `agents/${agentId}/skills/demo-sandbox/SKILL.md`,
    "---\nname: demo-sandbox\ndescription: Use for Missionry sandbox demo tasks.\n---\nRun only the requested demo tool.",
  );
}

export async function ensureAgentInstanceFiles(missionId: string, instanceId: string) {
  const prefix = `missions/${missionId}/agent-instances/${instanceId}`;
  await putIfMissing(`${prefix}/memory/demo.md`, "# Demo memory\n\nMission-scoped; do not share across missions.");
  await putIfMissing(`${prefix}/config-overrides.yaml`, "overrides: {}\n");
  await putIfMissing(`${prefix}/work-state.json`, JSON.stringify({ status: "idle" }, null, 2));
}

export async function loadAgentBootFiles(agentId: string): Promise<AgentBootFiles> {
  await ensureAgentFiles(agentId);
  const soul = (await getText(`agents/${agentId}/soul.md`)) ?? "";
  const identity = (await getText(`agents/${agentId}/identity.md`)) ?? "";
  const base = (await getText(`agents/${agentId}/base-config.yaml`)) ?? "";
  const model = base.match(/model:\s*(.+)/)?.[1]?.trim();
  const skill = await getText(`agents/${agentId}/skills/demo-sandbox/SKILL.md`);
  const skillsIndex = skill
    ? [
        {
          id: "demo-sandbox",
          name: skill.match(/name:\s*(.+)/)?.[1]?.trim() ?? "demo-sandbox",
          description: skill.match(/description:\s*(.+)/)?.[1]?.trim() ?? "",
          r2Path: `agents/${agentId}/skills/demo-sandbox/SKILL.md`,
        },
      ]
    : [];
  return { soul, identity, baseConfig: { model, tools: ["run_command"] }, skillsIndex };
}

export async function loadSkill(agentId: string, skillId: string): Promise<string> {
  const body = await getText(`agents/${agentId}/skills/${skillId}/SKILL.md`);
  if (!body) throw new Error("error.skill.not_found");
  return body;
}
