declare module "edgespark" {
  type R2LikeObject = {
    text(): Promise<string>;
    arrayBuffer?(): Promise<ArrayBuffer>;
  };

  type StorageBucket = {
    get(key: string): Promise<R2LikeObject | null>;
    put(key: string, value: string | ArrayBuffer | ReadableStream): Promise<unknown>;
    delete(key: string): Promise<unknown>;
    listVersions?: (key: string) => Promise<Array<{ versionId: string }>>;
    restoreObjectVersion?: (key: string, versionId: string) => Promise<unknown>;
  };

  export const db: any;
  export const storage: {
    from(bucket: unknown): StorageBucket;
    createS3Uri?: (bucket: unknown, path: string) => string;
    tryParseS3Uri?: (input: string) => { bucket: unknown; path: string } | null;
  };
  export const secret: { get(key: string): Promise<string | undefined> };
  export const vars: { get(key: string): string | undefined };
  export const ctx: {
    runInBackground(task: Promise<unknown>): void;
    waitUntil(task: Promise<unknown>): void;
  };
}

declare module "edgespark/http" {
  export const auth: {
    user?: unknown;
    isAuthenticated?: () => boolean | Promise<boolean>;
  };
}
