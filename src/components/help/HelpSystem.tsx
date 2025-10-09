import type { Message } from "@ai-sdk/react";

export interface HelpSystemProps {
  append: (message: Omit<Message, "id">) => void;
  setInput: (input: string) => void;
  getStoredJwt: () => string | null;
}

export function useHelpSystem({
  append,
  setInput,
  getStoredJwt,
}: HelpSystemProps) {
  const handleHelpAction = (action: string) => {
    const jwt = getStoredJwt();
    console.log("[Help] handleHelpAction:", action);

    let response = "";
    switch (action) {
      case "upload_resource":
        response =
          "## Uploading Resources\n\n" +
          "To upload resources to your inspiration library:\n\n" +
          "1. Look for the 'Add to library' button in the interface\n" +
          "2. Click the button to open the upload modal\n" +
          "3. Drag and drop files directly onto the upload area for quick upload\n" +
          "4. Select files from your computer if you prefer\n\n" +
          "Supported file types: PDF files, images, and other documents\n\n" +
          "Once uploaded, your resources will be available in your inspiration library for campaign planning!";
        break;
      case "create_campaign":
        response =
          "## Creating a Campaign\n\n" +
          "To create a new campaign:\n\n" +
          "1. Look for the 'Create Campaign' button in the interface\n" +
          "2. Click the button to open the campaign creation form\n" +
          "3. Enter campaign details including:\n" +
          "- Campaign name\n" +
          "- Description\n" +
          "- Setting details\n" +
          "4. Save your campaign to start organizing your resources\n\n" +
          "Benefits: Campaigns help you organize your resources, plan sessions, and track your story development!";
        break;
      case "start_chat":
        response =
          "## Starting a Chat\n\n" +
          "You can start chatting with me right here! Just type your questions about:\n\n" +
          "Campaign Ideas:\n" +
          "- World building concepts\n" +
          "- Plot development\n" +
          "- Character creation\n\n" +
          "GM Topics:\n" +
          "- Session planning\n" +
          "- Encounter design\n" +
          "- Story pacing\n\n" +
          "Tips:\n" +
          "- Be specific with your questions\n" +
          "- Share your campaign context\n" +
          "- Ask for examples or suggestions\n\n" +
          "I'm here to help you develop your campaign ideas and provide guidance!";
        break;
      default:
        response =
          "## Getting Started\n\n" +
          "I can help you with various tasks:\n\n" +
          "Upload Resources:\n" +
          "- Look for the 'Add to library' button\n" +
          "- Upload PDFs, images, and documents\n\n" +
          "Create Campaigns:\n" +
          "- Use the 'Create Campaign' button\n" +
          "- Organize your story elements\n\n" +
          "Start Chatting:\n" +
          "- Just type your questions here\n" +
          "- Ask about campaign ideas, world building, or GM topics\n\n" +
          "Pro Tip: Be specific with your questions to get the most helpful responses!";
    }

    // Add the help response as an assistant message
    append({
      role: "assistant",
      content: response,
      data: jwt ? { jwt } : undefined,
    });
    setInput("");
  };

  return { handleHelpAction };
}
