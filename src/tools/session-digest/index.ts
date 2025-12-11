import {
  createSessionDigestTool,
  getSessionDigestTool,
  listSessionDigestsTool,
  updateSessionDigestTool,
} from "./digest-tools";
import { generateDigestFromNotesTool } from "./generate-digest-tool";

export * from "./digest-tools";
export * from "./generate-digest-tool";

export const sessionDigestTools = {
  createSessionDigest: createSessionDigestTool,
  getSessionDigest: getSessionDigestTool,
  listSessionDigests: listSessionDigestsTool,
  updateSessionDigest: updateSessionDigestTool,
  generateDigestFromNotes: generateDigestFromNotesTool,
} as const;
