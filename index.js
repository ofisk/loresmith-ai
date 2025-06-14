import { CHAT_INTERFACE_HTML } from './chat-template.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;

    // A2A Protocol agent card endpoint
    if (pathname === "/.well-known/agent.json") {
      return new Response(JSON.stringify({
        "@type": "AgentCard",
        "name": "LoreSmith Assistant",
        "description": "Conversational assistant to help D&D players and DMs choose the right tools for campaign planning. Routes users to PDF management or campaign management agents based on their needs.",
        "version": "1.0.0",
        "capabilities": [
          "conversational-routing",
          "agent-discovery",
          "campaign-planning-guidance",
          "tool-recommendation"
        ],
        "api": {
          "url": request.url.replace(pathname, ""),
          "endpoints": [
            {
              "path": "/chat",
              "method": "POST",
              "description": "Chat with the assistant to get tool recommendations",
              "accepts": "application/json",
              "parameters": {
                "message": "User's message or question",
                "context": "Optional context about their D&D campaign needs"
              }
            },
            {
              "path": "/agents",
              "method": "GET",
              "description": "List available agents and their capabilities"
            }
          ]
        },
        "related_agents": [
          {
            "name": "PDF Storage Agent",
            "description": "Upload and manage D&D PDFs up to 200MB",
            "path": "/agents/pdf-agent/"
          },
          {
            "name": "D&D Beyond Agent", 
            "description": "Fetch character information from D&D Beyond",
            "path": "/agents/dndbeyond-agent/"
          }
        ]
      }), {
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      });
    }

    // Handle CORS preflight requests
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type"
        }
      });
    }

    // Chat endpoint for conversational routing
    if (pathname === "/chat" && request.method === "POST") {
      try {
        const { message, context } = await request.json();
        
        if (!message) {
          return new Response(JSON.stringify({
            error: "Message is required"
          }), { 
            status: 400,
            headers: { 
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*"
            }
          });
        }

        const response = await this.processUserMessage(message, context, request.url);
        
        return new Response(JSON.stringify(response), {
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        });

      } catch (error) {
        return new Response(JSON.stringify({
          error: "Failed to process message",
          details: error.message
        }), { 
          status: 500,
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        });
      }
    }

    // List available agents
    if (pathname === "/agents" && request.method === "GET") {
      const baseUrl = request.url.replace(pathname, "");
      
      return new Response(JSON.stringify({
        agents: [
          {
            name: "PDF Storage Agent",
            description: "Upload, store, and manage large PDF documents for your D&D campaigns. Supports files up to 200MB with secure authentication.",
            capabilities: ["pdf-upload", "pdf-storage", "pdf-retrieval", "metadata-extraction"],
            url: `${baseUrl}/agents/pdf-agent/`,
            use_cases: [
              "Store Player's Handbook, Monster Manual, and other core books",
              "Upload campaign modules and adventures",
              "Organize homebrew content and house rules",
              "Share PDFs securely with your gaming group"
            ]
          },
          {
            name: "D&D Beyond Agent",
            description: "Fetch character information directly from D&D Beyond using character IDs. Perfect for DMs managing player characters.",
            capabilities: ["character-lookup", "stats-retrieval", "campaign-integration"],
            url: `${baseUrl}/agents/dndbeyond-agent/`,
            use_cases: [
              "Quickly access player character stats during sessions",
              "Prepare encounters based on party composition",
              "Track character progression and abilities",
              "Integrate character data into campaign planning"
            ]
          }
        ]
      }), {
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      });
    }

    // Serve the main chat interface
    if (pathname === "/" || pathname === "/chat") {
      return new Response(this.getChatInterface(), {
        headers: {
          "Content-Type": "text/html",
          "Access-Control-Allow-Origin": "*"
        }
      });
    }

    // Default response with available endpoints
    return new Response(`🏰 LoreSmith Assistant

I'm here to help you choose the right tools for your D&D campaign planning!

Available endpoints:
- GET / - Interactive chat interface
- POST /chat - Send a message to get tool recommendations
- GET /agents - List all available agents
- GET /.well-known/agent.json - Agent capabilities

Try asking me things like:
- "I need to store my D&D books"
- "How can I manage player characters?"
- "What tools do you have for campaign planning?"
- "I'm a new DM, what should I use?"

Visit the chat interface at: ${request.url}`, {
      headers: { 
        "Content-Type": "text/plain",
        "Access-Control-Allow-Origin": "*"
      }
    });
  },

  // Process user messages and provide intelligent routing
  async processUserMessage(message, context, baseUrl) {
    const lowerMessage = message.toLowerCase();
    const baseUrlClean = baseUrl.replace(/\/chat.*$/, "");
    
    // Keywords for PDF management
    const pdfKeywords = [
      'pdf', 'book', 'manual', 'document', 'file', 'upload', 'store', 'storage',
      'handbook', 'monster manual', 'dmg', 'phb', 'module', 'adventure',
      'homebrew', 'rules', 'reference', 'download', 'organize'
    ];
    
    // Keywords for character/campaign management
    const campaignKeywords = [
      'character', 'player', 'stats', 'sheet', 'beyond', 'dndbeyond',
      'campaign', 'party', 'encounter', 'npc', 'dm', 'dungeon master',
      'session', 'tracking', 'management', 'planning'
    ];

    // Keywords for general help/introduction
    const helpKeywords = [
      'help', 'what', 'how', 'new', 'start', 'begin', 'options', 'available',
      'tools', 'features', 'can you', 'do you have'
    ];

    const pdfScore = pdfKeywords.filter(keyword => lowerMessage.includes(keyword)).length;
    const campaignScore = campaignKeywords.filter(keyword => lowerMessage.includes(keyword)).length;
    const helpScore = helpKeywords.filter(keyword => lowerMessage.includes(keyword)).length;

    // Determine the best response based on keyword matching
    if (pdfScore > campaignScore && pdfScore > 0) {
      return {
        message: "It sounds like you need help with PDF management! 📚",
        recommendation: "PDF Storage Agent",
        explanation: "Based on your message, I recommend the PDF Storage Agent. It's perfect for uploading, storing, and organizing your D&D books, modules, and homebrew content.",
        features: [
          "Upload PDFs up to 200MB (perfect for high-quality D&D books)",
          "Secure storage with API key authentication",
          "Beautiful drag-and-drop web interface",
          "Metadata extraction and tagging system",
          "Easy sharing and organization"
        ],
        action: {
          text: "Launch PDF Storage Agent",
          url: `${baseUrlClean}/agents/pdf-agent/`
        },
        alternative: {
          text: "Or explore the D&D Beyond Agent",
          url: `${baseUrlClean}/agents/dndbeyond-agent/`
        }
      };
    } 
    else if (campaignScore > pdfScore && campaignScore > 0) {
      return {
        message: "Looks like you're interested in character and campaign management! 🎲",
        recommendation: "D&D Beyond Agent",
        explanation: "Based on your message, I recommend the D&D Beyond Agent. It's great for DMs who want to access player character information and integrate it into their campaign planning.",
        features: [
          "Fetch character data directly from D&D Beyond",
          "Quick access to player stats and abilities",
          "Perfect for encounter planning and session prep",
          "Clean, D&D-themed interface",
          "Supports public character lookups"
        ],
        action: {
          text: "Launch D&D Beyond Agent",
          url: `${baseUrlClean}/agents/dndbeyond-agent/`
        },
        alternative: {
          text: "Or check out the PDF Storage Agent",
          url: `${baseUrlClean}/agents/pdf-agent/`
        }
      };
    }
    else {
      // General help or unclear intent
      return {
        message: "Welcome to LoreSmith! 🏰 I'm here to help you find the right tools for your D&D campaign.",
        recommendation: "Let me show you what's available",
        explanation: "LoreSmith offers specialized agents to enhance your D&D experience. Here's what each one does:",
        agents: [
          {
            name: "📚 PDF Storage Agent",
            description: "Perfect for storing and managing your D&D books, modules, and homebrew content",
            best_for: "DMs and players who want to organize their PDF collection",
            url: `${baseUrlClean}/agents/pdf-agent/`
          },
          {
            name: "🎲 D&D Beyond Agent", 
            description: "Fetch character information from D&D Beyond for campaign planning",
            best_for: "DMs who want quick access to player character data",
            url: `${baseUrlClean}/agents/dndbeyond-agent/`
          }
        ],
        suggestions: [
          "Try saying: 'I need to store my D&D books'",
          "Or ask: 'How can I manage player characters?'",
          "Or: 'I'm a new DM, what tools do you recommend?'"
        ]
      };
    }
  },

  // Load and serve the chat interface HTML from template
  getChatInterface() {
    return CHAT_INTERFACE_HTML;
  }
}; 