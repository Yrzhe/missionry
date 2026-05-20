export type SecretKey = "E2B_API_KEY" | "OPENAI_API_KEY" | "INTERNAL_REAP_TOKEN";

export type VarKey =
  | "MISSIONRY_IDLE_MS"
  | "MISSIONRY_R2_PREFIX"
  | "E2B_TEMPLATE_ID"
  | "DEMO_E2B_MODE"
  | "EDGESPARK_ENV"
  | "NODE_ENV"
  | "EDGESPARK_DEV_AS_ADMIN";

export type RuntimeConfig = {
  secrets: SecretKey[];
  vars: VarKey[];
};

export const runtimeConfig: RuntimeConfig = {
  secrets: ["E2B_API_KEY", "OPENAI_API_KEY", "INTERNAL_REAP_TOKEN"],
  vars: ["MISSIONRY_IDLE_MS", "MISSIONRY_R2_PREFIX", "E2B_TEMPLATE_ID", "DEMO_E2B_MODE", "EDGESPARK_ENV", "NODE_ENV", "EDGESPARK_DEV_AS_ADMIN"],
};
