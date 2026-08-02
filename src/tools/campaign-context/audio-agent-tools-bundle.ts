// Audio agent tools bundle (issue #788)

import { campaignAudioToolsBundle } from "./audio-tools";
import { listAllEntities, searchCampaignContext } from "./search-tools";

/**
 * GM toolset for the audio agent.
 *
 * The three audio tools alone are not enough to satisfy the reason this feature
 * exists. `prepareAudioGeneration` loads campaign tone from the campaign record
 * on its own, but entity detail is only pulled when an `entityId` is supplied —
 * so without a way to resolve "the crypt" to an entity, the agent would fall
 * back to echoing the GM's own words into `hint`. That is precisely the
 * "describing your world back to the machine" failure `docs/GENERATED_AUDIO.md`
 * calls out as the thing generated audio is supposed to replace.
 *
 * The two search tools are read-only and already part of the player-safe
 * campaign context bundle, so including them widens no permission.
 */
export const gmAudioToolsBundle = {
	...campaignAudioToolsBundle,
	searchCampaignContext,
	listAllEntities,
};

/**
 * Players get nothing.
 *
 * Unlike campaign context, audio has no player-safe subset: titles are built
 * from campaign entities by `buildAudioTitle`, so a track called
 * "Theme: The Betrayer's Reveal" spoils a session merely by being listed. This
 * mirrors the route-level GM gate in `src/routes/campaign-audio.ts`.
 */
export const playerAudioToolsBundle: Record<string, never> = {};
