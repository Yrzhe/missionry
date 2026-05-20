import { seedDemo } from "../seed";
import type { EdgeSparkRuntime } from "../defs/runtime";

export async function runDevSeed(runtime: EdgeSparkRuntime) {
  return seedDemo(runtime, "mis_demo");
}
