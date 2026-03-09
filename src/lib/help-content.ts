export function getHelpContent(action: string): string {
	switch (action) {
		case "open_help":
			return (
				"What do you need help with? Here are some example questions based on what LoreSmith can do:\n\n" +
				"**Using the app:**\n" +
				"- How do I upload resources to my library?\n" +
				"- How do I create a campaign?\n" +
				"- How do I add resources to a campaign?\n\n" +
				"**Using the AI assistant:**\n" +
				"- What can the AI help me with for my campaign?\n" +
				"- How do I plan a session or get story ideas?\n" +
				"- How do I record a session recap?\n\n" +
				"**Running low on capacity:**\n" +
				"- Which boost should I get when adding lots of documents?\n\n" +
				"Type your question in the chat below and I’ll walk you through it."
			);
		case "upload_resource":
			return (
				"## 📚 Uploading Resources\n\n" +
				"Build your resource library by uploading files:\n\n" +
				"**Steps:**\n" +
				"1. Click **'Add to library'** in the sidebar\n" +
				"2. Drag and drop files onto the upload area (or click to select)\n" +
				"3. Wait for processing to complete\n" +
				"4. Add files to campaigns to make them searchable\n\n" +
				"**Supported Formats:**\n" +
				"- PDF files (up to 100MB - Cloudflare Workers memory limit with buffer)\n" +
				"- Images (PNG, JPG, etc.)\n" +
				"- Text documents\n\n" +
				"**What Happens Next:**\n" +
				"• Content is extracted and indexed\n" +
				"• Entities (NPCs, locations, items) are automatically identified\n" +
				"• Files become searchable via semantic search\n" +
				"• Content becomes part of your campaign's knowledge base when added to campaigns"
			);
		case "create_campaign":
			return (
				"## 🎲 Creating a Campaign\n\n" +
				"Organize your resources and planning with campaigns:\n\n" +
				"**Steps:**\n" +
				"1. Click **'Create Campaign'** in the sidebar\n" +
				"2. Enter a campaign name\n" +
				"3. Optionally add a description\n" +
				"4. Click **'Create'** to finish\n\n" +
				"**Campaign Benefits:**\n" +
				"• Organize resources by story\n" +
				"• Maintain separate contexts for different campaigns\n" +
				"• Track session history and world state\n" +
				"• Get AI assistance tailored to your campaign\n\n" +
				"**Pro Tip:** Create separate campaigns for different stories to keep contexts clean and focused."
			);
		case "boost_selection":
			return (
				"## Choosing a boost\n\n" +
				"When you're adding documents to campaigns, the app needs capacity to read and prepare each one. Think about how much you're adding right now:\n\n" +
				"**Small** – A couple of sourcebooks, a few character sheets, or a small batch of notes. Good for topping up mid-session.\n\n" +
				"**Standard** – A full campaign's worth: your core setting doc, several adventures, and the handouts you'll need. Covers most import sessions.\n\n" +
				"**Large** – Multiple campaigns at once, or a large world-building library (dozens of documents). For heavy prep days.\n\n" +
				"Visit the billing page to purchase. Credits never expire."
			);
		case "usage_limits":
			return (
				"## Usage limits\n\n" +
				"These limits apply to non-admin users. Limits reset on a sliding window.\n\n" +
				"| Limit | Amount |\n|-------|--------|\n" +
				"| Tokens per minute | 10,000 |\n" +
				"| Queries per minute | 10 |\n" +
				"| Tokens per day | 500,000 |\n" +
				"| Queries per day | 500 |\n\n" +
				"Use the **View limits** link in the sidebar (under your library) to see your current usage and limits."
			);
		case "start_chat":
			return (
				"## 💬 Using the AI Assistant\n\n" +
				"Get help with campaign planning and world building:\n\n" +
				"**What I Can Help With:**\n\n" +
				"**Campaign Planning:**\n" +
				'• "What should I prepare for next session?"\n' +
				'• "Generate NPCs for the tavern scene"\n' +
				'• "Plan an encounter with the dragon"\n\n' +
				"**World Building:**\n" +
				'• "Create a merchant NPC who knows about the ruins"\n' +
				'• "Design a puzzle for the ancient temple"\n' +
				'• "Help me develop the political landscape"\n\n' +
				"**Information Retrieval:**\n" +
				'• "What do we know about the Black Dragon?"\n' +
				'• "What happened in session 3?"\n' +
				'• "Find all mentions of the artifact"\n\n' +
				"**Best Practices:**\n" +
				"• Be specific - detailed questions get better answers\n" +
				"• Reference your campaign - I understand your campaign context\n" +
				"• Ask follow-ups - build on previous answers\n" +
				"• Use natural language - talk to me like a co-GM\n\n" +
				"**Note:** Make sure you have a campaign selected for campaign-specific queries!"
			);
		default:
			return (
				"## 🎯 Getting Started with LoreSmith AI\n\n" +
				"Welcome! Here's how to get started:\n\n" +
				"**1. Upload Resources** 📚\n" +
				"Click **'Add to library'** to upload PDFs, images, and documents. Once uploaded, add them to campaigns to make content searchable.\n\n" +
				"**2. Create Campaigns** 🎲\n" +
				"Click **'Create Campaign'** to organize your resources. Each campaign maintains its own context and knowledge base.\n\n" +
				"**3. Start Planning** 💬\n" +
				"Use the chat to ask questions, plan sessions, or get AI assistance. The AI understands your campaign context automatically.\n\n" +
				"**4. Track Sessions** 📝\n" +
				"Create session digests after each session to track world state and maintain continuity.\n\n" +
				"**Quick Tips:**\n" +
				"• Upload resources before creating campaigns for best results\n" +
				"• Add resources to campaigns to make them searchable\n" +
				"• Be specific with AI queries for better responses\n" +
				"• Keep session digests updated for better continuity\n\n" +
				"**Need More Help?**\n" +
				"Check the User Guide in the documentation for detailed instructions and examples!"
			);
	}
}
