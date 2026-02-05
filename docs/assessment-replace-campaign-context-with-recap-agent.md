# Assessment: Replacing Campaign Context Agent with Recap Agent

## Current state

### Campaign Context Agent

- **Type:** `campaign-context`
- **Used for:**
  1. **Context recap** (automatic): User returns to app or switches campaign → Chat DO calls `generateContextRecapTool`, injects recap prompt, runs this agent.
  2. **"What should I do next?"**: Button sends a message; Chat DO routes to this agent.
  3. **Campaign entity questions**: Router sends queries like "what is [Location]?", "who is [NPC]?", "tell me about [faction]" to this agent.

- **Tools (14):**  
  `searchCampaignContext`, `searchExternalResources`, `listAllEntities`, `showCampaignDetails`, `recordWorldEventTool`, `updateEntityWorldStateTool`, `updateRelationshipWorldStateTool`, `updateEntityMetadataTool`, `updateEntityTypeTool`, `deleteEntityTool`, `getMessageHistory`, `getChecklistStatusTool`, `recordPlanningTasks`, `getPlanningTaskProgress`, `generateContextRecapTool`

- **Responsibilities (from prompt):**
  - Context search (session digests, changelog, entity graph)
  - Context storage and world state tracking
  - Entity CRUD and metadata
  - Planning tasks / next steps
  - Recap (with CONTEXT RECAP EXCEPTION so narrative uses prompt data only)
  - Answering campaign/entity questions only after calling `searchCampaignContext`

---

## What a “Recap Agent” would be

- **Scope:** Only recap and next steps.
- **Tools (minimal):**  
  `generateContextRecapTool`, `getPlanningTaskProgress`, `recordPlanningTasks`, and optionally `getChecklistStatusTool`, `showCampaignDetails` for next-step suggestions.
- **No:** `searchCampaignContext`, `listAllEntities`, world-state tools, entity tools, `searchExternalResources`, `deleteEntityTool`, etc.
- **Prompt:** Focused on “Since you were away…”, open threads, and “Next steps for planning” (plus SAVING NEXT STEPS). No rules for entity search, consolidation, or world state.

---

## Effects of removing Campaign Context and using only Recap Agent

### 1. Lost capabilities (must be rehomed)

| Capability                                                           | Today                                    | If only Recap Agent                 |
| -------------------------------------------------------------------- | ---------------------------------------- | ----------------------------------- |
| **Context recap**                                                    | campaign-context                         | Recap agent ✅                      |
| **“What should I do next?”**                                         | campaign-context                         | Recap agent ✅                      |
| **Campaign entity questions** (“What is Vallaki?”, “Who is Strahd?”) | campaign-context (searchCampaignContext) | **Lost** unless routed elsewhere ❌ |
| **Search source files / find in documents**                          | campaign-context                         | **Lost** unless routed elsewhere ❌ |
| **Entity consolidation / duplicates**                                | campaign-context                         | **Lost** unless routed elsewhere ❌ |
| **World state updates** (user describes session outcome)             | campaign-context                         | **Lost** unless routed elsewhere ❌ |
| **Entity metadata/type updates, delete entity**                      | campaign-context                         | **Lost** unless routed elsewhere ❌ |
| **listAllEntities / counting entities**                              | campaign-context                         | **Lost** unless routed elsewhere ❌ |

So: removing campaign-context and replacing it **only** with a recap agent removes all “campaign context” behavior except recap and next steps.

### 2. Rehoming campaign-entity and context questions

- **Option A – Route to Campaign Agent**
  - Campaign agent already has `campaignTools` (includes `searchCampaignContext`, planning, world state, context capture, etc.).
  - **Change:** In routing rules, send “campaign entity questions” (and optionally “search source files”, “duplicates”, “world state updates”) to **campaign** instead of **campaign-context**.
  - **Risk:** Campaign agent’s prompt is tuned for management, planning, session scripts; it may be noisier or less focused for pure “what is X?” answers. Needs testing.

- **Option B – Route to Campaign Analysis Agent**
  - Campaign analysis already uses `searchCampaignContext` and is tuned for planning/readiness and “what exists in my campaign”.
  - **Change:** Route “campaign entity questions” (and similar) to **campaign-analysis**.
  - **Risk:** That agent is framed around “analysis” and planning; simple lookup questions might feel off. Still test.

- **Option C – Keep a slim “campaign-context” agent**
  - Rename or split: one **Recap Agent** (recap + next steps only), one **Campaign Context Agent** (search, entities, world state, no recap).
  - Routing: recap + “what should I do next?” → recap; entity/questions → campaign-context.
  - No loss of behavior; more agents and routing to maintain.

### 3. Code and routing changes if you remove campaign-context

- **Chat DO**
  - Replace `campaign-context` with `recap` for:
    - Default when no model (line ~325).
    - Context recap request (lines ~451, 493–495).
    - “What should I do next?” (lines ~570–573).
  - Recap flow stays the same: call `generateContextRecapTool`, inject recap prompt, then call **recap** agent instead of campaign-context.

- **Agent registry**
  - Register a new **RecapAgent** (recap-only prompt + recap-only tools).
  - Remove **CampaignContextAgent** (or keep it only if you choose Option C).

- **Router / routing prompt**
  - Remove or repoint “campaign-context”:
    - “Next steps / what should I do next” → **recap**.
    - “Campaign entity questions” (and similar) → **campaign** or **campaign-analysis** (see above).

- **Types**
  - `AgentType`: replace or keep `campaign-context`, add `recap` as needed.

### 4. Summary table

| Aspect                                                      | Remove campaign-context, use only Recap Agent                                                                                                                                                                                                                                                                                   |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Recap**                                                   | ✅ Handled by Recap Agent (current recap behavior preserved).                                                                                                                                                                                                                                                                   |
| **“What should I do next?”**                                | ✅ Handled by Recap Agent.                                                                                                                                                                                                                                                                                                      |
| **Entity / “what is X?” / search / world state / entities** | ❌ Lost unless you re-route those intents to **campaign** or **campaign-analysis** and ensure those agents have the right tools and prompt.                                                                                                                                                                                     |
| **Code churn**                                              | Chat DO, agent registry, router, routing prompt, types.                                                                                                                                                                                                                                                                         |
| **Recommendation**                                          | Only remove campaign-context if you rehome “campaign entity questions” (and related context tasks) to another agent; otherwise users lose the ability to ask about locations, NPCs, factions, etc. in chat. Prefer routing those to **campaign** (or **campaign-analysis**) and testing before fully removing campaign-context. |

---

## Recommendation

- **If the goal is “one agent for recap”:**  
  Introduce a **Recap Agent** that only does recap + next steps (current recap functionality). Then either:
  - **Option C:** Keep a **Campaign Context Agent** (no recap) for entity/search/world-state questions, and route recap + “what should I do next?” to Recap Agent; or
  - **Full replacement:** Remove campaign-context and route entity/questions to **campaign** (or **campaign-analysis**), and accept prompt/tool changes and testing there.

- **If the goal is to simplify:**  
  Keeping the current **Campaign Context Agent** and treating recap as one of its modes (as today) avoids losing behavior and avoids rehoming entity/search logic. The “recap agent” is then just the recap flow + campaign-context agent, not a separate agent type.

This doc can be used as the single place to assess “effects of removing campaign-context and replacing with recap agent” and to decide between recap-only agent + rehoming vs. keeping campaign-context.
