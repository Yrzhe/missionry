export type SecretKey = "E2B_API_KEY" | "OPENAI_API_KEY" | "INTERNAL_REAP_TOKEN";

export type VarKey =
  | "MISSIONRY_IDLE_MS"
  | "MISSIONRY_R2_PREFIX"
  | "E2B_TEMPLATE_ID"
  | "MISSIONRY_E2B_CENTS_PER_MIN"
  | "MISSIONRY_PUBLIC_ORIGIN"
  | "DEMO_E2B_MODE"
  | "EDGESPARK_ENV"
  | "NODE_ENV"
  | "EDGESPARK_DEV_AS_ADMIN"
  | "MISSIONRY_FORCE_MOCK_AI"
  // user IDs (not sensitive) + a dev-only header secret (only read in development);
  // kept as vars so deploy doesn't force browser secret entry.
  | "MISSIONRY_SUPER_ADMIN_USER_IDS"
  | "MISSIONRY_DEV_HEADER_SECRET"
  // Proactive chatter (phase 2.2): cheap gate model id + on/off kill switch.
  | "MISSIONRY_GATE_MODEL"
  | "MISSIONRY_PROACTIVE_CHATTER";

export type RuntimeConfig = {
  secrets: SecretKey[];
  vars: VarKey[];
};

export const runtimeConfig: RuntimeConfig = {
  // MISSIONRY_DEV_HEADER_SECRET and MISSIONRY_SUPER_ADMIN_USER_IDS are OPTIONAL
  // (read with .catch fallback): dev-header is disabled in prod when absent;
  // super-admin falls back to the persisted users_profile role. Keeping them out
  // of the required list lets deploy proceed without forcing browser secret entry.
  secrets: ["E2B_API_KEY", "OPENAI_API_KEY", "INTERNAL_REAP_TOKEN"],
  vars: ["MISSIONRY_IDLE_MS", "MISSIONRY_R2_PREFIX", "E2B_TEMPLATE_ID", "MISSIONRY_E2B_CENTS_PER_MIN", "MISSIONRY_PUBLIC_ORIGIN", "DEMO_E2B_MODE", "EDGESPARK_ENV", "NODE_ENV", "EDGESPARK_DEV_AS_ADMIN", "MISSIONRY_FORCE_MOCK_AI", "MISSIONRY_SUPER_ADMIN_USER_IDS", "MISSIONRY_DEV_HEADER_SECRET", "MISSIONRY_GATE_MODEL", "MISSIONRY_PROACTIVE_CHATTER"],
};
