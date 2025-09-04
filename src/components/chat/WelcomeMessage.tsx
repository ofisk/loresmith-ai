import { Lightbulb } from "@phosphor-icons/react";
import loresmith from "@/assets/loresmith.png";
import { Button } from "@/components/button/Button";
import { Card } from "@/components/card/Card";

interface WelcomeMessageProps {
  onSuggestionSubmit: (suggestion: string) => void;
  onUploadFiles?: () => void;
}

export function WelcomeMessage({
  onSuggestionSubmit,
  onUploadFiles,
}: WelcomeMessageProps) {
  return (
    <div className="h-full flex items-center justify-center">
      <Card className="p-6 max-w-2xl mx-auto bg-neutral-100 dark:bg-neutral-900">
        <div className="text-left space-y-4">
          <div className="bg-[#F48120]/10 text-[#F48120] rounded-full p-3 inline-flex">
            <img src={loresmith} alt="LoreSmith logo" width={48} height={48} />
          </div>
          <h3 className="font-semibold text-lg">
            👋 Welcome to LoreSmith Campaign Planner!
          </h3>
          <p className="text-muted-foreground text-sm">
            Choose your path to begin your RPG campaign journey:
          </p>
          <div className="space-y-3">
            <div className="bg-white dark:bg-neutral-800 p-3 rounded-lg border">
              <h4 className="font-medium text-sm mb-1">
                📚 Build Your Library
              </h4>
              <p className="text-xs text-muted-foreground mb-2">
                Upload resources (PDFs, documents) to create a searchable
                knowledge base
              </p>
              <Button
                size="sm"
                variant="secondary"
                className="bg-neutral-100 dark:bg-neutral-600"
                onClick={onUploadFiles}
              >
                <Lightbulb size={12} />
                Upload Resources
              </Button>
            </div>
            <div className="bg-white dark:bg-neutral-800 p-3 rounded-lg border">
              <h4 className="font-medium text-sm mb-1">
                🎲 Plan Your Campaign
              </h4>
              <p className="text-xs text-muted-foreground mb-2">
                Chat with me to brainstorm ideas, create campaigns, and plan
                adventures
              </p>
              <Button
                size="sm"
                variant="secondary"
                className="bg-neutral-100 dark:bg-neutral-600"
                onClick={() =>
                  onSuggestionSubmit("Help me plan a new campaign")
                }
              >
                <Lightbulb size={12} />
                Start Planning
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
