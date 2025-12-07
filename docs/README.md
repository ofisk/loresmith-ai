# LoreSmith AI Documentation

Welcome to the LoreSmith AI documentation! This directory contains comprehensive guides for both users and developers.

## 📚 Documentation Index

### For Users

- **[User Guide](USER_GUIDE.md)** - Complete guide to using LoreSmith AI
  - Getting started
  - Creating campaigns
  - Uploading resources
  - Using the AI assistant
  - Session planning workflows

- **[Features Overview](FEATURES.md)** - Detailed feature documentation
  - Campaign management
  - Resource library
  - GraphRAG technology
  - Session tracking

### For Developers

#### Getting Started

- **[Developer Setup](DEV_SETUP.md)** - Complete development environment setup
  - Prerequisites
  - Installation
  - Configuration
  - Running locally

- **[Architecture Overview](ARCHITECTURE.md)** - System architecture documentation
  - Component overview
  - Data flows
  - Security architecture
  - Deployment structure

#### Technical Documentation

- **[GraphRAG Integration](GRAPHRAG_INTEGRATION.md)** - GraphRAG implementation details
  - Entity extraction pipeline
  - Context assembly process
  - Query types and usage
  - Performance considerations

- **[Authentication Flow](AUTHENTICATION_FLOW.md)** - Authentication system documentation
  - JWT-based authentication
  - API key management
  - Session handling
  - Security practices

- **[Storage Strategy](STORAGE_STRATEGY.md)** - Data storage architecture
  - D1 database schema
  - R2 object storage
  - Durable Objects usage
  - Data persistence

- **[File Analysis System](FILE_ANALYSIS_SYSTEM.md)** - File processing pipeline
  - File upload flow
  - Content extraction
  - Entity extraction
  - Indexing process

- **[Large File Support](LARGE_FILE_SUPPORT.md)** - Handling large files
  - Chunked uploads
  - Processing strategies
  - Performance optimization

- **[Model Configuration](MODEL_CONFIGURATION.md)** - AI model configuration
  - Available models
  - Configuration options
  - Changing models
  - Performance tuning

#### API & Integration

- **[API Documentation](API.md)** - API endpoint reference
  - Authentication endpoints
  - Campaign endpoints
  - File upload endpoints
  - GraphRAG query endpoints
  - Examples and usage

#### Testing & Quality

- **[Testing Guide](TESTING_GUIDE.md)** - Testing documentation
  - Test setup
  - Running tests
  - Writing tests
  - Campaign workflow tests

#### Deployment & Operations

- **[Deployment](DEPLOYMENT.md)** - Deployment guide
  - Production deployment
  - Environment setup
  - Migration procedures

- **[Contributing](CONTRIBUTING.md)** - Contribution guidelines
  - Development workflow
  - Code standards
  - Pull request process

### Advanced Topics

- **[DAO Layer](DAO_LAYER.md)** - Data Access Object layer
- **[Event Bus Architecture](EVENT_BUS_ARCHITECTURE.md)** - Event-driven architecture
- **[Event Bus Guide](EVENT_BUS_GUIDE.md)** - Using the event bus
- **[Notification System](NOTIFICATION_SYSTEM.md)** - Real-time notifications
- **[Assessment System](ASSESSMENT_SYSTEM.md)** - Campaign assessment features
- **[Campaign Shard Flow](CAMPAIGN_SHARD_FLOW.md)** - Shard-based campaign system
- **[Shard Approval System](SHARD_APPROVAL_SYSTEM.md)** - Entity approval workflow
- **[Shard UI Components](SHARD_UI_COMPONENTS.md)** - Shard UI implementation
- **[Community Detection Memory](COMMUNITY_DETECTION_MEMORY.md)** - Community detection algorithms

### Operations & Maintenance

- **[Clear Production Data](CLEAR_PRODUCTION_DATA.md)** - Data cleanup procedures

## 🚀 Quick Links

- **[Main README](../README.md)** - Project overview and quick start
- **[License](../LICENSE)** - MIT License details

## 📖 Documentation Structure

```
docs/
├── USER_GUIDE.md           # User-facing documentation
├── FEATURES.md             # Feature overview
├── DEV_SETUP.md            # Developer setup guide
├── ARCHITECTURE.md         # System architecture
├── API.md                  # API reference
├── GRAPHRAG_INTEGRATION.md # GraphRAG details
├── AUTHENTICATION_FLOW.md  # Auth system
├── STORAGE_STRATEGY.md     # Storage architecture
└── ...                     # Additional technical docs
```

## 🎯 Finding What You Need

### I want to...

**Use LoreSmith AI:**

- Start with [User Guide](USER_GUIDE.md)
- Check [Features Overview](FEATURES.md) for specific features

**Set up development environment:**

- Follow [Developer Setup](DEV_SETUP.md)
- Review [Architecture Overview](ARCHITECTURE.md)

**Understand how it works:**

- Read [Architecture Overview](ARCHITECTURE.md)
- Dive into [GraphRAG Integration](GRAPHRAG_INTEGRATION.md)

**Integrate with the API:**

- See [API Documentation](API.md)
- Review [Authentication Flow](AUTHENTICATION_FLOW.md)

**Deploy to production:**

- Follow [Deployment](DEPLOYMENT.md)
- Review [Storage Strategy](STORAGE_STRATEGY.md)

**Contribute to the project:**

- Read [Contributing](CONTRIBUTING.md)
- Check [Testing Guide](TESTING_GUIDE.md)

## 📝 Documentation Standards

All documentation should:

- Be clear and accessible to the target audience
- Include examples where helpful
- Use diagrams for complex concepts
- Keep information up to date
- Follow markdown best practices

## 🔄 Keeping Documentation Updated

Documentation is updated alongside code changes. If you find outdated information:

1. Check if there's a recent PR that addresses it
2. Open an issue if something needs updating
3. Submit a PR with corrections

---

**Need help?** Check the [Main README](../README.md) or open an issue on GitHub.
