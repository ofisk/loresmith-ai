# Community Detection Memory Management

## Cloudflare Workers Memory Limits

- **Memory Limit**: 128MB per Worker instance
- **CPU Time Limit**: 30 seconds (paid plan) / 50ms (free plan)
- **Exceeding limits**: Worker terminates, request fails

## Current Memory Optimizations

### 1. Minimal Graph Loading (`loadMinimalGraphData`)

- **Memory savings**: ~90% reduction vs full entity records
- **Entity**: ~2KB full record → ~36 bytes (ID only)
- **Relationship**: ~500 bytes full record → ~100 bytes (from/to/weight only)
- **Metadata filtering**: Rejected/ignored entities filtered at load time

### 2. Safety Limits

```typescript
const DEFAULT_MAX_ENTITIES = 50000;
const DEFAULT_MAX_RELATIONSHIPS = 200000;
```

### 3. Memory Usage Estimates

For a graph with **50k entities** and **200k relationships**:

| Component               | Estimated Memory |
| ----------------------- | ---------------- |
| Nodes Map (IDs only)    | ~2-3 MB          |
| Edges Array             | ~20 MB           |
| Adjacency List          | ~10-30 MB        |
| Community Assignments   | ~1 MB            |
| Intermediate Structures | ~10-20 MB        |
| **Total Estimated**     | **~50-80 MB**    |

**Status**: Within 128MB limit, but approaching ~60% usage at max limits.

## Memory Risk Scenarios

### High Risk (>100MB estimated)

- **Entities**: >60,000
- **Relationships**: >250,000
- **Dense graphs**: Average degree >10

### Medium Risk (80-100MB estimated)

- **Entities**: 40,000-60,000
- **Relationships**: 150,000-250,000
- **Moderate density**: Average degree 5-10

### Low Risk (<80MB estimated)

- **Entities**: <40,000
- **Relationships**: <150,000
- **Sparse graphs**: Average degree <5

## Strategies for Memory Constraints

### 1. **Graph Sampling** (Recommended First Step)

Reduce graph size before processing:

```typescript
// Sample a representative subset of entities
function sampleGraph(
  entityIds: Set<string>,
  edges: GraphEdge[],
  sampleSize: number
): { sampledEntities: Set<string>; sampledEdges: GraphEdge[] } {
  const entityArray = Array.from(entityIds);
  const sampled = new Set(
    entityArray.slice(0, Math.min(sampleSize, entityArray.length))
  );

  const sampledEdges = edges.filter(
    (e) => sampled.has(e.from) && sampled.has(e.to)
  );

  return { sampledEntities: sampled, sampledEdges };
}
```

**When to use**: Graphs >40k entities
**Memory savings**: Linear reduction (50% sample = 50% memory)

### 2. **Batch Processing with Durable Objects**

Move computation to Durable Objects (512MB memory limit):

```typescript
// Create a Durable Object for large graph processing
export class CommunityDetectionDO {
  async detectCommunities(
    campaignId: string,
    options: CommunityDetectionOptions
  ): Promise<Community[]> {
    // Process in DO with higher memory limit
    // Can handle graphs up to ~200k entities
  }
}
```

**When to use**: Graphs >60k entities or when Worker memory errors occur
**Memory limit**: 512MB (4x Worker limit)

### 3. **Incremental/Streaming Processing**

Process graph in chunks:

```typescript
async function detectCommunitiesIncremental(
  campaignId: string,
  chunkSize: number = 10000
): Promise<Community[]> {
  // Process graph in chunks
  // Merge results intelligently
  // Lower peak memory usage
}
```

**When to use**: Very large graphs (>100k entities)
**Trade-off**: More complex, may reduce accuracy

### 4. **Graph Reduction Techniques**

Pre-process to reduce complexity:

- **Remove isolated nodes**: Entities with no relationships
- **Filter weak edges**: Remove relationships below threshold
- **Merge similar entities**: Deduplicate before detection
- **Hierarchical sampling**: Sample at different levels

### 5. **External Computation Service**

For extremely large graphs, use external service:

- **Cloudflare Functions** (if available)
- **External API** (e.g., NetworkX on dedicated server)
- **Queue-based processing** with longer timeout

## Implementation Recommendations

### Immediate Actions

1. **Add memory monitoring**:

```typescript
function estimateMemoryUsage(
  entityCount: number,
  relationshipCount: number
): number {
  // Rough estimate in MB
  const baseMemory = 5; // Base overhead
  const entityMemory = entityCount * 0.00005; // ~50 bytes per entity
  const relationshipMemory = relationshipCount * 0.0001; // ~100 bytes per relationship
  return baseMemory + entityMemory + relationshipMemory;
}
```

2. **Add pre-flight checks**:

```typescript
async function detectCommunities(
  campaignId: string,
  options: CommunityDetectionOptions = {}
): Promise<Community[]> {
  const { entityIds, edges } = await this.loadMinimalGraphData(campaignId);

  // Estimate memory usage
  const estimatedMB = estimateMemoryUsage(entityIds.size, edges.length);

  if (estimatedMB > 100) {
    throw new Error(
      `Graph too large (${estimatedMB.toFixed(1)}MB estimated). ` +
        `Consider using graph sampling or Durable Objects. ` +
        `Current: ${entityIds.size} entities, ${edges.length} relationships`
    );
  }

  // ... rest of detection
}
```

3. **Add automatic fallback**:

```typescript
if (estimatedMB > 80) {
  // Automatically sample to safe size
  const targetSize = 30000; // Safe for ~60MB
  const { sampledEntities, sampledEdges } = sampleGraph(
    entityIds,
    edges,
    targetSize
  );
  // Use sampled graph
}
```

### Future Enhancements

1. **Durable Object implementation** for large graphs
2. **Progressive/streaming algorithm** for very large datasets
3. **Caching** of intermediate results
4. **Background processing** via Queue for large operations

## Monitoring

Add logging to track actual memory usage:

```typescript
// Log memory estimates before processing
console.log(
  `[CommunityDetection] Memory estimate: ${estimatedMB.toFixed(1)}MB`
);
console.log(
  `[CommunityDetection] Entities: ${entityIds.size}, Relationships: ${edges.length}`
);

// Monitor for memory errors
try {
  const communities = await this.detectCommunities(campaignId, options);
} catch (error) {
  if (error.message.includes("memory") || error.message.includes("limit")) {
    // Suggest fallback strategy
    console.error(
      "[CommunityDetection] Memory limit hit, suggest sampling or DO"
    );
  }
}
```

## Detailed Implementation Strategies

### Strategy 1: Graph Sampling (Easiest to Implement)

**Implementation approach:**

```typescript
// In community-detection-service.ts
private sampleGraph(
  entityIds: Set<string>,
  edges: GraphEdge[],
  targetEntityCount: number
): { sampledEntities: Set<string>; sampledEdges: GraphEdge[] } {
  const entityArray = Array.from(entityIds);

  // Random sampling (or use degree-based sampling for better results)
  const shuffled = [...entityArray].sort(() => Math.random() - 0.5);
  const sampled = new Set(shuffled.slice(0, targetEntityCount));

  // Only keep edges between sampled entities
  const sampledEdges = edges.filter(
    (e) => sampled.has(e.from) && sampled.has(e.to)
  );

  return { sampledEntities: sampled, sampledEdges };
}

// Usage in detectCommunities:
if (estimatedMB > MEMORY_WARNING_THRESHOLD_MB) {
  const targetSize = 30000; // Safe for ~60MB
  const { sampledEntities, sampledEdges } = this.sampleGraph(
    entityIds,
    edges,
    targetSize
  );
  // Use sampled data instead
  entityIds = sampledEntities;
  edges = sampledEdges;
}
```

**Sampling strategies:**

- **Random sampling**: Simple, fast
- **Degree-based sampling**: Keep high-degree nodes (hubs), better community structure
- **Stratified sampling**: Sample proportionally from each entity type
- **Snowball sampling**: Start with seed nodes, include neighbors

**Pros:**

- Easy to implement
- Linear memory reduction
- Maintains graph structure

**Cons:**

- May miss small communities
- Less accurate for sparse graphs

### Strategy 2: Durable Objects (Recommended for Large Graphs)

**Implementation approach:**

1. **Create Durable Object class:**

```typescript
// src/durable-objects/community-detection-do.ts
export class CommunityDetectionDO {
  state: DurableObjectState;
  env: Env;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const { campaignId, options } = await request.json();

    // Get DAOs
    const daoFactory = getDAOFactory(this.env);
    const service = new CommunityDetectionService(
      daoFactory.entityDAO,
      daoFactory.communityDAO
    );

    // Process with 512MB limit
    const communities = await service.detectCommunities(campaignId, {
      ...options,
      maxEntities: 200000, // Higher limit for DO
      maxRelationships: 800000,
    });

    return new Response(JSON.stringify(communities));
  }
}
```

2. **Register in wrangler.jsonc:**

```jsonc
"durable_objects": {
  "bindings": [
    // ... existing bindings
    {
      "name": "COMMUNITY_DETECTION",
      "class_name": "CommunityDetectionDO",
    }
  ]
}
```

3. **Use from Worker:**

```typescript
// In routes/communities.ts
const doId = env.COMMUNITY_DETECTION.idFromName(`campaign-${campaignId}`);
const stub = env.COMMUNITY_DETECTION.get(doId);
const response = await stub.fetch(
  new Request("https://do/", {
    method: "POST",
    body: JSON.stringify({ campaignId, options }),
  })
);
```

**Pros:**

- 4x memory limit (512MB vs 128MB)
- Can handle graphs up to ~200k entities
- Persistent state for caching

**Cons:**

- Additional complexity
- Slight latency overhead
- Requires DO quota

### Strategy 3: Incremental/Chunked Processing

**Implementation approach:**

```typescript
async detectCommunitiesIncremental(
  campaignId: string,
  chunkSize: number = 10000
): Promise<Community[]> {
  const { entityIds, edges } = await this.loadMinimalGraphData(campaignId);

  // Split into chunks
  const entityArray = Array.from(entityIds);
  const chunks: Set<string>[] = [];

  for (let i = 0; i < entityArray.length; i += chunkSize) {
    chunks.push(new Set(entityArray.slice(i, i + chunkSize)));
  }

  // Process each chunk
  const chunkCommunities: Community[] = [];
  for (const chunk of chunks) {
    const chunkEdges = edges.filter(
      (e) => chunk.has(e.from) && chunk.has(e.to)
    );

    const assignments = detectCommunities(chunkEdges, options);
    // Convert to communities...
    chunkCommunities.push(...chunkComms);
  }

  // Merge overlapping communities
  return this.mergeCommunities(chunkCommunities);
}
```

**Pros:**

- Lower peak memory
- Can process very large graphs

**Cons:**

- Complex merging logic
- May miss cross-chunk communities
- Less accurate results

### Strategy 4: Graph Reduction Techniques

**Pre-processing steps:**

```typescript
function reduceGraph(
  entityIds: Set<string>,
  edges: GraphEdge[]
): { reducedEntities: Set<string>; reducedEdges: GraphEdge[] } {
  // 1. Remove isolated nodes (no relationships)
  const connectedEntities = new Set<string>();
  for (const edge of edges) {
    connectedEntities.add(edge.from);
    connectedEntities.add(edge.to);
  }

  // 2. Filter weak edges (below threshold)
  const threshold = 0.1;
  const strongEdges = edges.filter((e) => e.weight >= threshold);

  // 3. Remove low-degree nodes (optional)
  const degreeMap = new Map<string, number>();
  for (const edge of strongEdges) {
    degreeMap.set(edge.from, (degreeMap.get(edge.from) || 0) + 1);
    degreeMap.set(edge.to, (degreeMap.get(edge.to) || 0) + 1);
  }

  const highDegreeEntities = new Set(
    Array.from(degreeMap.entries())
      .filter(([_, degree]) => degree >= 2)
      .map(([id]) => id)
  );

  const finalEdges = strongEdges.filter(
    (e) => highDegreeEntities.has(e.from) && highDegreeEntities.has(e.to)
  );

  return {
    reducedEntities: highDegreeEntities,
    reducedEdges: finalEdges,
  };
}
```

**Pros:**

- Removes noise
- Focuses on important connections
- Can significantly reduce size

**Cons:**

- May remove important communities
- Requires tuning thresholds

### Strategy 5: External Computation Service

**Option A: Queue-based Processing**

```typescript
// Queue message
interface CommunityDetectionJob {
  campaignId: string;
  options: CommunityDetectionOptions;
  userId: string;
}

// Queue consumer (runs in separate Worker with longer timeout)
export default {
  async queue(batch: MessageBatch<CommunityDetectionJob>, env: Env) {
    for (const message of batch.messages) {
      const { campaignId, options } = message.body;
      // Process with longer timeout
      const communities = await detectCommunities(campaignId, options);
      // Store results
      // Notify user
    }
  },
};
```

**Option B: External API**

```typescript
// Call external service (e.g., NetworkX on dedicated server)
async function detectCommunitiesExternal(graphData: {
  nodes: string[];
  edges: GraphEdge[];
}): Promise<Community[]> {
  const response = await fetch("https://graph-service.example.com/detect", {
    method: "POST",
    body: JSON.stringify(graphData),
  });
  return response.json();
}
```

**Pros:**

- No memory constraints
- Can use optimized libraries (NetworkX, igraph)
- Better for very large graphs

**Cons:**

- Additional infrastructure
- Network latency
- Cost considerations

## Decision Tree

```
Is estimated memory > 100MB?
├─ Yes → Error: Use Durable Objects or External Service
└─ No
   ├─ Is estimated memory > 80MB?
   │  ├─ Yes → Warn: Consider sampling or DO
   │  └─ No → Proceed normally
   │
   └─ Graph size > 60k entities?
      ├─ Yes → Use Durable Objects
      └─ No → Use Worker (current implementation)
```

## Performance Benchmarks (Estimated)

| Graph Size                | Memory Usage | Processing Time | Strategy         |
| ------------------------- | ------------ | --------------- | ---------------- |
| 10k entities, 50k edges   | ~10MB        | ~1-2s           | Worker           |
| 30k entities, 150k edges  | ~25MB        | ~5-10s          | Worker           |
| 50k entities, 200k edges  | ~50MB        | ~15-30s         | Worker           |
| 80k entities, 400k edges  | ~90MB        | ~60-120s        | Durable Object   |
| 150k entities, 750k edges | ~180MB       | ~5-10min        | External Service |

## Monitoring and Alerting

### Key Metrics to Track

1. **Memory estimates** before processing
2. **Actual processing time** per graph size
3. **Error rates** (memory/timeout errors)
4. **Graph statistics** (entities, relationships, density)

### Recommended Alerts

- Warn when memory estimate > 80MB
- Alert when memory estimate > 100MB
- Track timeout errors
- Monitor DO usage if implemented

## Future Optimizations

1. **Caching**: Cache community results for unchanged graphs
2. **Incremental updates**: Only recompute affected communities
3. **Parallel processing**: Use multiple DOs for very large graphs
4. **Adaptive algorithms**: Use simpler algorithms for large graphs
5. **Graph compression**: Use more efficient data structures

## Current Status

✅ **Safe for**: Graphs up to ~50k entities, 200k relationships (~50-80MB)
⚠️ **Monitor**: Graphs 40k-60k entities (warnings logged)
❌ **Requires optimization**: Graphs >60k entities (errors with guidance)

## Implementation Status

- ✅ Memory estimation function implemented
- ✅ Pre-flight checks with warnings/errors
- ✅ Minimal graph loading (90% memory savings)
- ✅ Safety limits enforced
- ⏳ Graph sampling (ready to implement)
- ⏳ Durable Object support (design ready)
- ⏳ Incremental processing (design ready)
- ⏳ Graph reduction utilities (design ready)
