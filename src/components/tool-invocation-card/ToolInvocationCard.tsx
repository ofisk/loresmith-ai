import { CaretDown, Robot } from "@phosphor-icons/react";
import { useState } from "react";
import { Button } from "@/components/button/Button";
import {
  AddResourceForm,
  CampaignDetails,
  CampaignResourceList,
  CreateCampaignForm,
} from "@/components/campaign";
import { Card } from "@/components/card/Card";

import { APPROVAL } from "@/shared";

interface ToolInvocation {
  toolName: string;
  toolCallId: string;
  state: "call" | "result" | "partial-call";
  step?: number;
  args: Record<string, unknown>;
  result?: {
    content?: Array<{ type: string; text: string }>;
  };
}

interface ToolInvocationCardProps {
  toolInvocation: ToolInvocation;
  toolCallId: string;
  needsConfirmation: boolean;
  addToolResult: (args: { toolCallId: string; result: string }) => void;
}

export function ToolInvocationCard({
  toolInvocation,
  toolCallId,
  needsConfirmation,
  addToolResult,
}: ToolInvocationCardProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  // Render campaign UI components for campaign tools
  const renderCampaignUI = () => {
    if (!needsConfirmation || toolInvocation.state !== "call") {
      return null;
    }

    switch (toolInvocation.toolName) {
      case "createCampaign": {
        const { name: extractedName } = toolInvocation.args as {
          name?: string;
        };
        return (
          <div className="mt-4">
            <CreateCampaignForm
              defaultName={extractedName || ""}
              onSuccess={(campaign) => {
                addToolResult({
                  toolCallId,
                  result: `Campaign created successfully: ${campaign.name} (ID: ${campaign.campaignId})`,
                });
              }}
              onCancel={() => {
                addToolResult({
                  toolCallId,
                  result: "Campaign creation cancelled",
                });
              }}
            />
          </div>
        );
      }

      case "listCampaignResources": {
        const { campaignId } = toolInvocation.args as { campaignId: string };
        return (
          <div className="mt-4">
            <CampaignResourceList
              campaignId={campaignId}
              onResourceRemoved={(resourceId) => {
                addToolResult({
                  toolCallId,
                  result: `Resource ${resourceId} removed from campaign ${campaignId}`,
                });
              }}
            />
          </div>
        );
      }

      case "addResourceToCampaign": {
        const { campaignId: addCampaignId } = toolInvocation.args as {
          campaignId: string;
          resourceType: string;
          resourceId: string;
          resourceName?: string;
        };
        return (
          <div className="mt-4">
            <AddResourceForm
              campaignId={addCampaignId}
              onResourceAdded={(_resource) => {
                addToolResult({
                  toolCallId,
                  result: `Resource added successfully to campaign ${addCampaignId}`,
                });
              }}
            />
          </div>
        );
      }

      case "showCampaignDetails": {
        const { campaignId: detailsCampaignId } = toolInvocation.args as {
          campaignId: string;
        };
        return (
          <div className="mt-4">
            <CampaignDetails campaignId={detailsCampaignId} />
            <div className="flex gap-2 mt-4">
              <Button
                variant="destructive"
                size="base"
                onClick={() => {
                  addToolResult({
                    toolCallId,
                    result: JSON.stringify({
                      action: "deleteCampaign",
                      campaignId: detailsCampaignId,
                    }),
                  });
                }}
              >
                Delete Campaign
              </Button>
            </div>
          </div>
        );
      }

      default:
        return null;
    }
  };

  return (
    <Card
      className={`p-4 my-3 w-full max-w-[500px] rounded-md bg-neutral-100 dark:bg-neutral-900 ${
        needsConfirmation ? "" : "border-[#F48120]/30"
      } overflow-hidden`}
    >
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-2 cursor-pointer"
      >
        <div
          className={`${needsConfirmation ? "bg-[#F48120]/10" : "bg-[#F48120]/5"} p-1.5 rounded-full flex-shrink-0`}
        >
          <Robot size={16} className="text-[#F48120]" />
        </div>
        <h4 className="font-medium flex items-center gap-2 flex-1 text-left">
          {toolInvocation.toolName}
          {!needsConfirmation && toolInvocation.state === "result" && (
            <span className="text-xs text-[#F48120]/70">✓ Completed</span>
          )}
        </h4>
        <CaretDown
          size={16}
          className={`text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`}
        />
      </button>

      <div
        className={`transition-all duration-200 ${isExpanded ? "max-h-none opacity-100 mt-3" : "max-h-0 opacity-0 overflow-hidden"}`}
      >
        <div className="overflow-y-auto">
          {/* Show campaign UI for campaign tools */}
          {renderCampaignUI()}

          {/* Show arguments for non-campaign tools or when no UI is rendered */}
          {!renderCampaignUI() && (
            <div className="mb-3">
              <h5 className="text-xs font-medium mb-1 text-muted-foreground">
                Arguments:
              </h5>
              <pre className="bg-background/80 p-2 rounded-md text-xs overflow-auto whitespace-pre-wrap break-words max-w-[450px]">
                {JSON.stringify(toolInvocation.args, null, 2)}
              </pre>
            </div>
          )}

          {/* Show approval buttons for campaign tools */}
          {needsConfirmation &&
            toolInvocation.state === "call" &&
            !renderCampaignUI() && (
              <div className="flex gap-2 justify-end">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() =>
                    addToolResult({
                      toolCallId,
                      result: APPROVAL.NO,
                    })
                  }
                >
                  Reject
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() =>
                    addToolResult({
                      toolCallId,
                      result: APPROVAL.YES,
                    })
                  }
                >
                  Approve
                </Button>
              </div>
            )}

          {!needsConfirmation && toolInvocation.state === "result" && (
            <div className="mt-3 border-t border-[#F48120]/10 pt-3">
              <h5 className="text-xs font-medium mb-1 text-muted-foreground">
                Result:
              </h5>
              <pre className="bg-background/80 p-2 rounded-md text-xs overflow-auto whitespace-pre-wrap break-words max-w-[450px]">
                {(() => {
                  const result = toolInvocation.result;
                  if (typeof result === "object" && result.content) {
                    return result.content
                      .map((item: { type: string; text: string }) => {
                        if (
                          item.type === "text" &&
                          item.text.startsWith("\n~ Page URL:")
                        ) {
                          const lines = item.text.split("\n").filter(Boolean);
                          return lines
                            .map(
                              (line: string) => `- ${line.replace("\n~ ", "")}`
                            )
                            .join("\n");
                        }
                        return item.text;
                      })
                      .join("\n");
                  }
                  return JSON.stringify(result, null, 2);
                })()}
              </pre>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
