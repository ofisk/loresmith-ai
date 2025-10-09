# Campaign Assessment System

## Overview

The Campaign Assessment System provides users with encouraging, actionable feedback about their campaign development progress. Instead of showing intimidating numerical scores, it uses descriptive RPG-themed states that celebrate growth and provide clear next steps.

## Architecture

### Core Components

1. **Assessment Service** (`src/services/assessment-service.ts`)
   - Analyzes user and campaign state
   - Calculates readiness scores
   - Generates recommendations

2. **Campaign State Utilities** (`src/lib/campaign-state-utils.ts`)
   - Converts scores to descriptive states
   - Generates encouraging summaries
   - Provides next milestone guidance

3. **Assessment Types** (`src/types/assessment.ts`)
   - Centralized type definitions
   - Eliminates duplication across codebase

4. **Assessment Tools** (`src/tools/campaign-context/assessment-tools.ts`)
   - Tool wrappers for agent access
   - Campaign-specific assessments

## Campaign States

### The Nine States

The system maps numerical scores (0-100) to nine descriptive states:

| State              | Score Range | When Used                                                  |
| ------------------ | ----------- | ---------------------------------------------------------- |
| **Fresh Start**    | 0-19        | New campaigns with minimal content                         |
| **Newly Forged**   | 20-29       | First elements added (1 character, 1 resource, or context) |
| **Taking Root**    | 30-39       | Basic foundations established                              |
| **Taking Shape**   | 40-49       | Campaign identity emerging                                 |
| **Growing Strong** | 50-59       | Solid foundation with development momentum                 |
| **Flourishing**    | 60-69       | Rich content across multiple dimensions                    |
| **Well-Traveled**  | 70-79       | Mature campaign ready for complex adventures               |
| **Epic-Ready**     | 80-89       | Well-developed with interconnected content                 |
| **Legendary**      | 90-100      | Masterpiece-level preparation                              |

### State Calculation

Scores are calculated based on three dimensions:

1. **Campaign Context** (0-50 points)
   - 0 items: 10 points + priority area
   - 1-2 items: 30 points + priority area
   - 3+ items: 50 points

2. **Character Development** (0-50 points)
   - 0 characters: 10 points + priority area
   - 1-2 characters: 30 points + priority area
   - 3+ characters: 50 points

3. **Resources** (0-40 points)
   - 0 resources: 10 points + priority area
   - 1-4 resources: 30 points + priority area
   - 5+ resources: 40 points

**Total Score** = Context + Characters + Resources (capped at 100)

### Why States Fluctuate

**This is intentional and healthy!** When users add new content (NPCs, locations, plot hooks), their state may temporarily decrease. This reflects:

- **Quantity vs. Quality Balance**: More content means more areas that need development
- **Iterative Development**: The system encourages add → develop → add → develop cycles
- **Growth Indicators**: A state shift after adding content means "great, now flesh these out!"

Example:

```
Campaign at "Flourishing" (score: 65)
  ↓
User adds 5 new NPCs
  ↓
Campaign shifts to "Growing Strong" (score: 55)
  → More characters = needs more detail on each
  ↓
User develops NPC backgrounds
  ↓
Campaign rises to "Well-Traveled" (score: 75)
```

## Next Milestones

### Actionable Guidance

The `getNextMilestone()` function provides specific steps to reach the next state:

```typescript
{
  threshold: 40,          // Score needed for next state
  state: "Taking Shape",  // Name of next state
  description: "Develop your campaign's unique identity and narrative direction",
  actionableSteps: [
    "Describe 2-3 key locations in detail (taverns, dungeons, cities)",
    "Create NPCs with distinct personalities and connections to your story",
    "Add plot hooks or story beats that tie your campaign elements together"
  ]
}
```

### Progressive Milestones

Each state has tailored guidance:

- **Fresh Start → Newly Forged**: Focus on creating first elements (character, resource, location)
- **Newly Forged → Taking Root**: Add diversity (2-3 of each type)
- **Taking Root → Taking Shape**: Develop narrative connections and detail
- **Taking Shape → Growing Strong**: Deepen relationships and world complexity
- **Growing Strong → Flourishing**: Add variety and atmospheric richness
- **Flourishing → Well-Traveled**: Create complex systems and lore
- **Well-Traveled → Epic-Ready**: Polish with interconnected content
- **Epic-Ready → Legendary**: Add advanced custom content
- **Legendary+**: Maintain excellence and focus on session planning

## User Experience

### What Users See

Users **never see raw numerical scores** in the UI. Instead, they see:

1. **Campaign State**: "Your campaign is Taking Root"
2. **Encouraging Description**: "Your campaign is establishing its foundations - the roots are growing strong."
3. **Summary Message**: "Your campaign is Taking Root (30/100). Every great adventure starts with a single step!"
4. **Growth Note**: "Remember: As you add new NPCs, locations, plot hooks, and other elements, your campaign state may shift to reflect areas needing detail. This is healthy growth—your world is expanding and evolving!"
5. **Next Steps**: Specific actionable tasks to reach the next milestone

### What Agents See

Agents have access to both:

- **campaignState**: For user-facing messages
- **overallScore**: For internal logic and thresholds
- **priorityAreas**: What needs attention
- **recommendations**: Specific suggestions

This allows agents to provide personalized guidance while presenting encouraging, non-technical feedback to users.

### Service Layer

**AssessmentService.getCampaignReadiness()**

```typescript
async getCampaignReadiness(
  campaignId: string,
  campaign: Campaign,
  resources: CampaignResource[]
): Promise<CampaignReadinessSummary> {
  // Get campaign data from database
  const contextData = await this.assessmentDAO.getCampaignContext(campaignId);
  const charactersData = await this.assessmentDAO.getCampaignCharacters(campaignId);

  // Calculate score (0-100)
  let overallScore = 0;
  const priorityAreas: string[] = [];
  const recommendations: string[] = [];

  // Apply scoring algorithm
  // ... (context + characters + resources)

  return {
    overallScore,
    campaignState: getCampaignState(overallScore),
    priorityAreas,
    recommendations,
  };
}
```

### Utility Layer

**getCampaignState()**

```typescript
export function getCampaignState(score: number): string {
  if (score >= 90) return "Legendary";
  else if (score >= 80) return "Epic-Ready";
  else if (score >= 70) return "Well-Traveled";
  else if (score >= 60) return "Flourishing";
  else if (score >= 50) return "Growing Strong";
  else if (score >= 40) return "Taking Shape";
  else if (score >= 30) return "Taking Root";
  else if (score >= 20) return "Newly Forged";
  else return "Fresh Start";
}
```

**generateReadinessSummary()**

```typescript
export function generateReadinessSummary(
  overallScore: number,
  campaignState: string,
  priorityAreas: string[]
): string {
  const scoreText = overallScore >= 90 ? "" : ` (${overallScore}/100)`;
  const growthNote =
    "\n\nRemember: As you add new NPCs, locations, plot hooks...";

  // Returns encouraging message based on score tier
  // Always includes growth education note
}
```

## Integration Points

### 1. Onboarding Agent

The Onboarding Agent uses campaign assessment to provide personalized guidance:

```typescript
// Get campaign readiness
const readiness = await getCampaignReadinessTool(
  campaignId,
  campaign,
  resources,
  env
);

// Provide contextual recommendations
if (readiness.campaignState === "Fresh Start") {
  // Suggest basic first steps
} else if (readiness.campaignState === "Flourishing") {
  // Suggest advanced development
}
```

### 2. Campaign Context Tools

Assessment tools are exposed to agents for analysis:

- `getCampaignReadinessScoreTool()`: Quick state overview
- `getCampaignRecommendationsTool()`: Detailed suggestions
- `analyzeCampaignDimensionTool()`: Dimension-specific analysis

### 3. Help System

When users click "Help Me", the system:

1. Analyzes current campaign state
2. Provides next milestone guidance with actionable steps
3. Suggests specific content to add based on gaps

## Testing

### Unit Tests

- **AssessmentService**: All state boundaries, error handling
- **campaign-state-utils**: State conversion, summary generation

### Integration Tests

- Complete workflow: assessment → recommendations → state changes
- Validates scoring algorithm across all thresholds

See `tests/services/assessment-service.test.ts` for comprehensive examples.

## Future Enhancements

### Potential Improvements

1. **Dimension-Specific States**: Different states for narrative vs. characters vs. resources
2. **User Preferences**: Allow users to hide/show numerical scores
3. **State History**: Track campaign progression over time
4. **Achievement System**: Celebrate reaching new milestones
5. **AI-Driven Scoring**: Use LLM to assess content quality, not just quantity

### Extensibility

The system is designed for easy extension:

- Add new states: Update `getCampaignState()` thresholds
- Modify scoring: Adjust weights in `AssessmentService`
- Custom dimensions: Extend scoring algorithm with new categories
- Personalization: Tailor states/messages to user preferences

## Related Documentation

- **SHARD_APPROVAL_SYSTEM.md**: Shard management and approval workflows
- **CAMPAIGN_SHARD_FLOW.md**: Content types and shard structure
- **TESTING_GUIDE.md**: How to test assessment-related features

---

**Last Updated**: October 2025  
**Maintained By**: LoreSmith Development Team
