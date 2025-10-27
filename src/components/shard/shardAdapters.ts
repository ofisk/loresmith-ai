import type { ShardCandidate, StagedShardGroup } from "../../types/shard";
import type {
  Shard,
  StructuredShard,
  FlexibleShard,
} from "./ShardTypeDetector";

/**
 * Converts ShardCandidate from the existing system to our new Shard type
 */
export function convertShardCandidateToShard(candidate: ShardCandidate): Shard {
  try {
    // Try to parse the JSON text
    const parsedData = JSON.parse(candidate.text);

    // Create a structured shard if it has the expected structure
    if (
      parsedData &&
      typeof parsedData === "object" &&
      parsedData.id &&
      parsedData.type
    ) {
      return {
        ...parsedData,
        id: candidate.id, // ✅ CORRECT - uses candidate ID (overrides parsedData.id)
        contentId: parsedData.id, // Store content ID separately for display
        type: parsedData.type,
        confidence: candidate.metadata.confidence,
        display_metadata: parsedData.display_metadata,
      } as StructuredShard;
    }

    // If parsing fails or structure is unexpected, create a flexible shard
    return {
      id: candidate.id,
      type: candidate.metadata.entityType || "custom",
      confidence: candidate.metadata.confidence,
      text: candidate.text,
      metadata: candidate.metadata,
      sourceRef: candidate.sourceRef,
    } as FlexibleShard;
  } catch (_error) {
    // If JSON parsing fails, treat as flexible shard
    return {
      id: candidate.id,
      type: candidate.metadata.entityType || "custom",
      confidence: candidate.metadata.confidence,
      text: candidate.text,
      metadata: candidate.metadata,
      sourceRef: candidate.sourceRef,
    } as FlexibleShard;
  }
}

/**
 * Converts StagedShardGroup to an array of Shards for use with ShardGrid
 */
export function convertStagedShardGroupToShards(
  group: StagedShardGroup
): Shard[] {
  return group.shards.map(convertShardCandidateToShard);
}

/**
 * Converts multiple StagedShardGroups to a flattened array of Shards
 */
export function convertStagedShardGroupsToShards(
  groups: StagedShardGroup[]
): Shard[] {
  return groups.flatMap(convertStagedShardGroupToShards);
}

/**
 * Converts array of ShardCandidates to Shards
 */
export function convertShardCandidatesToShards(
  candidates: ShardCandidate[]
): Shard[] {
  return candidates.map(convertShardCandidateToShard);
}

/**
 * Converts our Shard back to the format expected by the existing system
 * This is useful for updating shards after editing
 */
export function convertShardToUpdate(
  shard: Shard,
  originalCandidate: ShardCandidate
): Partial<ShardCandidate> {
  // If it's a structured shard, serialize it back to JSON
  if ("type" in shard && shard.type !== "custom") {
    const {
      id: _id,
      type: _type,
      confidence: _confidence,
      display_metadata: _display_metadata,
      ...shardData
    } = shard as StructuredShard;
    return {
      text: JSON.stringify(shardData, null, 2),
      metadata: {
        ...originalCandidate.metadata,
        confidence: _confidence || originalCandidate.metadata.confidence,
      },
    };
  }

  // For flexible shards, just update the text
  return {
    text: (shard as FlexibleShard).text,
    metadata: {
      ...originalCandidate.metadata,
      confidence: shard.confidence || originalCandidate.metadata.confidence,
    },
  };
}
