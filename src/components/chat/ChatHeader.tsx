import { Bug, Moon, Sun, Trash } from "@phosphor-icons/react";
import loresmith from "@/assets/loresmith.png";
import { Button } from "@/components/button/Button";
import { HelpButton } from "@/components/help/HelpButton";
import { useTheme } from "@/components/theme/ThemeProvider";
import { Toggle } from "@/components/toggle/Toggle";

interface ChatHeaderProps {
  showDebug: boolean;
  setShowDebug: React.Dispatch<React.SetStateAction<boolean>>;
  onHelpAction: (action: string) => void;
  onClearHistory: () => void;
}

export function ChatHeader({
  showDebug,
  setShowDebug,
  onHelpAction,
  onClearHistory,
}: ChatHeaderProps) {
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="px-4 py-3 border-b border-neutral-300 dark:border-neutral-800 flex items-center gap-3 sticky top-0 z-10">
      <div
        className="flex items-center justify-center rounded-lg"
        style={{ width: 28, height: 28 }}
      >
        <img
          src={loresmith}
          alt="LoreSmith logo"
          width={28}
          height={28}
          className="object-contain"
        />
      </div>

      <div className="flex-1">
        <h2 className="font-semibold text-base">LoreSmith</h2>
      </div>

      <div className="flex items-center gap-2 mr-2">
        <Bug size={16} />
        <Toggle
          toggled={showDebug}
          aria-label="Toggle debug mode"
          onClick={() => setShowDebug((prev) => !prev)}
        />
      </div>

      <HelpButton onActionClick={onHelpAction} />

      <Button
        variant="ghost"
        size="md"
        shape="square"
        className="rounded-full h-9 w-9"
        onClick={toggleTheme}
      >
        {theme === "dark" ? <Sun size={20} /> : <Moon size={20} />}
      </Button>

      <Button
        variant="ghost"
        size="md"
        shape="square"
        className="rounded-full h-9 w-9"
        onClick={onClearHistory}
      >
        <Trash size={20} />
      </Button>
    </div>
  );
}
