import { CHAT_INTERFACE_HTML } from './chat-template.js';
import { McpSession } from './mcp-session.js';

export { McpSession };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;

    // Handle WebSocket upgrades for MCP protocol - Route to Durable Object
    if (request.headers.get("Upgrade") === "websocket") {
      return this.handleWebSocketUpgrade(request, env);
    }

    // Route Durable Object session requests
    if (pathname.startsWith("/session/")) {
      return this.routeToSession(request, env);
    }

    // MCP Protocol endpoint - Server capabilities
    if (pathname === "/.well-known/mcp.json") {
      return this.handleMcpCapabilities(request);
    }

    // A2A Protocol agent card endpoint
    if (pathname === "/.well-known/agent.json") {
      return this.handleAgentCard(request);
    }

    // MCP Protocol endpoint - Initialize session (creates Durable Object)
    if (pathname === "/mcp/initialize" && request.method === "POST") {
      return this.handleMcpInitialize(request, env);
    }

    // MCP Protocol endpoint - List available tools
    if (pathname === "/mcp/tools" && request.method === "GET") {
      return this.handleMcpListTools(request);
    }

    // MCP Protocol endpoint - Execute tool
    if (pathname === "/mcp/tools/execute" && request.method === "POST") {
      return this.handleMcpExecuteTool(request, env);
    }

    // Handle CORS preflight requests
    if (request.method === "OPTIONS") {
      return this.handleCorsOptions();
    }

    // Enhanced chat endpoint for conversational routing
    if (pathname === "/chat" && request.method === "POST") {
      return this.handleChat(request, env);
    }

    // Conversation history endpoint
    if (pathname === "/chat/history" && request.method === "GET") {
      return this.handleChatHistory(request, env);
    }

    // List available agents
    if (pathname === "/agents" && request.method === "GET") {
      return this.handleListAgents(request);
    }

    // Route to PDF agent
    if (pathname.startsWith("/agents/pdf-agent")) {
      return this.routeToPdfAgent(request, env, pathname, url);
    }

    // Route to D&D Beyond agent
    if (pathname.startsWith("/agents/dndbeyond-agent")) {
      return this.routeToDndAgent(request, env, pathname, url);
    }

    // Serve the main chat interface
    if (pathname === "/" || pathname === "/chat") {
      return this.serveChatInterface();
    }

    // Default response with MCP capabilities
    return this.handleDefault(request);
  },

  // MCP Protocol - Server capabilities
  async handleMcpCapabilities(request) {
    return new Response(JSON.stringify({
      "jsonrpc": "2.0",
      "capabilities": {
        "experimental": {},
        "logging": {},
        "prompts": {
          "listChanged": true
        },
        "resources": {
          "subscribe": true,
          "listChanged": true
        },
        "tools": {
          "listChanged": true
        }
      },
      "serverInfo": {
        "name": "LoreSmith MCP Server",
        "version": "1.0.0",
        "description": "Model Context Protocol server for D&D campaign management and agent routing"
      },
      "protocolVersion": "2024-11-05"
    }), {
      headers: { 
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });
  },

  // A2A Protocol agent card
  async handleAgentCard(request) {
    return new Response(JSON.stringify({
      "@type": "AgentCard",
      "name": "LoreSmith MCP Router",
      "description": "Intelligent MCP layer that routes D&D players and DMs to specialized agents based on conversational analysis. Supports PDF management, character lookups, and campaign planning workflows.",
      "version": "1.0.0",
      "capabilities": [
        "mcp-protocol",
        "conversational-routing",
        "agent-discovery",
        "campaign-planning-guidance",
        "tool-recommendation",
        "intent-analysis",
        "context-awareness"
      ],
      "api": {
        "url": request.url.replace(new URL(request.url).pathname, ""),
        "protocols": ["mcp", "a2a"],
        "endpoints": [
          {
            "path": "/mcp/initialize",
            "method": "POST",
            "description": "Initialize MCP session",
            "protocol": "mcp"
          },
          {
            "path": "/mcp/tools",
            "method": "GET",
            "description": "List available MCP tools"
          },
          {
            "path": "/mcp/tools/execute",
            "method": "POST",
            "description": "Execute MCP tool"
          },
          {
            "path": "/chat",
            "method": "POST",
            "description": "Conversational agent routing",
            "accepts": "application/json",
            "parameters": {
              "message": "User's message or question",
              "context": "Optional conversation context",
              "sessionId": "Optional session identifier for context persistence"
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
          "path": "/agents/pdf-agent/",
          "capabilities": ["pdf-upload", "pdf-storage", "pdf-retrieval", "metadata-extraction"]
        },
        {
          "name": "D&D Beyond Agent", 
          "description": "Fetch character information from D&D Beyond",
          "path": "/agents/dndbeyond-agent/",
          "capabilities": ["character-lookup", "stats-retrieval", "campaign-integration"]
        }
      ]
    }), {
      headers: { 
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });
  },

  // Handle WebSocket upgrades - Route to Durable Object
  async handleWebSocketUpgrade(request, env) {
    const url = new URL(request.url);
    const sessionId = url.searchParams.get('sessionId') || crypto.randomUUID();
    
    // Get Durable Object instance
    const durableObjectId = env.MCP_SESSION.idFromName(sessionId);
    const durableObject = env.MCP_SESSION.get(durableObjectId);
    
    // Forward WebSocket upgrade to Durable Object
    return durableObject.fetch(request);
  },

  // Route session requests to Durable Object
  async routeToSession(request, env) {
    const url = new URL(request.url);
    const sessionId = url.searchParams.get('sessionId');
    
    if (!sessionId) {
      return new Response(JSON.stringify({
        error: "Session ID required",
        hint: "Add ?sessionId=your-session-id to the URL"
      }), {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      });
    }

    // Get Durable Object instance for this session
    const durableObjectId = env.MCP_SESSION.idFromName(sessionId);
    const durableObject = env.MCP_SESSION.get(durableObjectId);
    
    // Forward request to Durable Object
    return durableObject.fetch(request);
  },

  // MCP Protocol - Initialize session (creates Durable Object)
  async handleMcpInitialize(request, env) {
    try {
      const body = await request.json();
      const sessionId = crypto.randomUUID();
      
      // Get Durable Object instance for this session
      const durableObjectId = env.MCP_SESSION.idFromName(sessionId);
      const durableObject = env.MCP_SESSION.get(durableObjectId);
      
      // Initialize session in Durable Object
      const sessionRequest = new Request(request.url.replace(new URL(request.url).pathname, "/session/initialize"), {
        method: "POST",
        headers: request.headers,
        body: JSON.stringify({ ...body, sessionId })
      });
      
      const response = await durableObject.fetch(sessionRequest);
      const result = await response.json();

      return new Response(JSON.stringify({
        "jsonrpc": "2.0",
        "result": {
          "sessionId": sessionId,
          "websocketUrl": `/ws?sessionId=${sessionId}`,
          "capabilities": {
            "experimental": {},
            "logging": {},
            "prompts": { "listChanged": true },
            "resources": { "subscribe": true, "listChanged": true },
            "tools": { "listChanged": true },
            "websocket": true,
            "durableObjects": true
          },
          "serverInfo": {
            "name": "LoreSmith MCP Durable Object Server",
            "version": "1.0.0",
            "features": ["persistent-sessions", "websockets", "conversation-history"]
          },
          "session": result
        }
      }), {
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      });
    } catch (error) {
      return new Response(JSON.stringify({
        "jsonrpc": "2.0",
        "error": {
          "code": -32600,
          "message": "Invalid Request",
          "data": error.message
        }
      }), { 
        status: 400,
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      });
    }
  },

  // MCP Protocol - List tools
  async handleMcpListTools(request) {
    return new Response(JSON.stringify({
      "jsonrpc": "2.0",
      "result": {
        "tools": [
          {
            "name": "route_to_pdf_agent",
            "description": "Route user to PDF storage and management agent for uploading, organizing, and retrieving D&D documents",
            "inputSchema": {
              "type": "object",
              "properties": {
                "intent": {
                  "type": "string",
                  "description": "User's intent regarding PDF management"
                },
                "context": {
                  "type": "string", 
                  "description": "Additional context about their PDF needs"
                }
              },
              "required": ["intent"]
            }
          },
          {
            "name": "route_to_dnd_agent",
            "description": "Route user to D&D Beyond character lookup agent for accessing player character data",
            "inputSchema": {
              "type": "object",
              "properties": {
                "intent": {
                  "type": "string",
                  "description": "User's intent regarding character management"
                },
                "context": {
                  "type": "string",
                  "description": "Additional context about their character needs"
                }
              },
              "required": ["intent"]
            }
          },
          {
            "name": "analyze_user_intent",
            "description": "Analyze user message to determine the best agent or tool recommendation",
            "inputSchema": {
              "type": "object",
              "properties": {
                "message": {
                  "type": "string",
                  "description": "User's message to analyze"
                },
                "context": {
                  "type": "string",
                  "description": "Previous conversation context"
                }
              },
              "required": ["message"]
            }
          },
          {
            "name": "get_agent_capabilities",
            "description": "Get detailed information about available agents and their capabilities",
            "inputSchema": {
              "type": "object",
              "properties": {
                "agent": {
                  "type": "string",
                  "enum": ["pdf-agent", "dnd-agent", "all"],
                  "description": "Which agent's capabilities to retrieve"
                }
              }
            }
          }
        ]
      }
    }), {
      headers: { 
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });
  },

  // MCP Protocol - Execute tool
  async handleMcpExecuteTool(request, env) {
    try {
      const body = await request.json();
      const { name, arguments: args } = body.params;

      switch (name) {
        case "analyze_user_intent":
          const analysis = await this.analyzeUserIntent(args.message, args.context);
          return new Response(JSON.stringify({
            "jsonrpc": "2.0",
            "result": {
              "content": [
                {
                  "type": "text",
                  "text": JSON.stringify(analysis, null, 2)
                }
              ]
            }
          }), {
            headers: { 
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*"
            }
          });

        case "route_to_pdf_agent":
          return new Response(JSON.stringify({
            "jsonrpc": "2.0",
            "result": {
              "content": [
                {
                  "type": "text",
                  "text": `Routing to PDF Agent for: ${args.intent}\nURL: ${new URL(request.url).origin}/agents/pdf-agent/`
                }
              ]
            }
          }), {
            headers: { 
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*"
            }
          });

        case "route_to_dnd_agent":
          return new Response(JSON.stringify({
            "jsonrpc": "2.0",
            "result": {
              "content": [
                {
                  "type": "text",
                  "text": `Routing to D&D Beyond Agent for: ${args.intent}\nURL: ${new URL(request.url).origin}/agents/dndbeyond-agent/`
                }
              ]
            }
          }), {
            headers: { 
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*"
            }
          });

        case "get_agent_capabilities":
          const capabilities = await this.getAgentCapabilities(args.agent || "all");
          return new Response(JSON.stringify({
            "jsonrpc": "2.0",
            "result": {
              "content": [
                {
                  "type": "text",
                  "text": JSON.stringify(capabilities, null, 2)
                }
              ]
            }
          }), {
            headers: { 
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*"
            }
          });

        default:
          return new Response(JSON.stringify({
            "jsonrpc": "2.0",
            "error": {
              "code": -32601,
              "message": "Method not found",
              "data": `Tool '${name}' not found`
            }
          }), { 
            status: 404,
            headers: { 
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*"
            }
          });
      }
    } catch (error) {
      return new Response(JSON.stringify({
        "jsonrpc": "2.0",
        "error": {
          "code": -32603,
          "message": "Internal error",
          "data": error.message
        }
      }), { 
        status: 500,
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      });
    }
  },

  // Handle CORS preflight requests
  async handleCorsOptions() {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization"
      }
    });
  },

  // Enhanced chat endpoint with Durable Object session management
  async handleChat(request, env) {
    try {
      const { message, context, sessionId } = await request.json();
      
      if (!message) {
        return new Response(JSON.stringify({
          error: "Message is required",
          hint: "Send a message about your D&D needs and I'll help route you to the right agent!"
        }), { 
          status: 400,
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        });
      }

      let sessionContext = {};
      let currentSessionId = sessionId;

      // Create session if not provided
      if (!currentSessionId) {
        currentSessionId = crypto.randomUUID();
      }

      // Get session context from Durable Object if available
      if (currentSessionId) {
        try {
          const durableObjectId = env.MCP_SESSION.idFromName(currentSessionId);
          const durableObject = env.MCP_SESSION.get(durableObjectId);
          
          const sessionRequest = new Request(request.url.replace(new URL(request.url).pathname, `/session/state?sessionId=${currentSessionId}`), {
            method: "GET",
            headers: request.headers
          });
          
          const sessionResponse = await durableObject.fetch(sessionRequest);
          if (sessionResponse.ok) {
            const sessionData = await sessionResponse.json();
            sessionContext = sessionData.context || {};
          }
        } catch (error) {
          console.warn("Failed to get session context:", error);
        }
      }

      // Enhanced message processing with session context
      const response = await this.processUserMessage(message, { ...context, ...sessionContext }, request.url);
      
      // Update session context in Durable Object
      if (currentSessionId) {
        try {
          const durableObjectId = env.MCP_SESSION.idFromName(currentSessionId);
          const durableObject = env.MCP_SESSION.get(durableObjectId);
          
          // Add conversation entry
          const conversationRequest = new Request(request.url.replace(new URL(request.url).pathname, "/session/conversation"), {
            method: "POST",
            headers: { ...request.headers, "Content-Type": "application/json" },
            body: JSON.stringify({
              sessionId: currentSessionId,
              message: message,
              role: "user",
              metadata: { response: response }
            })
          });
          
          await durableObject.fetch(conversationRequest);
          
          // Update session context
          const contextRequest = new Request(request.url.replace(new URL(request.url).pathname, "/session/state"), {
            method: "POST",
            headers: { ...request.headers, "Content-Type": "application/json" },
            body: JSON.stringify({
              sessionId: currentSessionId,
              context: {
                ...sessionContext,
                lastMessage: message,
                lastResponse: response,
                timestamp: new Date().toISOString()
              }
            })
          });
          
          await durableObject.fetch(contextRequest);
        } catch (error) {
          console.warn("Failed to update session:", error);
        }
      }

      // Add session information to response
      response.sessionId = currentSessionId;
      response.mcpCompatible = true;
      response.durableObjectSession = true;
      response.websocketUrl = `/ws?sessionId=${currentSessionId}`;
      
      return new Response(JSON.stringify(response), {
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      });

    } catch (error) {
      return new Response(JSON.stringify({
        error: "Failed to process message",
        details: error.message,
        hint: "Try asking about PDF storage, character management, or general D&D tools"
      }), { 
        status: 500,
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      });
    }
  },

  // Chat history endpoint
  async handleChatHistory(request, env) {
    const url = new URL(request.url);
    const sessionId = url.searchParams.get('sessionId');
    
    if (!sessionId || !env.SESSIONS) {
      return new Response(JSON.stringify({
        error: "Session ID required or sessions not available"
      }), { 
        status: 400,
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      });
    }

    try {
      const sessionData = await env.SESSIONS.get(sessionId);
      if (!sessionData) {
        return new Response(JSON.stringify({
          error: "Session not found"
        }), { 
          status: 404,
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        });
      }

      const session = JSON.parse(sessionData);
      return new Response(JSON.stringify({
        sessionId: sessionId,
        context: session.context,
        created: session.created
      }), {
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      });
    } catch (error) {
      return new Response(JSON.stringify({
        error: "Failed to retrieve session",
        details: error.message
      }), { 
        status: 500,
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      });
    }
  },

  // List available agents
  async handleListAgents(request) {
    const baseUrl = request.url.replace(new URL(request.url).pathname, "");
    
    return new Response(JSON.stringify({
      agents: [
        {
          name: "PDF Storage Agent",
          description: "Upload, store, and manage large PDF documents for your D&D campaigns. Supports files up to 200MB with secure authentication.",
          capabilities: ["pdf-upload", "pdf-storage", "pdf-retrieval", "metadata-extraction", "large-file-support"],
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
          capabilities: ["character-lookup", "stats-retrieval", "campaign-integration", "public-character-access"],
          url: `${baseUrl}/agents/dndbeyond-agent/`,
          use_cases: [
            "Quickly access player character stats during sessions",
            "Prepare encounters based on party composition",
            "Track character progression and abilities",
            "Integrate character data into campaign planning"
          ]
        }
      ],
      total: 2,
      mcpCompatible: true
    }), {
      headers: { 
        "Content-Type": "application/json",
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
  },

  // Route to PDF agent
  async routeToPdfAgent(request, env, pathname, url) {
    const targetPath = pathname.replace("/agents/pdf-agent", "") || "/";
    const targetUrl = new URL(targetPath + url.search, url.origin);
    
    // Forward the request to the PDF agent via service binding
    const modifiedRequest = new Request(targetUrl, {
      method: request.method,
      headers: request.headers,
      body: request.body
    });
    
    // Use service binding if available, otherwise fallback to external URL
    if (env.PDF_AGENT) {
      return env.PDF_AGENT.fetch(modifiedRequest);
    } else {
      const pdfAgentUrl = env.PDF_AGENT_URL || "https://your-pdf-agent.workers.dev";
      const fallbackUrl = new URL(targetPath + url.search, pdfAgentUrl);
      const fallbackRequest = new Request(fallbackUrl, {
        method: request.method,
        headers: request.headers,
        body: request.body
      });
      return fetch(fallbackRequest);
    }
  },

  // Route to D&D Beyond agent
  async routeToDndAgent(request, env, pathname, url) {
    const targetPath = pathname.replace("/agents/dndbeyond-agent", "") || "/";
    const targetUrl = new URL(targetPath + url.search, url.origin);
    
    // Forward the request to the D&D Beyond agent via service binding
    const modifiedRequest = new Request(targetUrl, {
      method: request.method,
      headers: request.headers,
      body: request.body
    });
    
    // Use service binding if available, otherwise fallback to external URL
    if (env.DND_AGENT) {
      return env.DND_AGENT.fetch(modifiedRequest);
    } else {
      const dndAgentUrl = env.DNDBEYOND_AGENT_URL || "https://your-dndbeyond-agent.workers.dev";
      const fallbackUrl = new URL(targetPath + url.search, dndAgentUrl);
      const fallbackRequest = new Request(fallbackUrl, {
        method: request.method,
        headers: request.headers,
        body: request.body
      });
      return fetch(fallbackRequest);
    }
  },

  // Serve the main chat interface
  async serveChatInterface() {
    return new Response(this.getChatInterface(), {
      headers: {
        "Content-Type": "text/html",
        "Access-Control-Allow-Origin": "*"
      }
    });
  },

  // Default response with MCP and Durable Object capabilities
  async handleDefault(request) {
    const baseUrl = new URL(request.url).origin;
    
    return new Response(`🏰 LoreSmith MCP Durable Object Router

I'm your intelligent assistant for D&D campaign management! I use Cloudflare Durable Objects with the Model Context Protocol (MCP) for persistent, real-time conversations.

✨ Durable Object Features:
- Persistent conversation sessions
- Real-time WebSocket communication
- Strong consistency across requests
- Automatic geographic distribution

🎯 MCP Protocol Endpoints:
- GET /.well-known/mcp.json - MCP server capabilities
- POST /mcp/initialize - Initialize persistent MCP session
- WebSocket /ws?sessionId=X - Real-time MCP communication

🔄 Session Management:
- POST /session/initialize - Create new session
- GET /session/state?sessionId=X - Get session state
- POST /session/state - Update session context
- POST /session/conversation - Add to conversation history

💬 Chat & Routing:
- GET / - Interactive chat interface
- POST /chat - Conversational agent routing with persistence
- GET /agents - List all available agents

🎲 Available Agents:
- PDF Storage Agent: ${baseUrl}/agents/pdf-agent/
- D&D Beyond Agent: ${baseUrl}/agents/dndbeyond-agent/

Try asking me:
- "I need to store my D&D books"
- "How can I look up character stats?"
- "What tools do you have for campaign planning?"
- "I'm running a new campaign, help me get organized"

Features:
✅ Persistent conversations across sessions
✅ Real-time WebSocket communication
✅ Intelligent agent routing
✅ Context-aware responses
✅ Durable Object storage

Visit the chat interface: ${baseUrl}/`, {
      headers: { 
        "Content-Type": "text/plain",
        "Access-Control-Allow-Origin": "*"
      }
    });
  },

  // Enhanced intent analysis for MCP compatibility
  async analyzeUserIntent(message, context = {}) {
    const lowerMessage = message.toLowerCase();
    
    // Enhanced keyword categorization
    const intentCategories = {
      pdf_management: {
        keywords: [
          'pdf', 'book', 'manual', 'document', 'file', 'upload', 'store', 'storage',
          'handbook', 'monster manual', 'dmg', 'phb', 'module', 'adventure',
          'homebrew', 'rules', 'reference', 'download', 'organize', 'library'
        ],
        score: 0,
        confidence: 0
      },
      character_management: {
        keywords: [
          'character', 'player', 'stats', 'sheet', 'beyond', 'dndbeyond',
          'campaign', 'party', 'encounter', 'npc', 'dm', 'dungeon master',
          'session', 'tracking', 'management', 'planning', 'class', 'level'
        ],
        score: 0,
        confidence: 0
      },
      general_help: {
        keywords: [
          'help', 'what', 'how', 'new', 'start', 'begin', 'options', 'available',
          'tools', 'features', 'can you', 'do you have', 'getting started'
        ],
        score: 0,
        confidence: 0
      }
    };

    // Calculate scores for each category
    for (const [category, data] of Object.entries(intentCategories)) {
      const matches = data.keywords.filter(keyword => lowerMessage.includes(keyword));
      data.score = matches.length;
      data.confidence = matches.length / data.keywords.length;
      data.matchedKeywords = matches;
    }

    // Determine primary intent
    const sortedCategories = Object.entries(intentCategories)
      .sort(([,a], [,b]) => b.score - a.score);
    
    const [primaryIntent, primaryData] = sortedCategories[0];
    const [secondaryIntent, secondaryData] = sortedCategories[1] || [null, null];

    // Context-aware adjustments
    const contextualFactors = {
      hasSessionHistory: context.lastMessage !== undefined,
      previousIntent: context.lastResponse?.recommendation || null,
      conversationDepth: context.timestamp ? 1 : 0
    };

    return {
      message: message,
      analysis: {
        primary_intent: primaryIntent,
        confidence: primaryData.confidence,
        score: primaryData.score,
        matched_keywords: primaryData.matchedKeywords,
        secondary_intent: secondaryIntent,
        all_scores: Object.fromEntries(
          Object.entries(intentCategories).map(([k, v]) => [k, { score: v.score, confidence: v.confidence }])
        )
      },
      context: contextualFactors,
      recommendation: this.getRecommendationFromIntent(primaryIntent, primaryData, message),
      mcp_tools_suggested: this.getMcpToolsForIntent(primaryIntent)
    };
  },

  // Get recommendation based on analyzed intent
  getRecommendationFromIntent(intent, data, originalMessage) {
    switch (intent) {
      case 'pdf_management':
        return {
          agent: 'pdf-agent',
          reason: 'Message indicates need for PDF storage and management capabilities',
          confidence: data.confidence,
          suggested_action: 'route_to_pdf_agent'
        };
      case 'character_management':
        return {
          agent: 'dnd-agent', 
          reason: 'Message suggests need for character data and campaign management',
          confidence: data.confidence,
          suggested_action: 'route_to_dnd_agent'
        };
      case 'general_help':
      default:
        return {
          agent: 'mcp-router',
          reason: 'General inquiry requiring overview of available tools',
          confidence: data.confidence,
          suggested_action: 'provide_overview'
        };
    }
  },

  // Get MCP tools that match the user's intent
  getMcpToolsForIntent(intent) {
    const toolMap = {
      'pdf_management': ['route_to_pdf_agent', 'get_agent_capabilities'],
      'character_management': ['route_to_dnd_agent', 'get_agent_capabilities'],
      'general_help': ['analyze_user_intent', 'get_agent_capabilities']
    };
    
    return toolMap[intent] || ['analyze_user_intent'];
  },

  // Get agent capabilities for MCP tool
  async getAgentCapabilities(agent = "all") {
    const capabilities = {
      "pdf-agent": {
        name: "PDF Storage Agent",
        description: "Secure PDF storage and management for D&D campaigns",
        capabilities: [
          "pdf-upload", "pdf-storage", "pdf-retrieval",
          "metadata-extraction", "large-file-support", "authentication"
        ],
        endpoints: [
          "POST /upload/request - Request presigned upload URL",
          "POST /upload/complete - Complete presigned upload", 
          "POST /upload - Direct upload (legacy, <95MB)",
          "GET /pdfs - List stored PDFs",
          "GET /pdf/{id} - Download PDF",
          "GET /pdf/{id}/metadata - Get PDF metadata",
          "DELETE /pdf/{id} - Delete PDF (admin only)"
        ],
        file_limits: {
          max_size: "200MB",
          supported_types: ["application/pdf"]
        }
      },
      "dnd-agent": {
        name: "D&D Beyond Agent",
        description: "Character data retrieval from D&D Beyond",
        capabilities: [
          "character-lookup", "stats-retrieval", "campaign-integration",
          "public-character-access", "json-api"
        ],
        endpoints: [
          "GET /character/{id} - Get character data",
          "GET /character/{id}/stats - Get character stats only",
          "GET /.well-known/agent.json - Agent capabilities"
        ],
        requirements: {
          character_visibility: "public",
          api_limitations: "Read-only access to public character data"
        }
      }
    };

    if (agent === "all") {
      return {
        total_agents: 2,
        agents: capabilities
      };
    }

    return capabilities[agent] || { error: "Agent not found" };
  }
}; 