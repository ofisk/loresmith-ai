import { Lightbulb } from "@phosphor-icons/react";
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
      <Card className="p-8 max-w-2xl mx-auto bg-neutral-100/80 dark:bg-neutral-900/80 backdrop-blur-sm shadow-lg border border-neutral-200/50 dark:border-neutral-700/50">
        <div className="text-left space-y-6">
          <h3 className="font-semibold text-xl">
            👋 Welcome to LoreSmith Campaign Planner!
          </h3>
          <p className="text-muted-foreground text-base">
            Choose your path to begin your RPG campaign journey:
          </p>
          <div className="space-y-4">
            <div className="bg-white/80 dark:bg-neutral-800/80 p-5 rounded-xl border border-neutral-200/50 dark:border-neutral-700/50 backdrop-blur-sm shadow-sm">
              <h4 className="font-medium text-base mb-2">
                📚 Build Your Library
              </h4>
              <p className="text-sm text-muted-foreground mb-4">
                Upload resources (PDFs, documents) to create a searchable
                knowledge base
              </p>
              <Button
                size="sm"
                variant="secondary"
                className="bg-neutral-100 dark:bg-neutral-600 rounded-lg"
                onClick={onUploadFiles}
              >
                <Lightbulb size={14} />
                Upload Resources
              </Button>
            </div>
            <div className="bg-white/80 dark:bg-neutral-800/80 p-5 rounded-xl border border-neutral-200/50 dark:border-neutral-700/50 backdrop-blur-sm shadow-sm">
              <h4 className="font-medium text-base mb-2">
                🎲 Plan Your Campaign
              </h4>
              <p className="text-sm text-muted-foreground mb-4">
                Chat with me to brainstorm ideas, create campaigns, and plan
                adventures
              </p>
              <Button
                size="sm"
                variant="secondary"
                className="bg-neutral-100 dark:bg-neutral-600 rounded-lg"
                onClick={() =>
                  onSuggestionSubmit("Help me plan a new campaign")
                }
              >
                <Lightbulb size={14} />
                Start Planning
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
