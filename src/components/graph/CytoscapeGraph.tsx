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

  // Convert graph data to Cytoscape elements
  const elements = useMemo<ElementDefinition[]>(() => {
    const els: ElementDefinition[] = [];

    if ("communityId" in data) {
      // Entity-level graph
      const entityData = data as EntityGraphData;
      for (const node of entityData.nodes) {
        els.push({
          data: {
            id: node.id,
            label: node.name,
            entityType: node.entityType,
            importance: node.importance,
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
        els.push({
          data: {
            id: node.id,
            label: node.name,
            size: node.size,
            entityTypes: node.entityTypes,
            level: node.level,
            summary: node.summary,
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

    return els;
  }, [data]);

  // Initialize Cytoscape
  useEffect(() => {
    if (!containerRef.current) return;

    // Ensure we have elements before initializing
    if (elements.length === 0) {
      return;
    }

    // Destroy existing instance if any
    if (cyRef.current) {
      try {
        cyRef.current.destroy();
      } catch (error) {
        console.warn("[CytoscapeGraph] Error destroying instance:", error);
      }
      cyRef.current = null;
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
                  "text-valign": "center",
                  "text-halign": "center",
                  "font-size": "12px",
                  width: 80,
                  height: 80,
                  "text-wrap": "wrap",
                  "text-max-width": "70px",
                  padding: "10px",
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
          if (onNodeClick) {
            cy.on("tap", "node", (evt) => {
              const nodeId = evt.target.id();
              onNodeClick(nodeId);
            });
          }

          // Run layout after instance is ready
          cy.ready(() => {
            if (!cyRef.current || cyRef.current !== cy) return;
            try {
              const layoutInstance = cy.layout({
                name: layout,
              });
              layoutInstance.run();
            } catch (layoutError) {
              console.warn(
                "[CytoscapeGraph] Error running layout:",
                layoutError
              );
              // Fallback to a simple layout if the requested one fails
              try {
                const fallbackLayout = cy.layout({ name: "grid" });
                fallbackLayout.run();
              } catch (fallbackError) {
                console.error(
                  "[CytoscapeGraph] Error running fallback layout:",
                  fallbackError
                );
              }
            }
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
    };
  }, [elements, onNodeClick]);

  // Handle layout changes
  useEffect(() => {
    if (!cyRef.current) return;

    const cy = cyRef.current;

    // Check if instance is still valid
    try {
      // Test if instance is still valid by checking container
      if (!cy.container()) return;
    } catch (error) {
      // Instance is destroyed or invalid
      return;
    }

    // Run new layout
    try {
      const layoutInstance = cy.layout({
        name: layout,
      });
      layoutInstance.run();
    } catch (layoutError) {
      console.warn("[CytoscapeGraph] Error running layout:", layoutError);
      // Fallback to a simple layout if the requested one fails
      try {
        const fallbackLayout = cy.layout({ name: "grid" });
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
