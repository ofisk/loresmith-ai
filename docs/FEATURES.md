# LoreSmith AI Features

This document provides a comprehensive overview of LoreSmith AI's features and capabilities.

## Core Features

### 🎲 Campaign Management

**Campaign Creation & Organization**

![Create Campaign Modal](images/create-campaign-modal.png)

- Create unlimited campaigns
- Organize campaigns with names and descriptions
- Switch between campaigns seamlessly
- Campaign-specific context and resources
- Intuitive creation modal with optional descriptions

**Campaign Context**

![AI Campaign Creation Help](images/ai-campaign-creation-help.png)

- Automatic context assembly from resources
- Entity relationship tracking
- World state management
- Session history integration
- Campaign selection dropdown drives AI responses
- AI can assist with campaign creation and setup

### 📚 Resource Library

**File Upload & Storage**

![Add Resource Modal](images/add-resource-modal.png)

- Upload PDFs, documents, and images
- Support for files up to 100MB (Cloudflare Workers memory limit with buffer)
- Secure cloud storage
- Direct upload with progress tracking
- Intuitive upload modal with drag-and-drop support
- Optional metadata: filename, description, and tags
- Campaign association during upload

**Content Processing**

- Automatic text extraction from PDFs
- Image processing and OCR
- Entity extraction from content
- Semantic indexing for search
- **AI-powered metadata generation**: Automatic descriptions and tags based on file content
- Processing status tracking (Ready, Processing, Failed)
- Real-time status updates during processing
- Retry capability for failed processing

**AI-Generated Metadata**

LoreSmith automatically generates rich metadata for uploaded files:

![AI-Generated Metadata](images/file-metadata-ai-generated.png)

- Intelligent descriptions summarizing file content
- Relevant tags extracted from the content
- Editable metadata for customization

![File Processing Success](images/file-processing-success.png)

![File Processing In Progress](images/file-processing-in-progress.png)

![File Processing Failure](images/file-processing-failure.png)

**Organization**

- Add files to multiple campaigns using an intuitive modal interface

![Add File to Campaign](images/add-file-to-campaign-modal.png)

- Tag and categorize resources
- Search across all resources
- Filter by campaign, type, or tags

### 🤖 AI-Powered Assistant

**Conversational Interface**

![AI Help Conversation](images/ai-help-conversation.png)

- Natural language chat interface
- Context-aware responses
- Campaign-specific knowledge
- Multi-turn conversations
- Personalized guidance via "Get help" feature

**Intelligent Responses**

- Understands your campaign context
- References uploaded resources
- Maintains conversation history
- Provides actionable suggestions
- Analyzes your current state to offer relevant next steps

### 🔍 GraphRAG Technology

**Knowledge Graph**

- Automatic entity extraction (NPCs, locations, items)
- Relationship mapping between entities
- Multi-hop graph traversal
- Entity similarity search

**Context Assembly**

- Combines multiple context sources
- World knowledge from resources
- Recent world state changes
- Session history integration

**Semantic Search**

- Meaning-based search (not just keywords)
- Finds related concepts
- Discovers entity connections
- Contextually relevant results

### 📝 Session Planning

**Session Digests**

- Create session summaries
- Track world state changes
- Document NPC interactions
- Record player decisions

**Planning Assistance**

- Generate session outlines
- Suggest encounters and events
- Maintain campaign continuity
- Plan future story beats

**World State Tracking**

- Automatic entity status updates
- Relationship changes
- Location discoveries
- Plot progression tracking

### 🌐 Entity Management

**Automatic Extraction**

- Extracts entities from uploaded resources
- Identifies relationships
- Creates knowledge graph nodes
- Builds entity network

**Entity Types**

- NPCs (Non-Player Characters)
- Locations (Cities, Dungeons, etc.)
- Items (Weapons, Artifacts, etc.)
- Organizations (Guilds, Factions, etc.)
- Events (Battles, Rituals, etc.)

**Relationship Tracking**

- Entity-to-entity connections
- Relationship types and strengths
- Temporal relationships
- Hierarchical structures

## Advanced Features

### 🔐 Security & Privacy

**Authentication**

- JWT-based secure authentication
- User-provided API keys
- Session management
- Secure data storage

**Data Privacy**

- API keys stored securely
- User data isolation
- Campaign access control
- Secure file uploads

### ⚡ Performance

**Caching**

- Query result caching
- Context assembly caching
- Reduced API calls
- Faster response times

**Optimization**

- Parallel query execution
- Efficient vector search
- Database query optimization
- Edge deployment for low latency

### 📊 Analytics & Monitoring

**Telemetry** (Admin Only)

- Query latency tracking
- Rebuild frequency monitoring
- Changelog growth metrics
- User satisfaction ratings
- Context accuracy measurement

**Dashboard**

- Visual metrics display
- Performance insights
- Usage statistics
- System health monitoring

## User Experience Features

### 🎨 Interface

**Modern UI**

- Clean, intuitive interface
- Dark mode support
- Responsive design
- Keyboard shortcuts

**Real-time Updates**

- Live file upload progress
- Instant search results
- Real-time notifications
- Streaming AI responses

### 🔔 Notifications

**Progress Updates**

- File processing status
- Entity extraction progress
- Campaign rebuild status
- System notifications

**Real-time Events**

- SSE (Server-Sent Events) support
- WebSocket notifications
- Status change alerts
- Completion notifications

![Notifications System](images/notifications-system.png)

## Integration Features

### 🔌 API Access

**RESTful API**

- Complete API for all features
- Authentication via JWT
- Standard HTTP methods
- JSON responses

**Endpoints**

- Campaign management
- File upload and retrieval
- Entity queries
- Context assembly
- Session management

### 📤 Export & Import

**Data Portability**

- Export campaign data
- Download resources
- Backup capabilities
- Migration support

## Future Features (Roadmap)

### 🚀 Planned Enhancements

- **Collaboration**: Shared campaigns and resources
- **Templates**: Campaign and resource templates
- **Plugins**: Extensible entity extraction
- **Mobile App**: Native mobile application
- **Offline Mode**: Limited offline functionality
- **Advanced Analytics**: User-facing analytics dashboard
- **Integration**: Third-party tool integrations

---

For detailed information on using these features, see the [User Guide](USER_GUIDE.md).
For technical implementation details, see [Architecture Overview](ARCHITECTURE.md).
