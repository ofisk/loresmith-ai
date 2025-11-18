import {
  createSessionDigestTool,
  getSessionDigestTool,
  listSessionDigestsTool,
  updateSessionDigestTool,
} from "./digest-tools";

export * from "./digest-tools";

export const sessionDigestTools = {
  createSessionDigest: createSessionDigestTool,
  getSessionDigest: getSessionDigestTool,
  listSessionDigests: listSessionDigestsTool,
  updateSessionDigest: updateSessionDigestTool,
} as const;
