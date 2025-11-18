export const FULL_REBUILD_THRESHOLD =
  typeof process !== "undefined" && process.env.FULL_REBUILD_THRESHOLD
    ? Number.parseInt(process.env.FULL_REBUILD_THRESHOLD, 10)
    : 100;

export const PARTIAL_REBUILD_THRESHOLD =
  typeof process !== "undefined" && process.env.PARTIAL_REBUILD_THRESHOLD
    ? Number.parseInt(process.env.PARTIAL_REBUILD_THRESHOLD, 10)
    : 20;
