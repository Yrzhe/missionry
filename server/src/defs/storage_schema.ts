export const buckets = {
  missionryWorkspaces: {
    name: "missionry-workspaces",
    versioning: true,
    prefixes: ["agents/", "missions/", "artifacts/", "snapshots/"],
  },
} as const;

export type BucketName = keyof typeof buckets;
export type WorkspaceBucketName = (typeof buckets)["missionryWorkspaces"]["name"];
