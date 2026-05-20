export type SecretKey = "E2B_API_KEY" | "OPENAI_API_KEY" | "GITHUB_TOKEN";

export type RuntimeVarKey =
  | "MISSIONRY_IDLE_MS"
  | "MISSIONRY_R2_PREFIX"
  | "E2B_TEMPLATE_ID"
  | "DEMO_E2B_MODE"
  | "INTERNAL_REAP_TOKEN";

export type EdgeSparkDb = D1Database;
export type EdgeSparkStorage = R2Bucket;

export type EdgeSparkSecret = {
  get(key: SecretKey): Promise<string>;
};

export type EdgeSparkVars = {
  get(key: RuntimeVarKey): string | undefined;
};

export type EdgeSparkContext = {
  runInBackground?(task: Promise<unknown>): void;
  waitUntil?(task: Promise<unknown>): void;
};

export type EdgeSparkRuntime = {
  db: EdgeSparkDb;
  storage: EdgeSparkStorage;
  secret: EdgeSparkSecret;
  vars: EdgeSparkVars;
  ctx: EdgeSparkContext;
};

export type EdgeSparkEnv = {
  DB: D1Database;
  STORAGE: R2Bucket;
  E2B_API_KEY?: string;
  OPENAI_API_KEY?: string;
  GITHUB_TOKEN?: string;
  MISSIONRY_IDLE_MS?: string;
  MISSIONRY_R2_PREFIX?: string;
  E2B_TEMPLATE_ID?: string;
  DEMO_E2B_MODE?: string;
  INTERNAL_REAP_TOKEN?: string;
};

export function createRuntime(env: EdgeSparkEnv, executionCtx?: ExecutionContext): EdgeSparkRuntime {
  return {
    db: env.DB,
    storage: env.STORAGE,
    secret: {
      async get(key) {
        return env[key] ?? "";
      },
    },
    vars: {
      get(key) {
        return env[key];
      },
    },
    ctx: {
      waitUntil(task) {
        executionCtx?.waitUntil(task);
      },
      runInBackground(task) {
        executionCtx?.waitUntil(task);
      },
    },
  };
}
