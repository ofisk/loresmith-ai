import { Question } from "@phosphor-icons/react";
import { Button } from "../button/Button";

interface HelpButtonProps {
  onActionClick: (action: string) => void;
  onGuidanceRequest: () => void;
}

export function HelpButton({
  onActionClick: _onActionClick,
  onGuidanceRequest,
}: HelpButtonProps) {
  const handleHelpClick = () => {
    onGuidanceRequest();
  };

  return (
    <Button
      variant="ghost"
      size="md"
      shape="square"
      className="!h-9 !w-9 rounded-full flex items-center justify-center"
      onClick={handleHelpClick}
      tooltip="Get help and guidance"
    >
      <Question size={20} />
    </Button>
  );
}
