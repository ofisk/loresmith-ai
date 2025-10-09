import { Lightbulb } from "@phosphor-icons/react";
import { Button } from "@/components/button/Button";
import { Card } from "@/components/card/Card";
import mapIcon from "../../assets/map.png";
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
    <div className="w-full flex justify-center py-8">
      <Card className="p-8 max-w-4xl w-full bg-neutral-100/80 dark:bg-neutral-900/80 backdrop-blur-sm shadow-lg border border-neutral-200/50 dark:border-neutral-700/50">
        <div className="text-left space-y-6">
          <h3 className="font-semibold text-xl">
            Welcome to LoreSmith campaign planner!
          </h3>
          <div className="text-muted-foreground text-base space-y-4">
            <p>Choose your path to begin your RPG campaign journey:</p>

            <div className="space-y-3">
              <div>
                <div className="font-semibold text-base mb-2 flex items-center gap-2">
                  <span className="bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-200 px-2 py-1 rounded-md text-sm">
                    Build Your Campaign Library
                  </span>
                </div>
                <p className="text-sm mt-1">
                  Upload adventure modules, homebrew content, maps, and
                  reference materials. LoreSmith transforms your PDFs and
                  documents into an intelligent, searchable knowledge base that
                  helps you find exactly what you need when planning sessions.
                </p>
              </div>

              <div>
                <div className="font-semibold text-base mb-2 flex items-center gap-2">
                  <span className="bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-200 px-2 py-1 rounded-md text-sm">
                    Organize Your Story
                  </span>
                </div>
                <p className="text-sm mt-1">
                  Create campaigns to organize your narrative, track NPCs,
                  manage plot hooks, and build your world. Keep all your
                  campaign context in one place and accessible at a moment's
                  notice.
                </p>
              </div>

              <div>
                <div className="font-semibold text-base mb-2 flex items-center gap-2">
                  <span className="bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-200 px-2 py-1 rounded-md text-sm">
                    Start Brainstorming
                  </span>
                </div>
                <p className="text-sm mt-1">
                  Not sure where to begin? Chat with me! I can help you develop
                  campaign ideas, create compelling NPCs, design encounters,
                  plan sessions, and answer questions about D&D mechanics. Think
                  of me as your always-available co-DM.
                </p>
              </div>
            </div>

            <p className="font-medium bg-purple-50 dark:bg-purple-900/20 text-purple-900 dark:text-purple-100 px-3 py-2 rounded-lg border border-purple-200 dark:border-purple-700">
              Ready to dive in? Pick an option below to get started:
            </p>
          </div>
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
                <img src={mapIcon} alt="Map" className="w-12 h-12" />
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
