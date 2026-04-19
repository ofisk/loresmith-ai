import { z } from "zod";

/**
 * Single permissive schema for all `pcs` content. GMs attach arbitrary rules
 * documents; PC JSON stays open-ended.
 */
export const genericPcContentSchema = z.object({}).passthrough();

/**
 * Optional stricter hints for teams that want them; not wired into default validation.
 * @see genericPcContentSchema
 */
export const dnd5ePcContentSchema = z
	.object({
		characterName: z.string().optional(),
		name: z.string().optional(),
		characterClass: z.string().optional(),
		characterLevel: z.union([z.number(), z.string()]).optional(),
		characterRace: z.string().optional(),
		backstory: z.string().optional(),
		summary: z.string().optional(),
		armorClass: z.number().optional(),
		hitPoints: z.number().optional(),
		hitPointMaximum: z.number().optional(),
	})
	.passthrough();

/** All campaigns use the same open PC content contract. */
export function getPcContentSchemaForGameSystem(_gameSystem: string) {
	return genericPcContentSchema;
}
