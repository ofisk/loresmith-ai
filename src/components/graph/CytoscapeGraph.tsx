import { useEffect, useRef, useMemo } from "react";
import cytoscape, { type Core, type ElementDefinition } from "cytoscape";
import type {
  CommunityGraphData,
  EntityGraphData,
  CytoscapeLayout,
} from "@/types/graph-visualization";

interface CytoscapeGraphProps {
  data: CommunityGraphData | EntityGraphData;
  layout?: CytoscapeLayout;
  onNodeClick?: (nodeId: string) => void;
  highlightedNodes?: string[];
  className?: string;
  style?: React.CSSProperties;
}

export function CytoscapeGraph({
  data,
  layout = "cose",
  onNodeClick,
  highlightedNodes = [],
  className = "",
  style,
}: CytoscapeGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const layoutRef = useRef<any>(null);
  const isReadyRef = useRef<boolean>(false);
  const isDestroyingRef = useRef<boolean>(false);
  const previousDataKeyRef = useRef<string>("");
  const onNodeClickRef = useRef(onNodeClick);

  // Keep ref in sync with prop
  useEffect(() => {
    onNodeClickRef.current = onNodeClick;
  }, [onNodeClick]);

  // Create a stable key from the data to prevent unnecessary re-renders
  const dataKey = useMemo(() => {
    if ("communityId" in data) {
      const entityData = data as EntityGraphData;
      return `entity:${entityData.communityId}:${entityData.nodes.length}:${entityData.edges.length}:${entityData.nodes
        .map((n) => n.id)
        .sort()
        .join(",")}:${entityData.edges
        .map((e) => `${e.source}-${e.target}`)
        .sort()
        .join(",")}`;
    } else {
      const communityData = data as CommunityGraphData;
      return `community:${communityData.nodes.length}:${communityData.edges.length}:${communityData.nodes
        .map((n) => n.id)
        .sort()
        .join(",")}:${communityData.edges
        .map((e) => `${e.source}-${e.target}`)
        .sort()
        .join(",")}`;
    }
  }, [data]);

  // Convert graph data to Cytoscape elements
  const elements = useMemo<ElementDefinition[]>(() => {
    console.log("[CytoscapeGraph] Converting data to elements:", {
      hasData: !!data,
      isEntityGraph: "communityId" in data,
      nodeCount:
        "communityId" in data
          ? (data as EntityGraphData).nodes.length
          : (data as CommunityGraphData).nodes.length,
      edgeCount:
        "communityId" in data
          ? (data as EntityGraphData).edges.length
          : (data as CommunityGraphData).edges.length,
    });

    const els: ElementDefinition[] = [];

    if ("communityId" in data) {
      // Entity-level graph
      const entityData = data as EntityGraphData;
      for (const node of entityData.nodes) {
        // Truncate long labels to prevent overflow
        const maxLabelLength = 40;
        const truncatedLabel =
          node.name.length > maxLabelLength
            ? node.name.substring(0, maxLabelLength) + "..."
            : node.name;

        els.push({
          data: {
            id: node.id,
            label: truncatedLabel,
            entityType: node.entityType,
            importance: node.importance,
            fullName: node.name, // Keep original for tooltips if needed
          },
        });
      }
      for (const edge of entityData.edges) {
        els.push({
          data: {
            id: edge.id,
            source: edge.source,
            target: edge.target,
            relationshipType: edge.relationshipType,
            strength: edge.strength,
          },
        });
      }
    } else {
      // Community-level graph
      const communityData = data as CommunityGraphData;
      for (const node of communityData.nodes) {
        // Use the full name - Cytoscape will handle wrapping and overflow
        // The node size is fixed (120x60) so text will wrap automatically
        els.push({
          data: {
            id: node.id,
            label: node.name, // Use full name, no truncation
            size: node.size,
            entityTypes: node.entityTypes,
            level: node.level,
            summary: node.summary,
            fullName: node.name,
          },
        });
      }
      for (const edge of communityData.edges) {
        els.push({
          data: {
            id: edge.id,
            source: edge.source,
            target: edge.target,
            relationshipTypes: edge.relationshipTypes,
            relationshipCount: edge.relationshipCount,
            strength: edge.strength,
          },
        });
      }
    }

    console.log(
      "[CytoscapeGraph] Converted to elements:",
      els.length,
      "total elements"
    );
    return els;
  }, [data]);

  // Initialize Cytoscape
  useEffect(() => {
    if (!containerRef.current) return;

    // Ensure we have elements before initializing
    if (elements.length === 0) {
      console.warn(
        "[CytoscapeGraph] No elements to render, skipping initialization"
      );
      return;
    }

    // Skip if data hasn't actually changed
    if (dataKey === previousDataKeyRef.current && cyRef.current) {
      return;
    }

    previousDataKeyRef.current = dataKey;

    console.log(
      "[CytoscapeGraph] Initializing with",
      elements.length,
      "elements"
    );

    // Destroy existing instance if any
    if (cyRef.current) {
      isDestroyingRef.current = true;

      // Stop any running layout first
      if (layoutRef.current) {
        try {
          layoutRef.current.stop();
        } catch (error) {
          // Ignore errors stopping layout
        }
        layoutRef.current = null;
      }

      try {
        cyRef.current.destroy();
      } catch (error) {
        console.warn("[CytoscapeGraph] Error destroying instance:", error);
      }
      cyRef.current = null;
      isReadyRef.current = false;
      isDestroyingRef.current = false;
    }

    // Wait for container to have dimensions
    const container = containerRef.current;
    const checkDimensions = () => {
      if (container.offsetWidth > 0 && container.offsetHeight > 0) {
        initializeCytoscape();
      } else {
        // Retry after a short delay
        setTimeout(checkDimensions, 50);
      }
    };

    const initializeCytoscape = () => {
      if (!containerRef.current || elements.length === 0) return;

      // Use requestAnimationFrame to ensure DOM is ready
      requestAnimationFrame(() => {
        if (!containerRef.current || elements.length === 0) return;

        try {
          // Create new Cytoscape instance without layout first
          const cy = cytoscape({
            container: containerRef.current,
            elements,
            style: [
              {
                selector: "node",
                style: {
                  "background-color": "#666",
                  label: "data(label)",
                  "text-valign": "top",
                  "text-halign": "center",
                  "font-size": "11px",
                  width: 120,
                  height: 60,
                  "text-wrap": "wrap",
                  "text-max-width": "110px",
                  padding: "8px",
                  shape: "round-rectangle",
                },
              },
              {
                selector: "edge",
                style: {
                  width: 2,
                  "line-color": "#ccc",
                  "target-arrow-color": "#ccc",
                  "target-arrow-shape": "triangle",
                  "curve-style": "bezier",
                  label: "data(relationshipType)",
                  "font-size": "10px",
                  "text-rotation": "autorotate",
                  "text-margin-y": -10,
                  "text-background-color": "#fff",
                  "text-background-opacity": 0.8,
                  "text-background-padding": "2px",
                  "text-border-color": "#ccc",
                  "text-border-width": 1,
                  "text-border-opacity": 0.5,
                  color: "#333",
                },
              },
              {
                selector: "node:selected",
                style: {
                  "background-color": "#0074D9",
                  "border-width": 3,
                  "border-color": "#0059B3",
                },
              },
              {
                selector: "node.highlighted",
                style: {
                  "background-color": "#FFD700",
                  "border-width": 3,
                  "border-color": "#FFA500",
                },
              },
            ],
            // Don't set layout during initialization - run it after ready
            layout: {
              name: "preset",
            },
          });

          cyRef.current = cy;

          // Expose Cytoscape instance on container for export operations
          if (containerRef.current) {
            (containerRef.current as any).__cytoscape = cy;
          }

          // Handle node clicks
          cy.on("tap", "node", (evt) => {
            const nodeId = evt.target.id();
            if (onNodeClickRef.current) {
              onNodeClickRef.current(nodeId);
            }
          });

          // Run layout after instance is ready
          cy.ready(() => {
            // Double-check instance is still valid
            if (!cyRef.current || cyRef.current !== cy) return;

            // Check if container is still valid
            try {
              if (!cy.container()) return;
            } catch (error) {
              return;
            }

            // Ensure we have elements
            if (cy.elements().length === 0) {
              isReadyRef.current = true;
              return;
            }

            // Small delay to ensure everything is settled
            setTimeout(() => {
              // Don't run if we're destroying
              if (isDestroyingRef.current) return;

              // Double-check again after delay
              if (!cyRef.current || cyRef.current !== cy) return;

              try {
                if (!cy.container()) return;
              } catch (error) {
                return;
              }

              isReadyRef.current = true;

              // Stop any existing layout
              if (layoutRef.current) {
                try {
                  layoutRef.current.stop();
                } catch (error) {
                  // Ignore errors stopping layout
                }
                layoutRef.current = null;
              }

              try {
                const layoutInstance = cy.layout({
                  name: layout,
                });
                layoutRef.current = layoutInstance;
                layoutInstance.run();
              } catch (layoutError) {
                console.warn(
                  "[CytoscapeGraph] Error running layout:",
                  layoutError
                );
                // Fallback to a simple layout if the requested one fails
                try {
                  const fallbackLayout = cy.layout({ name: "grid" });
                  layoutRef.current = fallbackLayout;
                  fallbackLayout.run();
                } catch (fallbackError) {
                  console.error(
                    "[CytoscapeGraph] Error running fallback layout:",
                    fallbackError
                  );
                }
              }
            }, 100);
          });
        } catch (error) {
          console.error(
            "[CytoscapeGraph] Error initializing Cytoscape:",
            error
          );
        }
      });
    };

    // Start checking dimensions
    checkDimensions();

    // Cleanup on unmount
    return () => {
      // Stop any running layout
      if (layoutRef.current) {
        try {
          layoutRef.current.stop();
        } catch (error) {
          // Ignore errors stopping layout
        }
        layoutRef.current = null;
      }

      if (containerRef.current) {
        delete (containerRef.current as any).__cytoscape;
      }
      if (cyRef.current) {
        try {
          cyRef.current.destroy();
        } catch (error) {
          console.warn("[CytoscapeGraph] Error during cleanup:", error);
        }
        cyRef.current = null;
      }
      isReadyRef.current = false;
    };
  }, [dataKey]);

  // Handle layout changes
  useEffect(() => {
    // Don't run layout changes until instance is ready or if we're destroying
    if (!cyRef.current || !isReadyRef.current || isDestroyingRef.current)
      return;

    const cy = cyRef.current;

    // Check if instance is still valid
    try {
      // Test if instance is still valid by checking container
      if (!cy.container()) {
        isReadyRef.current = false;
        return;
      }
    } catch (error) {
      // Instance is destroyed or invalid
      isReadyRef.current = false;
      return;
    }

    // Stop any existing layout
    if (layoutRef.current) {
      try {
        layoutRef.current.stop();
      } catch (error) {
        // Ignore errors stopping layout
      }
      layoutRef.current = null;
    }

    // Run new layout
    try {
      const layoutInstance = cy.layout({
        name: layout,
      });
      layoutRef.current = layoutInstance;
      layoutInstance.run();
    } catch (layoutError) {
      console.warn("[CytoscapeGraph] Error running layout:", layoutError);
      // Fallback to a simple layout if the requested one fails
      try {
        const fallbackLayout = cy.layout({ name: "grid" });
        layoutRef.current = fallbackLayout;
        fallbackLayout.run();
      } catch (fallbackError) {
        console.error(
          "[CytoscapeGraph] Error running fallback layout:",
          fallbackError
        );
      }
    }
  }, [layout]);

  // Update highlighted nodes
  useEffect(() => {
    if (!cyRef.current) return;

    const cy = cyRef.current;

    // Check if instance is still valid
    try {
      if (!cy.container()) return;
    } catch (error) {
      return;
    }

    cy.elements().removeClass("highlighted");
    if (highlightedNodes.length > 0) {
      const highlightedElements = cy
        .elements()
        .filter((ele) => highlightedNodes.includes(ele.id()));
      highlightedElements.addClass("highlighted");
    }
  }, [highlightedNodes]);

  return (
    <div
      ref={containerRef}
      data-cytoscape-container
      className={className}
      style={{
        width: "100%",
        height: "100%",
        minHeight: "400px",
        ...style,
      }}
    />
  );
}
