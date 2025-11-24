# Shard Approval System Documentation

## Overview

The shard approval system ensures that only user-approved content is included in campaign RAG queries, while rejected content is permanently excluded. This document explains how the system works and how to use it.

Shards can come from two sources:

1. **File-based shards**: Generated from uploaded PDFs and documents
2. **Conversational shards**: AI-detected context from user conversations

Both types go through the same approval workflow via the Shard Management UI.

## How It Works

### 1. Shard Generation & Staging

Shards are generated and stored in a **staging area** awaiting user review:

#### **File-Based Shards:**

When files are added to a campaign, shards are generated from file content:

```
R2 Path: campaigns/<campaignId>/<resourceId>/staging/<shard-id>.json
```

#### **Conversational Shards:**

When the AI detects important context in conversation, it creates staging shards:

```
R2 Path: campaigns/<campaignId>/conversation/staging/<shard-id>.json
```

**Example conversational shard creation:**

```
User: "I'm planning a horror campaign with themes of gloom and dread"
Agent: [Detects campaign preferences]
  → Creates staging shard with title "Campaign Themes"
  → Sends notification to user
  → Appears in Shard Management UI for approval

User: "Let's go with plot idea #3"
Agent: [Detects plot decision]
  → Creates staging shard with title "Main Plot Selected"
  → Content includes full plot details
  → Awaits user approval
```

These staged shards are **not yet searchable** and await user review.

### 2. User Review via UI

Users can review staged shards through the **Shard Management Overlay** (accessible via the expandable panel on the right side of the UI):

- **Approve**: User accepts the shard as accurate and useful
- **Reject**: User marks the shard as incorrect/unwanted (requires a reason)

### 3. Approval Flow

When a shard is approved:

1. The shard is **moved** from staging to the approved folder:

   ```
   From: campaigns/<campaignId>/<resourceId>/staging/<shard-id>.json
   To:   campaigns/<campaignId>/<resourceId>/approved/<shard-id>.json
   ```

2. The shard becomes **immediately searchable** via RAG queries

3. Future campaign queries will **only return approved shards**

**Implementation**: `src/services/campaign/` → shard approval services

### 4. Rejection Flow

When a shard is rejected:

1. The shard is **wrapped with rejection metadata**:

   ```json
   {
     "rejectedAt": "2025-10-08T12:34:56Z",
     "reason": "User's rejection reason",
     "payload": {
       /* original shard data */
     }
   }
   ```

2. It's **moved** to the rejected folder:

   ```
   From: campaigns/<campaignId>/<resourceId>/staging/<shard-id>.json
   To:   campaigns/<campaignId>/<resourceId>/rejected/<shard-id>.json
   ```

3. Rejected shards are **permanently excluded** from all searches

**Implementation**: `src/services/campaign/` → shard rejection services

## Enforced Filtering

### The Filter Mechanism

The campaign context service implements filtering to return only approved content:

### How Filters Are Applied

All search operations automatically filter to approved content only:

```typescript
// Search automatically filters to approved content only
async searchCampaignContext(campaignId: string, query: string, options = {}) {
  // Only searches within approved shards for the campaign
  return await planningService.searchCampaignContext(
    campaignId,
    query,
    { ...options, approvedOnly: true }
  );
}
```

**Key Point**: The enforced filter is applied **server-side** and cannot be bypassed by client code. Users can only search approved content.

## Campaign State System

### Descriptive States vs. Numerical Scores

The system uses **descriptive campaign states** instead of raw numerical scores for better user experience:

| State          | Score Range | Description                                                          |
| -------------- | ----------- | -------------------------------------------------------------------- |
| Fresh Start    | 0-19        | Just beginning the journey - perfect for exploring new possibilities |
| Newly Forged   | 20-29       | Taking first steps - the foundation is being laid                    |
| Taking Root    | 30-39       | Establishing foundations - the roots are growing strong              |
| Taking Shape   | 40-49       | Developing identity - the form is becoming clearer                   |
| Growing Strong | 50-59       | Building momentum - growth is steady and encouraging                 |
| Flourishing    | 60-69       | Thriving - development is robust and promising                       |
| Well-Traveled  | 70-79       | Matured beautifully - ready for complex adventures                   |
| Epic-Ready     | 80-89       | Prepared for legendary quests - in excellent shape                   |
| Legendary      | 90-100      | Achieved legendary status - a masterpiece of preparation             |

### Campaign State Fluctuations

**Important**: As users add new NPCs, locations, plot hooks, and other elements, their campaign state may shift "backwards" to reflect areas needing detail. This is **healthy growth** - the world is expanding and evolving!

Example flow:

1. Campaign starts at "Taking Root" with basic elements
2. User adds 5 new NPCs → State shifts to "Taking Shape" (more quantity, needs detail)
3. User develops NPC backgrounds → State rises to "Flourishing"
4. User adds plot hooks → May shift again as new content awaits development

This is by design - the system encourages iterative development: add content → flesh it out → add more → develop more.

### Next Milestones

The `getNextMilestone()` utility provides specific, actionable steps for each state transition:

```typescript
// Example for Fresh Start → Newly Forged
{
  threshold: 20,
  state: "Newly Forged",
  description: "Start by adding basic campaign elements to establish your foundation",
  actionableSteps: [
    "Create your first character (player or NPC) with a name and brief description",
    "Upload a campaign resource like an adventure module, map, or reference document",
    "Add a location description for your starting area or town"
  ]
}
```

Users receive clear guidance on what specific actions will help them progress to the next state.

## Campaign Context Integration

### Context Types Synced to Campaign Storage

Campaign-specific content is automatically stored as **pre-approved shards**:

1. **Campaign Title & Description** - Synced on creation and update
2. **Characters** (`campaign_characters` table) - Synced on creation
3. **Character Sheets** (`character_sheets` table) - Synced on creation
4. **Campaign Context** (`campaign_context` table) - Synced on creation
5. **Campaign Notes** - On-the-fly user decisions, ideas, and information
6. **File Resources** (PDFs, documents added to campaign)

### Sync Service

The `CampaignContextSyncService` handles syncing campaign context:

```typescript
// Sync campaign title and description
await syncService.syncContextToCampaign(
  campaignId,
  `${campaignId}-title`,
  "campaign_info",
  "Campaign Title",
  campaignName,
  { field: "title" }
);

// Sync pre-approved shard from character
await syncService.syncCharacterToCampaign(
  campaignId,
  characterId,
  characterName,
  characterData
);

// Sync on-the-fly campaign notes/decisions
await syncService.syncCampaignNote(
  campaignId,
  noteId,
  "Session 5 Decision",
  "The party decided to ally with the Dark Elves",
  "decision"
);

// Stores at: campaigns/<campaignId>/context/approved/<id>.json
```

**Why Pre-Approved?**: User-created content (characters, context, notes) is assumed to be correct and is stored directly in the approved folder, skipping the staging/review process.

### Search Integration

Campaign context searches use semantic search with filtering:

```typescript
// Semantic search with approved content filtering
const planningService = new PlanningContextService(env);
const results = await planningService.searchCampaignContext(campaignId, query, {
  limit: 20,
});
```

**Benefits**:

- Semantic understanding of queries
- Unified search across all content types
- Automatic filtering to approved-only content
- Better context retrieval for AI responses

## File Structure

```
campaigns/<campaignId>/
├── <resourceId>/
│   ├── staging/          # File-based shards awaiting review
│   │   └── <shard-id>.json
│   ├── approved/         # User-approved file shards (searchable)
│   │   └── <shard-id>.json
│   └── rejected/         # User-rejected file shards (excluded)
│       └── <shard-id>.json
├── conversation/
│   ├── staging/          # AI-detected context awaiting review
│   │   └── <shard-id>.json
│   ├── approved/         # User-approved conversational shards (searchable)
│   │   └── <shard-id>.json
│   └── rejected/         # User-rejected conversational shards (excluded)
│       └── <shard-id>.json
└── context/
    └── approved/         # Pre-approved campaign context (title, description, etc.)
        ├── <campaignId>-title.json
        ├── <campaignId>-description.json
        ├── <character-id>.json
        ├── <sheet-id>.json
        └── <context-id>.json
```

## API Endpoints

### Get Staged Shards

```
GET /api/campaigns/:campaignId/shards/staged
```

Returns all pending shards awaiting user review.

### Approve Shards

```
POST /api/campaigns/:campaignId/shards/approve
Body: { shardIds: string[], stagingKeys: string[] }
```

Approves selected shards, moving them to the approved folder.

### Reject Shards

```
POST /api/campaigns/:campaignId/shards/reject
Body: { shardIds: string[], stagingKeys: string[], reason: string }
```

Rejects selected shards with a reason, moving them to the rejected folder.

## UI Components

### ShardOverlay

- **Location**: Right side of screen (expandable panel)
- **Shows**: Badge with pending shard count
- **Auto-expands**: When new shards are generated
- **Actions**: Bulk approve/reject, individual shard actions

### UnifiedShardManager

- **Displays**: Grouped shards by campaign and resource
- **Features**:
  - Select all/individual shards
  - Bulk approval/rejection
  - Rejection reason input (required)
  - Visual feedback for processed shards

## Testing the System

### 1. Test Shard Approval Flow

1. Add a file to a campaign
2. Wait for shards to be generated (they appear in staging)
3. Open the Shard Management overlay (right panel)
4. Review and approve/reject shards
5. Verify approved shards appear in campaign context searches
6. Verify rejected shards are excluded

### 2. Test Filter Enforcement

```typescript
// This search will ONLY return approved shards
const planningService = new PlanningContextService(env);
const results = await planningService.searchCampaignContext(
  campaignId,
  "find characters named John"
);

// Check: All results should have paths starting with "campaigns/123/approved/"
results.results.forEach((r) => {
  console.assert(r.metadata.path?.startsWith("campaigns/123/approved/"));
});
```

### 3. Test Campaign Context Sync

```typescript
// Create a character
const characterId = crypto.randomUUID();
await db.insert("campaign_characters", {
  /* ... */
});

// Sync to campaign storage
const syncService = new CampaignContextSyncService(env);
await syncService.syncCharacterToCampaign(
  campaignId,
  characterId,
  "Gandalf",
  characterData
);

// Verify it's searchable
const planningService = new PlanningContextService(env);
const results = await planningService.searchCampaignContext(
  campaignId,
  "wizard character"
);
// Should include Gandalf
```

## Key Files

- **`src/services/campaign/`**: Campaign-specific services
- **`src/services/campaign-context-sync-service.ts`**: Syncs campaign context to storage
- **`src/routes/campaign/`**: API endpoints for shard management
- **`src/components/chat/UnifiedShardManager.tsx`**: Shard review UI
- **`src/components/shard/ShardOverlay.tsx`**: Expandable shard panel
- **`src/tools/campaign-context/search-tools.ts`**: Campaign search tools using RAG

## Automatic Sync Behavior

Campaign context is automatically stored when:

1. **Campaign is created** - Title and description stored
2. **Campaign is updated** - Title and description updated
3. **Characters are created** - via `storeCharacterInfo` tool
4. **Character sheets are created** - via `createCharacterSheet` tool
5. **Campaign context is added** - via context creation tools
6. **Campaign notes are added** - On-the-fly decisions, ideas, and information

The storage happens immediately after database insertion, ensuring all new content is instantly searchable.

### Nebulous Campaign Context

The system supports capturing "nebulous" campaign information - decisions, ideas, and notes that emerge during gameplay:

```typescript
// Example: Capture a player decision
await syncService.syncCampaignNote(
  campaignId,
  crypto.randomUUID(),
  "Party Decision - Session 5",
  "The party chose to negotiate with the dragon rather than fight",
  "decision"
);

// Example: Capture a plot idea
await syncService.syncCampaignNote(
  campaignId,
  crypto.randomUUID(),
  "Plot Hook",
  "The mysterious stranger in the tavern is actually the king in disguise",
  "plot_hook"
);

// Example: Capture world-building details
await syncService.syncCampaignNote(
  campaignId,
  crypto.randomUUID(),
  "World Detail",
  "The city of Waterdeep has banned the use of necromancy after the incident",
  "world_building"
);
```

All of these become searchable context that the AI can reference when helping with the campaign.

## Conversational Context Capture

### How It Works

The campaign agent automatically detects when users provide important campaign information during conversation and creates **staging shards** for review:

#### **Automatic Detection**

The agent uses the `captureConversationalContext` tool when it detects:

1. **Plot Decisions**: User commits to a plot direction

   ```
   User: "Let's go with idea #3 about the haunted manor"
   Agent: [Creates staging shard]
     - Title: "Main Plot Selected"
     - Content: "Campaign plot: The Haunting of Ravencrest Manor - A gothic horror..."
     - Type: "plot_decision"
     - Confidence: 0.9
   ```

2. **Campaign Themes**: User describes campaign tone/themes

   ```
   User: "I want a horror campaign with themes of gloom, dread, and strong female leads"
   Agent: [Creates staging shard]
     - Title: "Campaign Themes"
     - Content: "Horror campaign with themes: gloom, dread, strong female leads"
     - Type: "theme_preference"
     - Confidence: 0.95
   ```

3. **World-Building**: User establishes facts about their world

   ```
   User: "In my world, magic is forbidden by the church"
   Agent: [Creates staging shard]
     - Title: "World Rule: Magic Forbidden"
     - Content: "Magic is forbidden by the church in this campaign world..."
     - Type: "world_building"
     - Confidence: 0.9
   ```

4. **House Rules**: User establishes gameplay rules
   ```
   User: "In my games, critical hits do maximum damage"
   Agent: [Creates staging shard]
     - Title: "House Rule: Critical Hits"
     - Content: "Critical hits automatically deal maximum damage..."
     - Type: "house_rule"
     - Confidence: 0.95
   ```

#### **Explicit User Requests**

When users explicitly ask to save something, the agent uses `saveContextExplicitly` which creates a **staging shard with high confidence**:

```
User: "Remember that the villain is secretly the mayor"
Agent: [Uses saveContextExplicitly]
  → Creates staging shard (confidence: 0.95)
  → Sends notification
  → "I've saved that for your review in the shard panel"
```

**Why still staging?** Even explicit requests go through review to ensure the content was captured accurately. The high confidence (0.95) indicates strong user intent.

Trigger phrases:

- "Remember this/that"
- "Add this to the campaign"
- "Don't forget"
- "Save this for later"

### User Experience Flow

1. **During Conversation**:

   ```
   User: "I'm planning a horror campaign..."
   Agent: "Great! Here are some ideas... [creates staging shard]
          I've captured your campaign themes for review."
   ```

2. **Notification Sent**:
   - User receives notification: "New shard ready for review"
   - Shard panel badge shows count of pending shards

3. **Shard Panel Auto-Expands**:
   - Right panel slides out automatically
   - Shows the new conversational shard(s)
   - Source: "Conversation: Campaign Themes"

4. **User Reviews & Approves/Rejects**:
   - User reads the captured context
   - Approves → Becomes searchable
   - Rejects → Excluded from searches

### Confidence Scoring

The agent sets confidence levels based on clarity:

- **0.95-1.0**: Explicit, clear decisions ("let's do X")
- **0.85-0.94**: Strong implications ("I like that idea")
- **0.70-0.84**: Inferred context (may need clarification)
- **< 0.70**: Don't capture (too uncertain)

Low confidence shards are still created but flagged for careful review.

### Integration with Existing Flow

Conversational shards work **exactly like file shards**:

1. Created in staging folder
2. Notification sent to user
3. Appear in Shard Management overlay
4. User approves/rejects
5. Moved to approved/rejected folder
6. Only approved shards are searchable

The only difference: source is "Conversation" instead of a filename.

All of these become searchable context that the AI can reference when helping with the campaign.

## Future Enhancements

1. **Batch Operations**: Allow approving entire resource at once
2. **Shard Editing**: Allow users to modify shard text before approval
3. **Re-review**: Move approved shards back to staging for re-review
4. **Analytics**: Track approval/rejection rates by resource type
5. **Quality Scoring**: Auto-flag low-confidence shards for review
