/**
 * Adaptive Shard Management System
 *
 * This system provides a flexible way to display and edit both structured
 * and unstructured shard data, with automatic type detection and appropriate
 * UI components for each shard type.
 */

export { FlexibleShardCard } from "./FlexibleShardCard";

// UI Components
export { PropertyField, PropertyGrid } from "./PropertyField";
export { ShardGrid } from "./ShardGrid";
export { ShardTemplateBuilder } from "./ShardTemplateBuilder";
export { StructuredShardCard } from "./StructuredShardCard";
// Core utilities
export {
	type FlexibleShard,
	getConfidenceColorClass,
	getConfidenceDescription,
	getEditableProperties,
	getShardStructure,
	getShardTypeDisplayName,
	getShardTypeIcon,
	isKnownStructure,
	type Shard,
	type ShardMetadata,
	type StructuredShard,
	validateShardStructure,
} from "./shard-type-detector";
