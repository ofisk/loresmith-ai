import { CaretDown, Robot } from "@phosphor-icons/react";
import { useState } from "react";
import { Button } from "@/components/button/Button";
import { Card } from "@/components/card/Card";
import { MemoizedMarkdown } from "@/components/MemoizedMarkdown";

import { APPROVAL } from "../../shared-config";

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
  showDebug?: boolean;
}

export function ToolInvocationCard({
  toolInvocation,
  toolCallId,
  needsConfirmation,
  addToolResult,
  showDebug = false,
}: ToolInvocationCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Campaign UI components have been removed - show basic tool information instead
  const renderCampaignUI = () => {
    if (!needsConfirmation || toolInvocation.state !== "call") {
      return null;
    }

    // For campaign tools, show a message that the UI components have been removed
    if (
      toolInvocation.toolName.includes("Campaign") ||
      toolInvocation.toolName.includes("campaign") ||
      toolInvocation.toolName === "createCampaign" ||
      toolInvocation.toolName === "listCampaignResources" ||
      toolInvocation.toolName === "addResourceToCampaign" ||
      toolInvocation.toolName === "showCampaignDetails"
    ) {
      return (
        <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-md">
          <p className="text-sm text-yellow-800 dark:text-yellow-200">
            Campaign management UI has been simplified. Use the AI agent to
            manage campaigns.
          </p>
        </div>
      );
    }

    return null;
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

          {!needsConfirmation &&
            toolInvocation.state === "result" &&
            showDebug && (
              <div className="mt-3 border-t border-[#F48120]/10 pt-3">
                <h5 className="text-xs font-medium mb-1 text-muted-foreground">
                  Result:
                </h5>
                <div className="bg-background/80 p-2 rounded-md text-xs overflow-auto max-w-[450px]">
                  {(() => {
                    const result = toolInvocation.result;
                    if (typeof result === "object" && result.content) {
                      const resultText = result.content
                        .map((item: { type: string; text: string }) => {
                          if (
                            item.type === "text" &&
                            item.text.startsWith("\n~ Page URL:")
                          ) {
                            const lines = item.text.split("\n").filter(Boolean);
                            return lines
                              .map(
                                (line: string) =>
                                  `- ${line.replace("\n~ ", "")}`
                              )
                              .join("\n");
                          }
                          return item.text;
                        })
                        .join("\n");

                      return <MemoizedMarkdown content={resultText} />;
                    }
                    return (
                      <pre className="whitespace-pre-wrap break-words">
                        {JSON.stringify(result, null, 2)}
                      </pre>
                    );
                  })()}
                </div>
              </div>
            )}
        </div>
      </div>
    </Card>
  );
}
