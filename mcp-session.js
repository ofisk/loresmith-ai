// MCP Session Durable Object
export class McpSession {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sessions = new Map();
    this.websockets = new Map();
  }

  async fetch(request) {
    const url = new URL(request.url);
    const { pathname } = url;

    // Handle WebSocket upgrades for MCP protocol
    if (request.headers.get("Upgrade") === "websocket") {
      return this.handleWebSocket(request);
    }

    // MCP session management endpoints
    if (pathname === "/session/initialize" && request.method === "POST") {
      return this.initializeSession(request);
    }

    if (pathname === "/session/state" && request.method === "GET") {
      return this.getSessionState(request);
    }

    if (pathname === "/session/state" && request.method === "POST") {
      return this.updateSessionState(request);
    }

    if (pathname === "/session/conversation" && request.method === "POST") {
      return this.updateConversation(request);
    }

    if (pathname === "/session/conversation" && request.method === "GET") {
      return this.getConversationHistory(request);
    }

    // Handle CORS
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization, Upgrade, Connection"
        }
      });
    }

    return new Response("MCP Session Durable Object", { status: 404 });
  }

  // Handle WebSocket connections for real-time MCP communication
  async handleWebSocket(request) {
    const url = new URL(request.url);
    const sessionId = url.searchParams.get('sessionId');
    
    if (!sessionId) {
      return new Response("Session ID required", { status: 400 });
    }

    const webSocketPair = new WebSocketPair();
    const [client, server] = Object.values(webSocketPair);

    // Accept the WebSocket connection
    server.accept();
    
    // Store the WebSocket connection
    this.websockets.set(sessionId, server);

    // Set up WebSocket message handlers
    server.addEventListener('message', async (event) => {
      try {
        const message = JSON.parse(event.data);
        const response = await this.handleMcpMessage(sessionId, message);
        server.send(JSON.stringify(response));
      } catch (error) {
        server.send(JSON.stringify({
          jsonrpc: "2.0",
          error: {
            code: -32603,
            message: "Internal error",
            data: error.message
          },
          id: message.id || null
        }));
      }
    });

    server.addEventListener('close', () => {
      this.websockets.delete(sessionId);
    });

    server.addEventListener('error', (error) => {
      console.error('WebSocket error:', error);
      this.websockets.delete(sessionId);
    });

    return new Response(null, {
      status: 101,
      webSocket: client
    });
  }

  // Handle MCP protocol messages over WebSocket
  async handleMcpMessage(sessionId, message) {
    const { method, params, id } = message;
    
    switch (method) {
      case "initialize":
        return await this.mcpInitialize(sessionId, params, id);
      
      case "tools/list":
        return await this.mcpListTools(sessionId, id);
      
      case "tools/call":
        return await this.mcpCallTool(sessionId, params, id);
      
      case "session/update":
        return await this.mcpUpdateSession(sessionId, params, id);
      
      case "conversation/add":
        return await this.mcpAddToConversation(sessionId, params, id);
      
      default:
        return {
          jsonrpc: "2.0",
          error: {
            code: -32601,
            message: "Method not found",
            data: `Method '${method}' not supported`
          },
          id: id || null
        };
    }
  }

  // Initialize MCP session
  async mcpInitialize(sessionId, params, id) {
    const session = {
      id: sessionId,
      created: new Date().toISOString(),
      capabilities: params?.capabilities || {},
      context: {},
      conversation: [],
      state: "active"
    };

    await this.state.storage.put(`session:${sessionId}`, session);
    this.sessions.set(sessionId, session);

    return {
      jsonrpc: "2.0",
      result: {
        sessionId: sessionId,
        capabilities: {
          experimental: {},
          logging: {},
          prompts: { listChanged: true },
          resources: { subscribe: true, listChanged: true },
          tools: { listChanged: true }
        },
        serverInfo: {
          name: "LoreSmith MCP Durable Object",
          version: "1.0.0"
        }
      },
      id: id
    };
  }

  // List available MCP tools
  async mcpListTools(sessionId, id) {
    return {
      jsonrpc: "2.0",
      result: {
        tools: [
          {
            name: "route_to_pdf_agent",
            description: "Route user to PDF storage and management agent",
            inputSchema: {
              type: "object",
              properties: {
                intent: { type: "string", description: "User's intent" },
                context: { type: "string", description: "Additional context" }
              },
              required: ["intent"]
            }
          },
          {
            name: "route_to_dnd_agent", 
            description: "Route user to D&D Beyond character lookup agent",
            inputSchema: {
              type: "object",
              properties: {
                intent: { type: "string", description: "User's intent" },
                context: { type: "string", description: "Additional context" }
              },
              required: ["intent"]
            }
          },
          {
            name: "analyze_user_intent",
            description: "Analyze user message for intelligent routing",
            inputSchema: {
              type: "object",
              properties: {
                message: { type: "string", description: "User's message" },
                context: { type: "string", description: "Previous context" }
              },
              required: ["message"]
            }
          },
          {
            name: "persist_conversation",
            description: "Store conversation context in durable storage",
            inputSchema: {
              type: "object",
              properties: {
                message: { type: "string", description: "Message to store" },
                role: { type: "string", enum: ["user", "assistant"], description: "Message role" },
                metadata: { type: "object", description: "Additional metadata" }
              },
              required: ["message", "role"]
            }
          }
        ]
      },
      id: id
    };
  }

  // Execute MCP tool
  async mcpCallTool(sessionId, params, id) {
    const { name, arguments: args } = params;
    
    // Get session context
    const session = await this.getSession(sessionId);
    
    switch (name) {
      case "analyze_user_intent":
        const analysis = await this.analyzeIntent(args.message, session?.context || {});
        return {
          jsonrpc: "2.0",
          result: {
            content: [{ type: "text", text: JSON.stringify(analysis, null, 2) }]
          },
          id: id
        };
      
      case "persist_conversation":
        await this.addToConversation(sessionId, args.message, args.role, args.metadata);
        return {
          jsonrpc: "2.0",
          result: {
            content: [{ type: "text", text: "Conversation updated successfully" }]
          },
          id: id
        };
      
      case "route_to_pdf_agent":
      case "route_to_dnd_agent":
        const agentType = name.includes('pdf') ? 'pdf-agent' : 'dnd-agent';
        const routingResult = await this.routeToAgent(sessionId, agentType, args.intent, args.context);
        return {
          jsonrpc: "2.0",
          result: {
            content: [{ type: "text", text: JSON.stringify(routingResult, null, 2) }]
          },
          id: id
        };
      
      default:
        return {
          jsonrpc: "2.0",
          error: {
            code: -32601,
            message: "Tool not found",
            data: `Tool '${name}' not implemented`
          },
          id: id
        };
    }
  }

  // Initialize session via HTTP
  async initializeSession(request) {
    try {
      const body = await request.json();
      const sessionId = crypto.randomUUID();
      
      const session = {
        id: sessionId,
        created: new Date().toISOString(),
        capabilities: body.capabilities || {},
        context: {},
        conversation: [],
        state: "active"
      };

      await this.state.storage.put(`session:${sessionId}`, session);
      this.sessions.set(sessionId, session);

      return new Response(JSON.stringify({
        sessionId: sessionId,
        created: session.created,
        websocketUrl: `/ws?sessionId=${sessionId}`,
        capabilities: {
          websocket: true,
          persistence: true,
          conversation: true
        }
      }), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      });
    } catch (error) {
      return new Response(JSON.stringify({
        error: "Failed to initialize session",
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

  // Get session state
  async getSessionState(request) {
    const url = new URL(request.url);
    const sessionId = url.searchParams.get('sessionId');
    
    if (!sessionId) {
      return new Response(JSON.stringify({ error: "Session ID required" }), { 
        status: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    }

    const session = await this.getSession(sessionId);
    if (!session) {
      return new Response(JSON.stringify({ error: "Session not found" }), { 
        status: 404,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    }

    return new Response(JSON.stringify(session), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });
  }

  // Update session state
  async updateSessionState(request) {
    try {
      const body = await request.json();
      const { sessionId, context, metadata } = body;
      
      if (!sessionId) {
        return new Response(JSON.stringify({ error: "Session ID required" }), { 
          status: 400,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
      }

      const session = await this.getSession(sessionId);
      if (!session) {
        return new Response(JSON.stringify({ error: "Session not found" }), { 
          status: 404,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
      }

      // Update session context
      if (context) {
        session.context = { ...session.context, ...context };
      }
      
      if (metadata) {
        session.metadata = { ...session.metadata, ...metadata };
      }

      session.lastUpdated = new Date().toISOString();

      await this.state.storage.put(`session:${sessionId}`, session);
      this.sessions.set(sessionId, session);

      return new Response(JSON.stringify({ success: true, session }), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      });
    } catch (error) {
      return new Response(JSON.stringify({
        error: "Failed to update session",
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

  // Helper methods
  async getSession(sessionId) {
    // Check memory cache first
    if (this.sessions.has(sessionId)) {
      return this.sessions.get(sessionId);
    }
    
    // Load from durable storage
    const session = await this.state.storage.get(`session:${sessionId}`);
    if (session) {
      this.sessions.set(sessionId, session);
    }
    
    return session;
  }

  async addToConversation(sessionId, message, role, metadata = {}) {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error("Session not found");
    }

    const conversationEntry = {
      id: crypto.randomUUID(),
      message: message,
      role: role,
      timestamp: new Date().toISOString(),
      metadata: metadata
    };

    session.conversation.push(conversationEntry);
    session.lastUpdated = new Date().toISOString();

    await this.state.storage.put(`session:${sessionId}`, session);
    this.sessions.set(sessionId, session);

    return conversationEntry;
  }

  async analyzeIntent(message, context) {
    const lowerMessage = message.toLowerCase();
    
    const intentCategories = {
      pdf_management: {
        keywords: ['pdf', 'book', 'manual', 'document', 'file', 'upload', 'store', 'storage'],
        score: 0
      },
      character_management: {
        keywords: ['character', 'player', 'stats', 'sheet', 'beyond', 'dndbeyond'],
        score: 0
      },
      general_help: {
        keywords: ['help', 'what', 'how', 'new', 'start', 'begin'],
        score: 0
      }
    };

    // Calculate scores
    for (const [category, data] of Object.entries(intentCategories)) {
      data.score = data.keywords.filter(keyword => lowerMessage.includes(keyword)).length;
    }

    const sortedCategories = Object.entries(intentCategories)
      .sort(([,a], [,b]) => b.score - a.score);
    
    const [primaryIntent, primaryData] = sortedCategories[0];

    return {
      message: message,
      analysis: {
        primary_intent: primaryIntent,
        score: primaryData.score,
        confidence: primaryData.score > 0 ? primaryData.score / primaryData.keywords.length : 0
      },
      context: context,
      timestamp: new Date().toISOString()
    };
  }

  async routeToAgent(sessionId, agentType, intent, context) {
    const session = await this.getSession(sessionId);
    
    const routingResult = {
      sessionId: sessionId,
      targetAgent: agentType,
      intent: intent,
      context: context,
      timestamp: new Date().toISOString(),
      recommendedUrl: agentType === 'pdf-agent' 
        ? '/agents/pdf-agent/' 
        : '/agents/dndbeyond-agent/'
    };

    // Update session with routing decision
    if (session) {
      session.context.lastRouting = routingResult;
      await this.state.storage.put(`session:${sessionId}`, session);
      this.sessions.set(sessionId, session);
    }

    return routingResult;
  }

  // Cleanup old sessions (called periodically)
  async cleanup() {
    const cutoff = Date.now() - (24 * 60 * 60 * 1000); // 24 hours ago
    const keys = await this.state.storage.list({ prefix: "session:" });
    
    for (const [key, session] of keys) {
      if (new Date(session.created).getTime() < cutoff) {
        await this.state.storage.delete(key);
        this.sessions.delete(session.id);
      }
    }
  }
} 