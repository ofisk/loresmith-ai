/**
 * Adaptive Shard Management System
 *
 * This system provides a flexible way to display and edit both structured
 * and unstructured shard data, with automatic type detection and appropriate
 * UI components for each shard type.
 */

// Core utilities
export {
  isKnownStructure,
  getShardStructure,
  getEditableProperties,
  validateShardStructure,
  getShardTypeDisplayName,
  getShardTypeIcon,
  getConfidenceColorClass,
  getConfidenceDescription,
  type Shard,
  type StructuredShard,
  type FlexibleShard,
  type ShardMetadata,
} from "./shard-type-detector";

// UI Components
export { PropertyField, PropertyGrid } from "./PropertyField";
export { StructuredShardCard } from "./StructuredShardCard";
export { FlexibleShardCard } from "./FlexibleShardCard";
export { ShardGrid } from "./ShardGrid";
export { ShardTemplateBuilder } from "./ShardTemplateBuilder";
