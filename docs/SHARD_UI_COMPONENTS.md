# Shard UI Components

A flexible system for displaying and editing both structured and unstructured shard data with automatic type detection and appropriate UI components.

## Features

### 🎯 **Automatic Type Detection**

- Detects known structured shard types (spells, monsters, items, etc.)
- Falls back to flexible display for custom/unstructured shards
- Extensible system for adding new structured types

### 🎨 **Adaptive UI Components**

- **StructuredShardCard**: Clean, organized display for known types - dynamically renders whatever properties are present
- **FlexibleShardCard**: Flexible display for custom shards with inline editing
- **PropertyField**: Generic editable field component supporting strings, numbers, arrays, and objects

### 🔧 **Advanced Features**

- **Bulk Operations**: Select and perform actions on multiple shards
- **Advanced Filtering**: Search, filter by type, confidence, and selection status
- **Inline Editing**: Edit properties directly in the display
- **JSON Toggle**: View raw JSON for power users
- **Dynamic Property Discovery**: No hardcoded properties - adapts to whatever data is present

## Dependencies

This component system requires:

- **React** 18+
- **lucide-react** for icons
- **Tailwind CSS** for styling

Install dependencies:

```bash
npm install lucide-react
```

## Quick Start

```tsx
import { ShardGrid } from "../components/shard";

function MyShardManagement() {
  const [shards, setShards] = useState(shardData);

  return (
    <ShardGrid
      shards={shards}
      campaignId="my-campaign"
      resourceName="My Resource.pdf"
      onShardEdit={(id, updates) => {
        // Handle shard updates
      }}
      onBulkAction={(action, ids) => {
        // Handle bulk operations
      }}
    />
  );
}
```

## Component Architecture

### Core Components

#### `ShardTypeDetector`

Utility functions for detecting and categorizing shard types:

- `isKnownStructure()` - Determines if shard matches a known type from STRUCTURED_ENTITY_TYPES
- `getEditableProperties()` - Extracts editable properties from shard
- No required property validation - users can edit anything

#### `PropertyField`

Generic editable field component supporting:

- **String fields**: Text input
- **Number fields**: Number input
- **Array fields**: Tag-based interface with add/remove
- **Object fields**: JSON textarea with validation

#### `StructuredShardCard`

**Fully dynamic display for known shard types** - adapts to whatever properties are present:

- **Dynamic display name**: Uses `name`, `title`, or `id`
- **Smart subtitle**: Automatically shows key properties like `level`, `cr`, `school`, `rarity`, `size`
- **Quick info grid**: Shows 2-4 most important non-text properties when collapsed
- **Flexible editing**: All properties are editable, no hardcoded fields
- Works with spells, monsters, items, NPCs, locations, rules, or any structured type

#### `FlexibleShardCard`

Adaptive display for custom/unstructured shards:

- **Property grid**: Organized display of all properties
- **Add/remove properties**: Dynamic field management
- **JSON toggle**: Switch between structured and raw views
- **Smart grouping**: Groups related properties

#### `ShardGrid`

Main container component with:

- **Bulk selection**: Checkbox-based selection
- **Advanced filtering**: Search, type, confidence filters
- **Bulk actions**: Approve, reject, edit multiple shards
- **Grouped display**: Shards grouped by type

## Supported Shard Types

### Structured Types (with dynamic UI)

All types from `src/lib/entity-types.ts` are supported:

- **monsters**: Creatures with CR, AC, HP, abilities, etc.
- **npcs**: Non-statblock characters with roles, goals, relationships
- **spells**: Spell descriptions with level, school, casting time, etc.
- **items**: Magic items, artifacts, consumables with rarity, properties
- **locations**: Rooms, buildings, dungeons, regions, cities
- **feats**: Character feats with prerequisites, effects
- **rules**: Variant and optional rules
- **hooks**: Plot hooks and adventure starters
- **quests**: Quests with objectives, steps, rewards
- And 20+ more types...

The UI automatically adapts to whatever properties each shard has - no hardcoding needed.

### Flexible Types (generic display)

- Any custom type not in STRUCTURED_ENTITY_TYPES
- Automatically detected and displayed with flexible UI
- Same editing capabilities as structured types

## Customization

### Adding New Structured Types

1. **Update entity types**:

```typescript
// In src/lib/entity-types.ts
export const STRUCTURED_ENTITY_TYPES = [
  // ... existing types
  "custom_type",
] as const;
```

2. **Add display name**:

```typescript
// In src/lib/entity-types.ts
export function getEntityTypeDisplayName(type: StructuredEntityType): string {
  const displayNames: Record<StructuredEntityType, string> = {
    // ... existing types
    custom_type: "Custom Type",
  };
  return displayNames[type];
}
```

3. **Add icon** (optional):

```typescript
// In src/components/shard/ShardTypeDetector.ts
const icons: Record<string, string> = {
  // ... existing icons
  custom_type: "🔧",
};
```

That's it! The StructuredShardCard will automatically handle the new type dynamically.

### Styling

The system uses Tailwind CSS classes and follows a consistent design pattern:

- **Cards**: White background with gray borders
- **Headers**: Clear typography with icons and metadata
- **Properties**: Organized in grids with clear labels
- **Actions**: Consistent button styling and placement

## Integration Examples

### Basic Integration

```tsx
<ShardGrid
  shards={myShards}
  campaignId="campaign-123"
  onShardEdit={handleEdit}
/>
```

### With Custom Actions

```tsx
<ShardGrid
  shards={myShards}
  campaignId="campaign-123"
  onShardEdit={handleEdit}
  onBulkAction={(action, ids) => {
    if (action === "approve") {
      approveShards(ids);
    } else if (action === "reject") {
      rejectShards(ids);
    }
  }}
/>
```

## Performance Considerations

- **Large datasets**: The system handles large numbers of shards efficiently
- **Filtering**: Client-side filtering with debounced search
- **Rendering**: Virtual scrolling could be added for very large lists
- **Updates**: Optimistic updates with rollback on failure

## Design Principles

1. **LLM-Driven Display**: Display logic is determined by the LLM during extraction via `display_metadata`, not hardcoded
2. **No Hardcoded Properties**: Components discover and adapt to whatever properties are present
3. **No Required Fields**: Users can edit anything, system doesn't enforce structure
4. **Single Source of Truth**: Uses existing STRUCTURED_ENTITY_TYPES from `src/lib/entity-types.ts`
5. **Dynamic Rendering**: All cards use the same dynamic rendering logic
6. **Graceful Degradation**: Unknown types get flexible display automatically

## Display Metadata

During content extraction, the LLM provides `display_metadata` for intelligent UI rendering:

```typescript
interface DisplayMetadata {
  display_name?: string; // Primary name to show (e.g., "Fireball")
  subtitle?: string[]; // Key characteristics (e.g., ["Level 3", "Evocation"])
  quick_info?: string[]; // Important property names (e.g., ["casting_time", "range"])
  primary_text?: string; // Main description field name (e.g., "text")
}
```

**Benefits:**

- LLM decides what's important based on content context
- Adapts to any content type automatically
- No hardcoded property names or display logic
- Evolves without code changes as LLM improves

**Fallback:** If `display_metadata` is missing, components use sensible defaults (name/title for display name, auto-detect important properties).

## Related Documentation

- [Campaign Shard Flow](./CAMPAIGN_SHARD_FLOW.md) - Overview of the shard curation system
- [Entity Types](../src/lib/entity-types.ts) - Defined structured entity types
