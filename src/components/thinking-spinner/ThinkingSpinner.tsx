import { Loader } from "../loader/Loader";
import { useState, useEffect } from "react";

type ThinkingSpinnerProps = {
  className?: string;
  size?: number;
  showText?: boolean;
};

const mysticalMessages = [
  {
    primary: "🧙‍♂️ Consulting the ancient scrolls...",
    secondary: "✨ Weaving wisdom from the ethereal realm",
  },
  {
    primary: "🔮 Gazing into the crystal ball...",
    secondary: "🌟 Divining the perfect tale for your quest",
  },
  {
    primary: "📜 Deciphering mystical runes...",
    secondary: "⚡ Channeling the power of storytelling",
  },
  {
    primary: "🏰 Summoning knowledge from distant realms...",
    secondary: "🗡️ Forging the perfect campaign wisdom",
  },
  {
    primary: "🌙 Communing with the spirits of lore...",
    secondary: "🎭 Crafting epic adventures from moonlight",
  },
];

export const ThinkingSpinner = ({
  className = "",
  size = 20,
  showText = true,
}: ThinkingSpinnerProps) => {
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    // Pick a random message when component mounts
    setMessageIndex(Math.floor(Math.random() * mysticalMessages.length));
  }, []);

  const currentMessage = mysticalMessages[messageIndex];

  return (
    <div className={`flex items-center gap-3 p-3 ${className}`}>
      <div className="flex items-center gap-2">
        <Loader size={size} className="text-orange-500" />
        {showText && (
          <div className="flex flex-col">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {currentMessage.primary}
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {currentMessage.secondary}
            </span>
          </div>
        )}
      </div>
      <div className="flex gap-1">
        <div className="w-2 h-2 bg-orange-400 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
        <div className="w-2 h-2 bg-orange-500 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
        <div className="w-2 h-2 bg-orange-600 rounded-full animate-bounce"></div>
      </div>
    </div>
  );
};
