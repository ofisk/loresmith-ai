# LoreSmith AI User Guide

Welcome to LoreSmith AI! This guide will help you get started with campaign planning and resource management.

## Table of Contents

1. [Getting Started](#getting-started)
2. [Authentication](#authentication)
3. [Your First Campaign](#your-first-campaign)
4. [Building Your Resource Library](#building-your-resource-library)
5. [Using the AI Assistant](#using-the-ai-assistant)
6. [Session Planning](#session-planning)
7. [Tips and Best Practices](#tips-and-best-practices)

## Getting Started

### First Steps

When you first access LoreSmith AI, you'll see the welcome screen with three main paths to begin your campaign journey:

![Welcome Screen](images/welcome-screen.png)

The welcome screen presents you with clear options:

1. **Build Your Campaign Library** - Upload resources to create your knowledge base
2. **Organize Your Story** - Create campaigns to structure your narrative
3. **Start Brainstorming** - Begin chatting with the AI assistant

### What You Need

- An OpenAI API key ([Get one here](https://platform.openai.com/api-keys))
- Access to a LoreSmith AI instance
- Campaign resources (PDFs, documents, images) you want to organize

### First Login

1. Navigate to your LoreSmith instance
2. Enter a username (this can be anything you prefer)
3. If required, enter the admin key
4. Enter your OpenAI API key
5. Click "Sign In"

Your session will remain active for 24 hours. After that, you'll need to sign in again.

## Authentication

### Understanding Authentication

LoreSmith uses a secure authentication system where:

- **Username**: Your personal identifier (can be any name you choose)
- **Admin Key**: Optional access key (if your instance requires it)
- **OpenAI API Key**: Your personal OpenAI API key for AI features

**Important**: Your OpenAI API key is:

- Stored securely in your session
- Never shared with other users
- Automatically cleared when your session expires
- Used only for your AI interactions

### Session Management

- Sessions last 24 hours
- You can use multiple devices with the same credentials
- Logging out clears your session on that device

## Your First Campaign

### Creating a Campaign

To create your first campaign, click the **"Create Campaign"** button in the sidebar. This opens the campaign creation modal:

![Create Campaign Modal](images/create-campaign-modal.png)

The modal allows you to:

1. **Enter Campaign Name**: Give your campaign a memorable name (e.g., "The Dragon's Hoard")
2. **Add Description** (optional): Provide context about your campaign's world, setting, or premise
3. **Create**: Click "Create" to finalize your campaign, or "Cancel" to discard

Once created, your campaign will appear in the sidebar and you can start adding resources and planning sessions.

**Tip**: You can also ask the AI assistant to help you create a campaign. The assistant can guide you through the process and provide suggestions based on your preferences. Make sure to select your campaign from the dropdown in the top left after creation to ensure the AI uses the correct context for future conversations.

### Campaign Features

Once you have a campaign:

- **Resource Library**: Upload and organize campaign files
- **AI Context**: The AI assistant understands your campaign's context
- **Session Tracking**: Keep track of sessions and world state
- **Entity Graph**: Automatically track NPCs, locations, and relationships

### Multiple Campaigns

You can create as many campaigns as you need:

- Each campaign maintains its own context
- Resources can be added to multiple campaigns
- Switch between campaigns using the sidebar

## Building Your Resource Library

### Uploading Files

To add resources to your library, click **"Add to Library"** in the sidebar. This opens the upload modal:

![Add Resource Modal](images/add-resource-modal.png)

The upload modal allows you to:

1. **Select Files**: Click to select or drag and drop files into the upload area
2. **Add Metadata** (optional):
   - **Filename**: Give your resource a custom name
   - **Description**: Add notes about the resource's content
   - **Tags**: Add keywords for better organization (e.g., "undead, forest, cursed treasure")
3. **Add to Campaigns** (optional): Select which campaigns this resource should be associated with
4. **Upload**: Click "Upload" to start processing

**Supported formats:**

- PDF files (up to 100MB - Cloudflare Workers memory limit with buffer)
- Images (PNG, JPG, etc.)
- Text documents

After clicking "Upload", wait for processing to complete. You'll see the file appear in your resource library once it's ready.

### File Processing

After upload, LoreSmith automatically:

- Extracts text content from PDFs
- Identifies entities (NPCs, locations, items)
- Creates searchable indexes
- Builds relationships between entities

### Processing Status

Files in your resource library show their processing status:

- **Ready** (green) - File has been successfully processed and is searchable
- **Processing** - File is currently being analyzed and indexed

![File Processing In Progress](images/file-processing-in-progress.png)

- **Failed** (red) - Processing encountered an error

![File Processing Failure](images/file-processing-failure.png)

If a file shows a "Failed" status, you can:

1. Click the retry button to attempt processing again
2. Check the file format - ensure it's a supported type
3. Verify the file isn't corrupted
4. Try uploading the file again if retry doesn't work

### Adding Files to Campaigns

1. Find the file in your library
2. Click the file to view details
3. Use **"Add to Campaign"** to associate it with campaigns
4. The file's content will become part of the campaign's knowledge base

### Organizing Resources

- **Tags**: Add tags to files for better organization
- **Descriptions**: Add notes and descriptions to files
- **Search**: Use the search bar to find files quickly
- **Filtering**: Filter by campaign, tags, or file type

## Using the AI Assistant

### Getting Help

If you're not sure where to start, click the **"Get help"** button in the top right corner. This will start a conversation with the AI assistant that provides personalized guidance based on your current state:

![AI Help Conversation](images/ai-help-conversation.png)

The AI will analyze what you have set up and provide actionable next steps, such as:

- Uploading your first resource
- Creating your first campaign
- Planning sessions
- Organizing your campaign context

### Starting a Conversation

The AI assistant is available in the main chat area. You can ask it to:

- **Plan Sessions**: "What should I prepare for next session?"
- **Find Information**: "What do we know about the Black Dragon?"
- **Create Content**: "Generate NPCs for the tavern scene"
- **Answer Questions**: "How should I handle player conflict?"
- **Get Guidance**: Click "Get help" for personalized assistance

### Campaign Selection and AI Context

The campaign dropdown in the top left corner is crucial for AI responses. When you select a campaign, the AI assistant automatically:

![AI Campaign Creation Help](images/ai-campaign-creation-help.png)

- Accesses your campaign's resource library
- Understands entity relationships
- References past sessions
- Maintains world state continuity
- Provides campaign-specific guidance

**Important**: Always select your campaign from the dropdown before asking campaign-specific questions. The AI uses the selected campaign to provide contextually relevant responses.

You can also ask the AI to help you create campaigns. The assistant can guide you through the process and suggest campaign ideas based on your needs.

### Best Practices for AI Queries

- **Be Specific**: "What happened in session 3?" is better than "Tell me about sessions"
- **Provide Context**: Mention relevant NPCs, locations, or events
- **Ask Follow-ups**: Build on previous answers for deeper planning
- **Use Natural Language**: Talk to it like a co-GM

### Example Conversations

**Session Planning:**

```
You: "I want to run a session focused on exploring the ancient ruins.
     What NPCs and locations from my resources are relevant?"

AI: [Provides relevant entities, relationships, and context from your resources]
```

**World Building:**

```
You: "Create a merchant NPC who could sell information about the ruins"

AI: [Generates NPC with backstory, motivations, and integration suggestions]
```

**Campaign Continuity:**

```
You: "What major events have happened in the campaign so far?"

AI: [Summarizes session digests and world state changes]
```

## Session Planning

### Creating Session Digests

After running a session:

1. Click **"Create Session Digest"** in the chat
2. Describe what happened in the session
3. Mention key events, NPC interactions, and world changes
4. The AI will help format and organize the digest

### Tracking World State

Session digests automatically track:

- **NPC Changes**: Status updates, relationships, motivations
- **Location Updates**: New discoveries, changes to places
- **Plot Development**: Story beats, revelations, conflicts
- **Player Actions**: Significant decisions and consequences

### Using Session History

When planning future sessions:

- The AI can reference past sessions
- World state is maintained automatically
- Continuity is preserved across sessions
- Recent sessions are prioritized in search

### Session Planning Workflow

1. **Review Past Sessions**: Ask the AI about recent events
2. **Check Resources**: Search your library for relevant content
3. **Plan Encounters**: Generate NPCs, locations, and events
4. **Create Outline**: Get an AI-generated session outline
5. **Run Session**: Play your planned session
6. **Record Digest**: Document what happened
7. **Repeat**: Use the new context for next session planning

## Tips and Best Practices

### Organizing Your Library

- **Use Descriptive Names**: Name files clearly (e.g., "DragonLair_Map.pdf" not "map1.pdf")
- **Add Tags**: Create tags for themes, locations, or NPCs
- **Write Descriptions**: Helpful notes make files easier to find later
- **Group by Campaign**: Add relevant files to each campaign

### Working with Campaigns

- **One Campaign per Story**: Keep separate campaigns for different stories
- **Share Resources**: Add resources to multiple campaigns if they're relevant
- **Regular Updates**: Keep session digests up to date
- **Review Regularly**: Check campaign context to maintain continuity

### Getting the Most from AI

- **Provide Context**: The more context you give, the better the responses
- **Be Iterative**: Build on AI suggestions with follow-up questions
- **Use Specific Queries**: Detailed questions get better answers
- **Review and Refine**: AI suggestions are starting points - customize them

### Performance Tips

- **Large Files**: Processing large PDFs may take time - be patient
- **Many Resources**: The system handles large libraries, but organization helps
- **Complex Queries**: Some complex queries may take a few seconds
- **Caching**: Recent queries are cached for faster responses

### Troubleshooting

**AI Not Responding:**

- Check your OpenAI API key is valid
- Ensure you have API credits available
- Try refreshing the page

**Files Not Processing:**

If you see a file with a "Failed" status in your resource library:

![File Processing Failure](images/file-processing-failure.png)

- Click the retry button (🔄) next to the failed file to attempt processing again
- Check that the file format is supported (PDF, images, text documents)
- Verify the file isn't corrupted - try opening it locally first
- Check file size (max 100MB - Cloudflare Workers memory limit with buffer)
- Wait a few minutes and refresh, then retry if needed

**Missing Context:**

- Ensure resources are added to campaigns
- Check that session digests are created
- Verify entities were extracted from files

## Advanced Features

### Entity Graph Exploration

The system automatically builds a knowledge graph of your campaign:

- **Entities**: NPCs, locations, items, organizations
- **Relationships**: Connections between entities
- **Context**: Rich context from your resources

### Semantic Search

Search works by meaning, not just keywords:

- Find related concepts even with different wording
- Discover connections between entities
- Get contextually relevant results

### GraphRAG Technology

LoreSmith uses GraphRAG (Graph Retrieval Augmented Generation):

- Combines knowledge graphs with AI generation
- Maintains entity relationships
- Provides contextually aware responses

## Getting Help

- **In-App Help**: Click the help button (?) in the interface
- **Documentation**: Check the docs folder for detailed guides
- **Support**: Contact your instance administrator for issues

---

**Happy Campaign Planning!** 🎲✨
