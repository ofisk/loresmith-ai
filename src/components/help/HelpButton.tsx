import { Question } from "@phosphor-icons/react";
import { useState } from "react";
import { Button } from "../button/Button";
import { Card } from "../card/Card";
import { MemoizedMarkdown } from "../memoized-markdown";

interface HelpResponse {
  message: string;
  primaryAction: {
    title: string;
    description: string;
    action: string;
    priority: "high" | "medium" | "low";
    estimatedTime: string;
  };
  secondaryActions: Array<{
    title: string;
    description: string;
    action: string;
    priority: "high" | "medium" | "low";
    estimatedTime: string;
  }>;
  externalTools: Array<{
    name: string;
    url: string;
    description: string;
    category: "inspiration" | "tools" | "community" | "content";
    relevance: "high" | "medium" | "low";
  }>;
}

interface HelpButtonProps {
  onActionClick: (action: string) => void;
}

export function HelpButton({ onActionClick }: HelpButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [helpData, setHelpData] = useState<HelpResponse | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  const handleHelpClick = async () => {
    if (showHelp) {
      setShowHelp(false);
      setHelpData(null);
      return;
    }

    setIsLoading(true);
    try {
      const jwt = localStorage.getItem("loresmith-jwt");
      const response = await fetch("/onboarding/welcome-guidance", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${jwt}`,
          "Content-Type": "application/json",
        },
      });

      if (response.ok) {
        const data = await response.json();
        setHelpData(data as HelpResponse);
        setShowHelp(true);
      } else {
        console.error("Failed to fetch help data");
      }
    } catch (error) {
      console.error("Error fetching help:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleActionClick = (action: string) => {
    onActionClick(action);
    setShowHelp(false);
    setHelpData(null);
  };

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="md"
        shape="square"
        className="rounded-full h-9 w-9"
        onClick={handleHelpClick}
        loading={isLoading}
        tooltip="Get help and guidance"
      >
        <Question size={20} />
      </Button>

      {showHelp && helpData && (
        <div className="absolute top-full right-0 mt-2 w-80 z-50">
          <Card className="p-4 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 shadow-lg">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-lg">💡 Help & Guidance</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  shape="square"
                  className="h-6 w-6"
                  onClick={() => setShowHelp(false)}
                >
                  ×
                </Button>
              </div>

              <div className="prose prose-sm dark:prose-invert max-w-none">
                <MemoizedMarkdown content={helpData.message} />
              </div>

              <div className="space-y-3">
                <div>
                  <h4 className="font-medium text-sm mb-2">Primary Action</h4>
                  <Button
                    variant="primary"
                    size="sm"
                    className="w-full justify-start"
                    onClick={() =>
                      handleActionClick(helpData.primaryAction.action)
                    }
                  >
                    {helpData.primaryAction.title}
                  </Button>
                  <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-1">
                    {helpData.primaryAction.description}
                  </p>
                </div>

                {helpData.secondaryActions.length > 0 && (
                  <div>
                    <h4 className="font-medium text-sm mb-2">Other Options</h4>
                    <div className="space-y-2">
                      {helpData.secondaryActions.map((action) => (
                        <Button
                          key={action.title}
                          variant="secondary"
                          size="sm"
                          className="w-full justify-start"
                          onClick={() => handleActionClick(action.action)}
                        >
                          {action.title}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}

                {helpData.externalTools.length > 0 && (
                  <div>
                    <h4 className="font-medium text-sm mb-2">
                      External Resources
                    </h4>
                    <div className="space-y-1">
                      {helpData.externalTools.map((tool) => (
                        <a
                          key={tool.name}
                          href={tool.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block text-xs text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          {tool.name} - {tool.description}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
