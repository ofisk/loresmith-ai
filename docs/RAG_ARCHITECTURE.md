# RAG Architecture for LoreSmith

**Document Purpose:** High-level architecture design for replacing AutoRAG with a GraphRAG-based knowledge retrieval system optimized for D&D campaign management.

**Status:** Design Phase

**Last Updated:** November 5, 2025

---

## Table of Contents

1. [Problem Statement](#problem-statement)
2. [Current State (AutoRAG)](#current-state-autorag)
3. [Proposed Solution (GraphRAG)](#proposed-solution-graphrag)
4. [Architecture Overview](#architecture-overview)
5. [Open Questions](#open-questions)
6. [Evaluation Strategy](#evaluation-strategy)
7. [References](#references)

---

## Problem Statement

### Current AutoRAG Limitations

The current Cloudflare AutoRAG implementation exhibits critical failure modes that prevent effective DM assistance:

1. **Hallucinations**: Dead NPCs reported as alive, destroyed locations suggested as visitable
2. **Context Rot**: Dumping 20-50K tokens of unranked chunks into context window
3. **Lost-in-Middle**: Relevant information buried in large context gets ignored by LLM
4. **No Entity Resolution**: Same entity (e.g., "Torven the merchant" vs "Torven's corpse") treated as separate, causing contradictions
5. **Stale Data**: No mechanism to reflect world state changes (NPC deaths, location destruction, faction relationships)
6. **No Control**: Black box service with no visibility into ranking, retrieval logic, or quality metrics

### Core Challenge

D&D campaigns require balancing:
- **Static world knowledge** (sourcebooks, lore, canonical information)
- **Dynamic session state** (player actions, world changes, emerging story)
- **Retrieval accuracy** (return only current, relevant, non-contradictory information)

Current AutoRAG treats all content as flat chunks with no understanding of:
- Entity relationships (who rules what, who's allied with whom)
- Temporal state (what's current vs. historical)
- Semantic importance (main quest locations vs. random tavern)

---

## Current State (AutoRAG)

### Architecture

```
Upload → AutoRAG Sync → Chunking → Embedding → Vector Search
                                        ↓
Query → Embed → KNN Search → Top-K Chunks → Dump to LLM Context
```

### Failure Pattern Example

**Query**: "Where can the party rest?"

**AutoRAG Returns** (unranked, 40K tokens):
- Chunk 47: "The Red Oak Tavern offers comfortable lodging..."
- Chunk 102: "...the party burned down the Red Oak Tavern..."
- Chunk 8: "The temple provides sanctuary to travelers..."
- Chunk 201: "...the priests now consider the party enemies..."

**LLM Output**: "You can rest at the Red Oak Tavern or the Temple of Lathander"
**Reality**: Both locations are no longer available (destroyed/hostile)

### Root Cause

- No entity-centric retrieval (chunks don't resolve to entities)
- No state tracking (no notion of "current" vs. "historical")
- No relationship awareness (can't apply "destroyed" or "hostile" filters)
- No ranking signals beyond semantic similarity

---

## Proposed Solution (GraphRAG)

### Foundational Technology

Microsoft Research's **GraphRAG** approach combines:
1. **Entity Extraction**: LLM identifies entities (NPCs, locations, factions, items) and relationships
2. **Graph Construction**: Entities as nodes, relationships as typed edges
3. **Community Detection**: Leiden algorithm clusters related entities hierarchically
4. **Community Summaries**: LLM-generated summaries at multiple abstraction levels
5. **Multi-Signal Ranking**: Semantic relevance + graph centrality + temporal recency + entity status

### Key Benefits for D&D Campaigns

| Challenge | GraphRAG Solution |
|-----------|------------------|
| Hallucinations | Entity status tracking (alive/dead, exists/destroyed) prevents contradictions |
| Context Rot | Hierarchical summaries (500 tokens) replace chunk dumps (50K tokens) |
| Lost-in-Middle | Structured previews enable agent-driven selective expansion |
| Entity Resolution | Canonical entity index with aliases ("Torven" → "Torven Blackwater, merchant") |
| Stale Data | Changelog overlay applies world state changes at query time |
| No Control | Full visibility into ranking, extensible multi-signal algorithm |

---

## Architecture Overview

### Three-Tier Knowledge System

```
┌─────────────────────────────────────────────────────┐
│ Tier 1: World Knowledge (GraphRAG)                  │
│ - D&D sourcebooks, campaign world lore              │
│ - Static/canonical knowledge base                   │
│ - Entity graph with relationships                   │
│ - Community summaries (hierarchical)                │
│ - Periodic rebuild (impact-triggered)               │
└─────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────┐
│ Tier 2: World State Changelog                       │
│ - Entity mutations (deaths, destruction)            │
│ - Relationship changes (alliances, hostility)       │
│ - Query-time overlay (doesn't mutate graph)         │
│ - Triggers rebuilds based on impact scoring         │
└─────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────┐
│ Tier 3: Session Context (Semantic Search)           │
│ - High-velocity session-to-session updates          │
│ - Combat logs, dialogue, player decisions           │
│ - Recency-weighted retrieval                        │
│ - Structured extraction per session                 │
└─────────────────────────────────────────────────────┘
```

### Multi-Signal Ranking

Combines multiple relevance signals (weights TBD via evaluation):

```python
final_score = (
    α * semantic_similarity +        # Query-content relevance
    β * graph_centrality +            # Entity importance (PageRank, betweenness)
    γ * temporal_recency +            # Recent mentions boosted
    δ * entity_status_filter +        # Alive/exists = 1.0, dead/destroyed = 0.3
    ε * relationship_proximity        # Distance to query entities in graph
)
```

**Critical:** Status filter prevents dead NPCs/destroyed locations from ranking high.

### Query-Time Retrieval Pipeline

```
Stage 1: Preview Retrieval (Cheap)
├─ Query → Multi-signal ranking
├─ Return: Top 20 entities/communities as previews
├─ Cost: ~200 tokens per preview = 4K tokens
└─ Agent sees: names, statuses, relationships, token costs

Stage 2: Selective Expansion (Agent-Driven)
├─ Agent analyzes previews
├─ Agent requests: "Expand community: waterdeep-politics"
├─ Return: Full summaries + entity details
├─ Cost: ~2K tokens per expanded node
└─ Total context: 6-9K tokens (vs 50K with AutoRAG)
```

### Entity Status & Changelog

**Entity Index Example:**
```json
{
  "entity_id": "torven-blackwater",
  "entity_type": "NPC",
  "name": "Torven Blackwater",
  "status": "deceased",
  "last_updated": "session_8",
  "importance_score": 0.34,
  "relationships": ["member_of: Merchants Guild", "killed_by: Shadow Assassin"],
  "preview": "Halfling merchant who ran potion stall. Murdered in session 8."
}
```

**Changelog Schema:**
```json
{
  "session_id": 12,
  "entity_updates": [
    {
      "entity_id": "tavern-redoak",
      "entity_type": "location",
      "status": "destroyed",
      "destroyed_by": ["player_party"]
    }
  ],
  "relationship_updates": [
    {
      "from": "party",
      "to": "merchants-guild",
      "old_status": "allied",
      "new_status": "hostile"
    }
  ]
}
```

At query time, changelog filters are applied before returning results.

### Impact-Based Graph Rebuilds

**Problem:** Rebuilding the entire graph after every session is expensive. But waiting too long causes drift.

**Solution:** Calculate impact scores using graph centrality metrics.

```python
# Precomputed during graph construction
entity_importance = {
    "degree_centrality": float,      # Connection count
    "betweenness_centrality": float, # Path criticality
    "pagerank_score": float,         # Weighted PageRank
    "composite_score": float         # Weighted combination
}

# When entity changes
change_impact = entity.composite_score * change_type_multiplier

# Example:
# Holy Temple (importance: 0.89) destroyed → impact = 133
# Random Tavern (importance: 0.12) destroyed → impact = 18
```

**Rebuild Triggers:**
- Cumulative impact > 50: Trigger rebuild
- Cumulative impact > 100: Force immediate rebuild
- Minimum 3 sessions between rebuilds

This ensures major story changes trigger rebuilds while minor events accumulate in changelog.

---

## Open Questions

### 1. Entity Extraction Quality
- **Question:** How reliably can GPT-4 extract D&D entities and typed relationships from sourcebooks?
- **Test Needed:** Run extraction on sample chapters (Player's Handbook, campaign guides)
- **Success Criteria:** >90% precision on key entity types (NPCs, locations, factions)

### 2. Relationship Type Taxonomy
- **Question:** What relationship types are needed? How granular?
- **Proposed Types:** `ruled_by`, `sacred_to`, `member_of`, `allied_with`, `hostile_to`, `contains`, `owned_by`
- **Open:** Should we have importance weights per type? How to handle ambiguous relationships?

### 3. Community Detection Tuning
- **Question:** What Leiden resolution parameters work best for D&D content?
- **Test Needed:** Run on sample campaign graph, manually evaluate community quality
- **Consideration:** Too coarse = "everything is in one community", too fine = "every entity is its own community"

### 4. Session State Extraction
- **Question:** Can we reliably extract world state changes from session transcripts?
- **Challenges:**
  - Distinguishing attempted actions from successful outcomes
  - Identifying canonical changes vs. DM descriptions
  - Handling ambiguous narrative (Did the NPC actually die? Or just knocked out?)
- **Test Needed:** Manual labeling of 5-10 session transcripts, measure extraction accuracy

### 5. Multi-Signal Weight Tuning
- **Question:** What are optimal weights for semantic, graph, temporal, status signals?
- **Challenge:** No ground truth labeled data initially
- **Approach:** See [Evaluation Strategy](#evaluation-strategy)

### 6. Session Compaction Strategy
- **Question:** At what token threshold should compaction trigger? What categories to extract?
- **Proposed:** 150K token threshold with structured extraction (combat, NPC interactions, decisions, inventory)
- **Open:** How to handle edge cases (session ends mid-combat, cliffhanger scenes)?

### 7. Entity Linking Across Sessions
- **Question:** How to resolve "the merchant" (session 5) = "Guild Master Torven" (session 12)?
- **Approaches:**
  - Coreference resolution during extraction
  - Post-hoc entity linking based on aliases
  - Manual DM correction via UI
- **Open:** What's the right balance of automation vs. human-in-loop?

### 8. Integration with Existing System
- **Question:** Migration path from AutoRAG to GraphRAG?
- **Options:**
  - Hard cutover (users re-upload documents)
  - Hybrid period (fallback to AutoRAG if GraphRAG fails)
  - Gradual rollout (new campaigns use GraphRAG, existing stay on AutoRAG)
- **Consideration:** Cloudflare Workers constraints (execution time, memory limits)

---

## Evaluation Strategy

### Phase 1: Algorithm Candidate Evaluation (MS MARCO)

**Purpose:** Narrow down retrieval algorithm candidates before D&D-specific evaluation.

**Dataset:** [MS MARCO](https://microsoft.github.io/msmarco/) (Microsoft Machine Reading Comprehension)
- 1M+ queries with human-labeled relevant passages
- Standard IR benchmark with established metrics
- Tests core retrieval quality independent of domain

**Candidates to Test:**
1. **Baseline:** Dense retrieval (semantic only)
2. **Hybrid:** BM25 + Dense (lexical + semantic)
3. **Graph-Enhanced:** Hybrid + PageRank boosting
4. **Multi-Signal:** Hybrid + PageRank + recency (simulated)

**Metrics:**
- **MRR@10** (Mean Reciprocal Rank): Position of first relevant result
- **NDCG@10** (Normalized Discounted Cumulative Gain): Ranking quality
- **Recall@10**: Coverage of relevant results
- **Latency (p95)**: 95th percentile query time

**Success Criteria:**
- Top 2-3 candidates advance to Phase 2
- Must beat semantic-only baseline by >10% on MRR@10
- p95 latency <2 seconds

### Phase 2: Use-Case Specific Evaluation (D&D Campaigns)

**Purpose:** Validate retrieval quality on actual D&D campaign content.

**Dataset Construction:**
1. **Sample Campaigns:** 3-5 campaigns of varying lengths (5-20 sessions)
2. **Query Types:**
   - **Entity Lookup:** "Who is Torven?" "What is the Red Oak Tavern?"
   - **Status Queries:** "Where can the party rest?" "Which NPCs are allies?"
   - **Relationship Queries:** "Who rules Waterdeep?" "What factions are hostile?"
   - **Narrative Queries:** "What happened at the temple?" "Why is the guild angry?"
   - **Temporal Queries:** "What did we learn last session?" "Recent developments?"
3. **Ground Truth:** Manual labeling by DMs (binary relevant/not relevant per result)

**Test Queries (30-50 per campaign):**
- Distribute across query types (6-10 per type)
- Include edge cases (dead NPCs, destroyed locations, faction shifts)
- Vary temporal scope (current session, 3 sessions ago, campaign-wide)

**Metrics:**
- **Precision@5:** Proportion of top 5 results that are relevant
- **MRR:** Position of first relevant result
- **Hallucination Rate:** % of queries returning dead/destroyed entities in top 5
- **DM Satisfaction:** Post-query rating (1-5 scale: "Was this helpful?")

**Success Criteria:**
- Precision@5 > 80%
- Hallucination rate < 5%
- DM satisfaction > 4.0/5.0
- Latency p95 < 2s

### Phase 3: A/B Testing (Production)

**Purpose:** Validate in real campaigns with actual DMs.

**Design:**
- 50/50 split: AutoRAG vs. GraphRAG
- Instrument both systems for telemetry
- Capture implicit feedback (DM edits LLM responses, retries queries)
- Explicit feedback prompt: "Was this context helpful?" (thumbs up/down)

**Metrics:**
- **Task Success Rate:** % of queries where DM accepts first result
- **Edit Distance:** How much DMs modify LLM responses (proxy for quality)
- **Retry Rate:** % of queries where DM reformulates/retries
- **Session Outcome:** Post-session survey (qualitative)

**Duration:** 4-6 weeks, minimum 100 sessions across 20+ campaigns

**Success Criteria:**
- Task success rate > AutoRAG baseline by 20%
- Retry rate < AutoRAG baseline by 30%
- Positive qualitative feedback from DMs

---

## Implementation Phases (Proposed)

### Phase 0: Evaluation Infrastructure (2 weeks)
- Set up MS MARCO evaluation pipeline
- Implement baseline retrieval (semantic-only)
- Establish metrics tracking

### Phase 1: Core GraphRAG (4-6 weeks)
- Entity extraction pipeline
- Graph construction (networkx/igraph)
- Community detection (Leiden algorithm)
- Basic query-time retrieval

### Phase 2: Multi-Signal Ranking (3-4 weeks)
- Implement ranking signals (semantic, graph, temporal)
- Weight tuning on MS MARCO
- D&D-specific evaluation dataset construction

### Phase 3: Changelog & State Management (3-4 weeks)
- Changelog schema and storage
- Query-time changelog overlay
- Impact scoring for rebuild triggers

### Phase 4: Production Integration (4-6 weeks)
- Cloudflare Workers adaptation
- Migration tooling (AutoRAG → GraphRAG)
- A/B testing infrastructure
- Monitoring and alerting

**Total Estimated Timeline:** 16-22 weeks (4-5.5 months)

---

## References

### Microsoft GraphRAG

- **Blog Post:** [GraphRAG: Unlocking LLM discovery on narrative private data](https://www.microsoft.com/en-us/research/blog/graphrag-unlocking-llm-discovery-on-narrative-private-data/)
- **Paper:** Edge, D., et al. (2024). "From Local to Global: A Graph RAG Approach to Query-Focused Summarization." [arXiv:2404.16130](https://arxiv.org/abs/2404.16130)
- **GitHub:** [microsoft/graphrag](https://github.com/microsoft/graphrag)

### Community Detection

- **Leiden Algorithm:** Traag, V.A., et al. (2019). "From Louvain to Leiden: guaranteeing well-connected communities." *Scientific Reports*, 9(1), 5233. [DOI: 10.1038/s41598-019-41695-z](https://doi.org/10.1038/s41598-019-41695-z)

### Network Analysis

- **PageRank:** Page, L., et al. (1999). "The PageRank Citation Ranking: Bringing Order to the Web." Stanford InfoLab Technical Report.
- **NetworkX Documentation:** [Graph Algorithms](https://networkx.org/documentation/stable/reference/algorithms/)

### Evaluation Benchmarks

- **MS MARCO:** [Microsoft Machine Reading Comprehension](https://microsoft.github.io/msmarco/)
- **BEIR Benchmark:** Thakur, N., et al. (2021). "BEIR: A Heterogeneous Benchmark for Zero-shot Evaluation of Information Retrieval Models." [arXiv:2104.08663](https://arxiv.org/abs/2104.08663)

### Related Work

- **Lost-in-the-Middle:** Liu, N. F., et al. (2023). "Lost in the Middle: How Language Models Use Long Contexts." [arXiv:2307.03172](https://arxiv.org/abs/2307.03172)
- **RAG Survey:** Gao, Y., et al. (2023). "Retrieval-Augmented Generation for Large Language Models: A Survey." [arXiv:2312.10997](https://arxiv.org/abs/2312.10997)

---

## Document Maintenance

**Version:** 1.0
**Last Updated:** November 5, 2025
**Authors:** Product Team, Engineering
**Next Review:** After Phase 1 evaluation completion

**Change Log:**
- 2025-11-05: Initial draft
