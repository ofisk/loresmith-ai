import { Lightbulb } from "@phosphor-icons/react";
import { Button } from "@/components/button/Button";
import { Card } from "@/components/card/Card";
import diceIcon from "../../assets/dice.png";
import addToLibraryIcon from "../../assets/add-to-library.png";

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
      <Card className="p-8 max-w-4xl mx-auto bg-neutral-100/80 dark:bg-neutral-900/80 backdrop-blur-sm shadow-lg border border-neutral-200/50 dark:border-neutral-700/50">
        <div className="text-left space-y-6">
          <h3 className="font-semibold text-xl">
            👋 Welcome to LoreSmith campaign planner!
          </h3>
          <p className="text-muted-foreground text-base">
            Choose your path to begin your RPG campaign journey:
          </p>
          <div className="space-y-4">
            <div className="bg-white/80 dark:bg-neutral-800/80 p-5 rounded-xl border border-neutral-200/50 dark:border-neutral-700/50 backdrop-blur-sm shadow-sm">
              <h4 className="font-medium text-base mb-2 flex items-center gap-2">
                <img
                  src={addToLibraryIcon}
                  alt="Add to Library"
                  className="w-12 h-12"
                />
                Build your library
              </h4>
              <p className="text-sm text-muted-foreground mb-4">
                Upload maps, adventure modules, campaign primers, and notes to
                build a searchable knowledge base
              </p>
              <Button
                size="sm"
                variant="secondary"
                className="bg-neutral-100 dark:bg-neutral-600 rounded-lg"
                onClick={onUploadFiles}
              >
                <Lightbulb size={14} />
                Upload resources
              </Button>
            </div>
            <div className="bg-white/80 dark:bg-neutral-800/80 p-5 rounded-xl border border-neutral-200/50 dark:border-neutral-700/50 backdrop-blur-sm shadow-sm">
              <h4 className="font-medium text-base mb-2 flex items-center gap-2">
                <img src={diceIcon} alt="Dice" className="w-12 h-12" />
                Plan your campaign
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
                Start planning
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
