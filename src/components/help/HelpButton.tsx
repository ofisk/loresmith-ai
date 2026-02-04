import { Question } from "@phosphor-icons/react";
import { Button } from "../button/Button";

interface HelpButtonProps {
  onActionClick: (action: string) => void;
}

export function HelpButton({ onActionClick }: HelpButtonProps) {
  return (
    <Button
      variant="ghost"
      size="md"
      shape="square"
      className="tour-help-button !h-9 !w-9 rounded-full flex items-center justify-center"
      onClick={() => onActionClick("open_help")}
      tooltip="Get help and guidance"
    >
      <Question size={20} />
    </Button>
  );
}
