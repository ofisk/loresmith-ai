/**
 * Security and validation for resource proposals.
 * Uses allowlist-based file validation (see file-upload-security).
 */

import { getAllowedExtensionsDescription } from "./file/file-upload-security";

export { isFileAllowedForProposal } from "./file/file-upload-security";

/** Returns allowed formats for error messages. */
export function getBlockedExtensionsDescription(): string {
	return getAllowedExtensionsDescription();
}

/** Legal notice shown to proposers before creating a proposal */
export const PROPOSAL_LEGAL_NOTICE = `By proposing this file, you grant the campaign GM read access to review it before approving. You confirm:

• You have the right to share this content
• The file does not contain malicious code, viruses, or illegal content
• You understand the recipient will be able to download and review the file`;
