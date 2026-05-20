import type { EdgeSparkStorage } from "../defs/runtime";

export type AgentBootFiles = {
  soul: string;
  identity: string;
  baseConfig: { model?: string; tools?: string[]; defaultSandboxTier?: string };
  skillsIndex: Array<{ id: string; name: string; description: string; r2Path: string }>;
};

async function getText(storage: EdgeSparkStorage, key: string): Promise<string | null> {
  const obj = await storage.get(key);
  return obj ? obj.text() : null;
}

async function putIfMissing(storage: EdgeSparkStorage, key: string, value: string) {
  const existing = await storage.get(key);
  if (!existing) await storage.put(key, value);
}

export async function ensureAgentFiles(storage: EdgeSparkStorage, agentId: string, displayName = agentId) {
  await putIfMissing(storage, `agents/${agentId}/soul.md`, `---\nmodel: gpt-4o-mini\n---\nYou are ${displayName}, a Missionry demo agent.`);
  await putIfMissing(storage, `agents/${agentId}/identity.md`, `# ${displayName}\n\nPhase 1 demo agent.`);
  await putIfMissing(storage, `agents/${agentId}/base-config.yaml`, "model: gpt-4o-mini\ndefaultSandboxTier: tier0\n");
  await putIfMissing(
    storage,
    `agents/${agentId}/skills/demo-sandbox/SKILL.md`,
    "---\nname: demo-sandbox\ndescription: Use for Missionry sandbox demo tasks.\n---\nRun only the requested demo tool.",
  );
}

export async function ensureAgentInstanceFiles(storage: EdgeSparkStorage, missionId: string, instanceId: string) {
  const prefix = `missions/${missionId}/agent-instances/${instanceId}`;
  await putIfMissing(storage, `${prefix}/memory/demo.md`, "# Demo memory\n\nMission-scoped; do not share across missions.");
  await putIfMissing(storage, `${prefix}/config-overrides.yaml`, "overrides: {}\n");
  await putIfMissing(storage, `${prefix}/work-state.json`, JSON.stringify({ status: "idle" }, null, 2));
}

export async function loadAgentBootFiles(storage: EdgeSparkStorage, agentId: string): Promise<AgentBootFiles> {
  await ensureAgentFiles(storage, agentId);
  const soul = (await getText(storage, `agents/${agentId}/soul.md`)) ?? "";
  const identity = (await getText(storage, `agents/${agentId}/identity.md`)) ?? "";
  const base = (await getText(storage, `agents/${agentId}/base-config.yaml`)) ?? "";
  const model = base.match(/model:\s*(.+)/)?.[1]?.trim();
  const skill = await getText(storage, `agents/${agentId}/skills/demo-sandbox/SKILL.md`);
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

export async function loadSkill(storage: EdgeSparkStorage, agentId: string, skillId: string): Promise<string> {
  const body = await getText(storage, `agents/${agentId}/skills/${skillId}/SKILL.md`);
  if (!body) throw new Error("error.skill.not_found");
  return body;
}
