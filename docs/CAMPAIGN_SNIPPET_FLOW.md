# Campaign Snippet Flow

## Overview

The Campaign Snippet Flow is a sophisticated content curation system that allows users to selectively incorporate relevant content from their library into campaign-specific knowledge bases. This system ensures that campaign AI agents have access to high-quality, curated information while maintaining isolation between different campaigns.

## What Are Snippets?

Snippets are structured content entities extracted from uploaded files that represent meaningful, reusable game content. Unlike raw text chunks, snippets are intelligently parsed and categorized into specific content types that can be directly used in campaigns.

### Core Entities (Things You Can Drop Into Play)

#### **Monster / Creature Stat Block**

- **Fields**: name, type, size, alignment, AC, HP, speed, ability scores, saves/skills, senses, languages, CR, traits, actions/bonus/legendary/lair, reactions, spellcasting, tags, source refs
- **Use Case**: Ready-to-use monsters and creatures for encounters

#### **NPC (Non-Statblock)**

- **Fields**: name, role, faction, goals, secrets, bonds, quirks, appearance, talking points, motivations, statblock ref (if any), relationships
- **Use Case**: Characters that drive story and provide quest hooks

#### **Spell**

- **Fields**: name, level, school, casting time, range, components, duration, classes, text, at-higher-levels, tags (damage types, conditions), source refs
- **Use Case**: Magic system content for spellcasters

#### **Magic Item / Artifact / Consumable**

- **Fields**: name, rarity, type (weapon/armor/wondrous/potion/scroll/etc.), attunement req, properties, charges, activation, curse?, variants, source refs
- **Use Case**: Treasure and equipment for player rewards

#### **Trap / Hazard**

- **Fields**: name, trigger, effect, DCs, detection/disarm, damage types, reset, countermeasures, CR/"danger" rating
- **Use Case**: Environmental challenges and dungeon hazards

#### **Environmental Effect**

- **Fields**: name, scope, triggers, effects, saves/DCs, duration, counters
- **Use Case**: Weather, regional effects, lair actions

#### **Condition / Disease / Curse**

- **Fields**: name, onset, symptoms/effects, progression, cure, DCs, tags
- **Use Case**: Status effects and narrative complications

#### **Vehicle / Mount**

- **Fields**: name, type, stats (AC/HP/speed/capacity), crew, actions, traits, mishaps
- **Use Case**: Transportation and mounted combat

### Adventure Structure (Story & Flow)

#### **Plot Hook**

- **Fields**: hook text, who/where/why, leads-to (scene/quest IDs), stakes, tags
- **Use Case**: Story starters and campaign beginnings

#### **Major Plot Line / Arc**

- **Fields**: title, premise, act/beat list, dependencies, fail-forward paths, resolutions, tags
- **Use Case**: Campaign storylines and major quest arcs

#### **Quest / Side Quest**

- **Fields**: title, objective, steps/scenes, success/failure outcomes, rewards, XP/milestones, involved NPCs/locations/monsters, prerequisites
- **Use Case**: Structured adventures and missions

#### **Scene / Encounter (Structured)**

- **Fields**: title, type (combat/social/exploration/skill challenge), setup, goal, participants, terrain/map ref, tactics, scaling notes, outcomes, treasure, next-scenes
- **Use Case**: Ready-to-run encounters and scenes

#### **Clue / Secret**

- **Fields**: text, points-to (NPC/place/scene), delivery methods (handout/skill check/rumor), redundancy options
- **Use Case**: Mystery elements and investigation content

### Locations & World Objects

#### **Location / Site**

- **Fields**: name, type, overview, keyed areas, inhabitants, features/hazards, treasure, clues, map refs, travel info (distance, routes), tags
- **Use Case**: Dungeons, cities, regions, and points of interest

#### **Lair**

- **Fields**: owner, features, lair actions, regional effects, treasure, encounter tables
- **Use Case**: Monster lairs and strongholds

#### **Faction / Organization**

- **Fields**: name, purpose, assets, notable NPCs, ranks, secrets, fronts/clocks, relationships to others
- **Use Case**: Political and social structures

#### **Deity / Patron / Power**

- **Fields**: name, domains/tenets, boons, edicts/anathema, rites, favored items/spells, symbol
- **Use Case**: Religious and supernatural entities

### Player-Facing Mechanics & Options

#### **Background**

- **Fields**: name, proficiencies, languages/tools, equipment, feature, suggested characteristics
- **Use Case**: Character creation and development

#### **Feat**

- **Fields**: name, prerequisites, effect text, scaling, tags
- **Use Case**: Character customization options

#### **Subclass / Class Option / Race-Lineage**

- **Fields**: name, parent class/species, level features, spell list adds, restrictions, flavor text
- **Use Case**: Character class and race options

#### **Downtime Activity / Crafting Rule**

- **Fields**: name, requirements, procedure, checks/DCs, time/cost, outcomes/complications
- **Use Case**: Between-adventure activities

#### **Variant / Optional Rule**

- **Fields**: name, replaces/modifies, rule text, examples, safety notes
- **Use Case**: House rules and system modifications

### Reference & Generators

#### **Random Table**

- **Fields**: title, dice (e.g., d20), rows (range → result), usage notes
- **Use Case**: Rumors, treasure, encounters, names, and procedural content

#### **Encounter Table**

- **Fields**: environment, level band, rows (result → creature set), pacing notes
- **Use Case**: Random encounters and wilderness exploration

#### **Treasure Table / Parcel**

- **Fields**: tier/CR, coin/gems/art, magic item refs, parcels by milestone
- **Use Case**: Loot distribution and treasure generation

### Assets & Aides

#### **Map**

- **Fields**: title, scale, grid?, labels/keyed areas, player vs GM versions, file refs
- **Use Case**: Visual aids and spatial reference

#### **Handout**

- **Fields**: title, delivery (note/prop/art), text/art ref, when to reveal, redactions
- **Use Case**: Player-facing information and props

#### **Puzzle / Riddle**

- **Fields**: prompt, solution, hints/escalation, failure stakes, bypass methods
- **Use Case**: Intellectual challenges and problem-solving

#### **Stat Block Appendix**

- **Fields**: entity name → page anchors/IDs
- **Use Case**: Quick reference and indexing

### Timelines & Campaign Glue

#### **Timeline / Clock**

- **Fields**: title, phases/segments, trigger events, consequences per tick, reset/advance rules
- **Use Case**: Campaign pacing and time-sensitive events

#### **Travel Route**

- **Fields**: origin/destination, distance/time, encounters table link, costs, checkpoints
- **Use Case**: Journey planning and travel encounters

### Metadata Framework

Every snippet includes standardized metadata:

- **id**: Stable slug for referencing
- **type**: Content category (monster, spell, location, etc.)
- **name/title**: Display name
- **oneLine**: Brief description
- **summary**: Detailed description
- **tags[]**: Categorization tags
- **source**: Book/module, page range, anchor
- **campaignId**: Campaign association (if applicable)
- **priority**: Must-prep vs nice-to-have
- **safety**: Content notes and warnings
- **relations[]**: Links to other snippets (uses, appears-in, blocks, unlocks)
- **mediaRefs[]**: Associated maps, handouts, art
- **createdFrom**: Source file and chunk offsets
- **confidence**: Extraction confidence score

## User Flow

### 1. Library Setup (Already Working)

- **User uploads files** to their personal library
- **Library AutoRAG processes** the files for enhanced searchability and content extraction
- **Library component updates** to show newly uploaded files with processing status indicators

### 2. Campaign Creation (Already Working)

- **User creates a campaign** with a specific theme or purpose
- **Campaign AutoRAG folders** are automatically created for isolated campaign-specific queries
- **Campaign component updates** to show the newly created campaign

### 3. Content Curation Process

- **User selects files** from their library to add to a campaign
- **Campaign selection modal** allows choosing which campaign to add content to
- **Snippet generation** automatically queries the library AutoRAG for relevant content
- **Snippets are presented** one at a time with Approve/Reject options
- **User curates content** by approving relevant snippets and rejecting irrelevant ones
- **Approved snippets** are added to the campaign's knowledge base for future AI queries

## Technical Architecture

### Library AutoRAG Layer

- **Purpose**: Processes and indexes all uploaded files for enhanced searchability
- **Function**:
  - Extracts structured content entities (monsters, spells, NPCs, locations, etc.)
  - Parses content into categorized snippets with standardized fields
  - Generates embeddings for semantic search capabilities
  - Maintains metadata relationships between content
- **Scope**: Global across all campaigns and users
- **Content Types**: 30+ structured content types including core entities, adventure structure, locations, mechanics, and assets

### Campaign AutoRAG Layer

- **Purpose**: Provides campaign-specific knowledge bases with curated content
- **Function**: Stores approved snippets in isolated collections for each campaign
- **Scope**: Isolated per campaign to prevent information bleeding

### Staging System

- **Purpose**: Temporary holding area for snippet candidates before approval/rejection
- **Function**: Presents content to users for curation decisions
- **Lifecycle**: Staging → Approved/Rejected → Cleanup

## Value Proposition

### For Users

#### 1. **Structured Content Curation**

- Users curate meaningful, structured content entities (monsters, spells, NPCs, locations, etc.)
- Each snippet is categorized and contains standardized fields for consistent use
- Prevents irrelevant or low-quality information from polluting campaign knowledge bases
- Ensures AI responses are focused and relevant to the campaign's specific context

#### 2. **Campaign Isolation**

- Different campaigns can have completely different knowledge bases
- A "Fantasy RPG" campaign won't be contaminated by "Sci-Fi" content
- Allows for specialized AI behavior per campaign context

#### 3. **Efficient Content Management**

- Leverages existing library content without requiring re-upload
- Automatic snippet generation reduces manual content curation effort
- Streamlined approval/rejection process for quick content selection

#### 4. **Scalable Knowledge Bases**

- Campaigns can grow their knowledge bases incrementally
- Users can add new content as campaigns evolve
- Maintains performance through curated, relevant content sets

### For AI Agents

#### 1. **Focused Knowledge Access**

- AI agents only have access to approved, relevant content
- Reduces noise and improves response quality
- Enables more accurate and contextual responses

#### 2. **Campaign-Specific Behavior**

- AI agents can adopt different personas based on campaign context
- Knowledge bases can be tailored to specific campaign themes
- Enables specialized AI behavior per campaign

#### 3. **Performance Optimization**

- Smaller, curated knowledge bases improve query performance
- Reduced search space leads to faster, more relevant responses
- Better resource utilization through targeted content access

## Implementation Details

### API Endpoints

#### Snippet Generation

```
POST /campaigns/:campaignId/snippets/generate
```

- Queries library AutoRAG for all structured content entities from the specific file
- Filters results to include only snippets extracted from the target file
- Converts library snippets to staging format while preserving entity types and metadata
- Saves candidates to campaign staging area for user approval/rejection

#### Staged Snippets

```
GET /campaigns/:campaignId/snippets/staged
```

- Retrieves snippets awaiting approval/rejection
- Returns formatted data for UI presentation

#### Snippet Approval

```
POST /campaigns/:campaignId/snippets/approve
```

- Moves snippets from staging to approved collection
- Supports optional snippet expansions
- Updates campaign knowledge base

#### Snippet Rejection

```
POST /campaigns/:campaignId/snippets/reject
```

- Moves snippets from staging to rejected collection
- Records rejection reason for future reference
- Maintains audit trail of curation decisions

### Data Flow

1. **Library Processing**: Files → Library AutoRAG → Structured Content Entities (Monsters, Spells, NPCs, etc.)
2. **Campaign Addition**: File Selection → Campaign Resource Addition
3. **Snippet Generation**: Library Query → Filter by File → Structured Snippet Candidates → Staging
4. **User Curation**: Staged Snippets → Approval/Rejection → Campaign Knowledge Base
5. **AI Access**: Campaign Knowledge Base → AI Agent Responses with Structured Content

### Storage Structure

```
/autorag/
├── library/                    # Global library AutoRAG
│   ├── [processed files]
│   └── [indexed content]
└── campaigns/
    └── [campaign-id]/
        ├── staging/            # Temporary snippet candidates
        ├── approved/           # Curated campaign knowledge
        └── rejected/           # Rejected content (for audit)
```

## Benefits

### Immediate Benefits

- **Better AI Responses**: Curated content leads to more relevant and accurate AI responses
- **Campaign Focus**: Each campaign maintains its own specialized knowledge base
- **User Control**: Full control over what content AI agents can access

### Long-term Benefits

- **Scalability**: System can handle growing content libraries efficiently
- **Quality Assurance**: Continuous curation improves overall content quality
- **Flexibility**: Easy to adapt campaigns to different themes and contexts

### Competitive Advantages

- **Content Isolation**: Prevents information bleeding between campaigns
- **User Empowerment**: Gives users control over AI knowledge bases
- **Efficient Curation**: Streamlined process for content selection and management

## Future Enhancements

### Planned Features

- **Bulk Operations**: Approve/reject multiple snippets at once
- **Snippet Editing**: Modify snippets before approval
- **Content Suggestions**: AI-powered recommendations for snippet approval
- **Analytics**: Track snippet usage and effectiveness

### Potential Improvements

- **Smart Filtering**: Automatic filtering based on campaign context
- **Content Scoring**: Quality scoring for snippet candidates
- **Collaborative Curation**: Multiple users can curate campaign content
- **Version Control**: Track changes to campaign knowledge bases over time

## Conclusion

The Campaign Snippet Flow represents a sophisticated approach to content curation that balances automation with user control. By leveraging existing library content while maintaining strict campaign isolation, the system provides users with powerful tools for creating focused, high-quality AI knowledge bases tailored to their specific campaign needs.

This system not only improves the quality of AI responses but also empowers users to maintain control over their AI agents' knowledge, ensuring that each campaign can have its own unique character and focus while building upon the user's existing content library.
