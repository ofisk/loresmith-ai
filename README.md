# 🏰 LoreSmith - D&D Campaign Planning Agents

A collection of A2A (Agent-to-Agent) protocol compliant agents designed to enhance your D&D campaign planning experience. Each agent provides specialized functionality for managing different aspects of your campaigns.

## 🎯 Project Overview

LoreSmith consists of multiple specialized agents that can work independently or together to support D&D campaign management:

- **PDF Storage Agent** - Upload, store, and manage large PDF documents (up to 200MB)
- **D&D Beyond Agent** - Fetch character information directly from D&D Beyond

## 🚀 Quick Start

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd LoreSmith
   ```

2. **Open the landing page**
   - Open `index.html` in your browser to see all available agents
   - Each agent has its own folder with complete documentation and deployment instructions

## 📁 Project Structure

```
LoreSmith/
├── index.html                 # Landing page with agent navigation
├── agents/                    # All agents organized in this folder
│   ├── pdf-agent/            # PDF Storage Agent
│   │   ├── index.js          # Main worker code
│   │   ├── ui-template.js    # Web UI template
│   │   ├── wrangler.toml     # Cloudflare Worker configuration
│   │   ├── package.json      # Dependencies
│   │   └── README.md         # PDF agent documentation
│   └── dndbeyond-agent/      # D&D Beyond Character Agent
│       ├── index.js          # Main worker code
│       ├── wrangler.toml     # Cloudflare Worker configuration
│       ├── package.json      # Dependencies
│       └── README.md         # D&D Beyond agent documentation
└── README.md                 # This file
```

## 🤖 Available Agents

### 📚 PDF Storage Agent
**Location:** `agents/pdf-agent/`

A powerful document management system for D&D campaigns with:
- Large file support (up to 200MB)
- Secure API key authentication
- Beautiful drag-and-drop web interface
- Metadata extraction and search
- Rate limiting and access controls

**Key Features:**
- Presigned URL uploads for large files
- Direct upload for smaller files (<95MB)
- Full CRUD operations (Create, Read, Update, Delete)
- Tag-based organization
- Text preview extraction

### 🎲 D&D Beyond Agent
**Location:** `agents/dndbeyond-agent/`

Character information fetching from D&D Beyond with:
- Character lookup by ID
- Formatted character data display
- D&D-themed web interface
- Rate limiting and error handling

**Key Features:**
- Unofficial D&D Beyond API integration
- Character stats and information retrieval
- Public character support
- Comprehensive error handling

## 🛠️ Development

Each agent is self-contained and can be developed/deployed independently:

1. **Navigate to the agent folder**
   ```bash
   cd agents/pdf-agent/        # or agents/dndbeyond-agent/
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment**
   - Copy the example configuration
   - Set up required secrets and bindings

4. **Deploy**
   ```bash
   npx wrangler deploy
   ```

## 🔧 A2A Protocol Compliance

All agents implement the A2A (Agent-to-Agent) protocol standard:
- Agent capability cards at `/.well-known/agent.json`
- Standardized API endpoints
- Consistent authentication patterns
- CORS support for cross-origin requests

## 📖 Documentation

Each agent has comprehensive documentation in its respective folder:
- **PDF Agent:** See `agents/pdf-agent/README.md`
- **D&D Beyond Agent:** See `agents/dndbeyond-agent/README.md`

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes in the appropriate agent folder under `agents/`
4. Test thoroughly
5. Submit a pull request

## 📄 License

This project is open source and available under the MIT License.

## 🎮 Built for the D&D Community

LoreSmith is built with ❤️ for Dungeon Masters and players who want to enhance their D&D experience with modern tools and automation.

---

**Get Started:** Open `index.html` in your browser to explore all available agents!