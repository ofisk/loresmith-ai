import { Lightbulb } from "@phosphor-icons/react";
import loresmith from "@/assets/loresmith.png";
import { Button } from "@/components/button/Button";
import { Card } from "@/components/card/Card";

interface WelcomeMessageProps {
  onSuggestionSubmit: (suggestion: string) => void;
}

export function WelcomeMessage({ onSuggestionSubmit }: WelcomeMessageProps) {
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
            Speak your query, and I shall summon the most fitting agent. Try:
          </p>
          <div className="flex justify-center gap-2 pt-2">
            <Button
              size="sm"
              variant="secondary"
              className="bg-neutral-100 dark:bg-neutral-600"
              onClick={() => onSuggestionSubmit("Get started")}
            >
              <Lightbulb size={12} />
              Get started
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="bg-neutral-100 dark:bg-neutral-600"
              onClick={() => onSuggestionSubmit("Show agents")}
            >
              <Lightbulb size={12} />
              Show agents
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
