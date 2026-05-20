const SAFE_ID = /^[a-z0-9][a-z0-9_:.-]{0,127}$/;
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

export function assertSafeId(value: string | undefined | null, name: string): string {
  if (typeof value !== "string" || !SAFE_ID.test(value) || value.includes("..") || value.includes("/") || /\s/.test(value)) {
    throw new Error(`error.path.${name}_invalid`);
  }
  return value;
}

export function assertSafeRelativePath(value: string | undefined | null): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 256 || CONTROL_CHARS.test(value)) {
    throw new Error("error.path.relative_invalid");
  }
  if (value.startsWith("/") || value.includes("\\")) throw new Error("error.path.relative_invalid");
  const parts = value.split("/");
  if (parts.some((part) => part.length === 0 || part === "." || part === "..")) {
    throw new Error("error.path.relative_invalid");
  }
  const normalized: string[] = [];
  for (const part of parts) {
    if (part === "..") normalized.pop();
    else normalized.push(part);
  }
  if (normalized.length === 0 || normalized.join("/") !== value) throw new Error("error.path.relative_invalid");
  return normalized.join("/");
}

export const safePathTestCases = {
  validIds: ["mis_demo", "agt_forge", "ins_mis_demo_forge", "mission:mis_demo", "abc-123.x:y"],
  invalidIds: ["../etc", "Agt", "/root", " bad", "bad id", ".bad", "bad/child", "bad..id"],
  validRelativePaths: ["identity.md", "skills/prd-template-v2/SKILL.md", "artifact/report.json"],
  invalidRelativePaths: ["", "/abs", "../passwd", "a//b", "a/./b", "a/../b", "bad\u0000name"],
} as const;
