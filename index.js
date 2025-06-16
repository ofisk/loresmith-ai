// Chat interface will be embedded directly
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
      return this.handleListAgents(request, env);
    }

    // Generic agent UI retrieval based on user intent
    if (pathname === "/ui" && request.method === "GET") {
      const userPrompt = url.searchParams.get('prompt');
      const agentHint = url.searchParams.get('agent'); // Optional hint from client
      
      if (!userPrompt && !agentHint) {
        return new Response(JSON.stringify({ 
          error: "Either 'prompt' or 'agent' parameter is required",
          examples: [
            "/ui?prompt=I want to upload a PDF",
            "/ui?prompt=Look up D&D character",
            "/ui?agent=pdf"
          ]
        }), { 
          status: 400, 
          headers: { "Content-Type": "application/json" } 
        });
      }
      
      // Determine which agent to use based on user intent
      const targetAgent = await this.determineTargetAgent(userPrompt, agentHint, env);
      
      if (!targetAgent) {
        // Get available agents for better error message
        const availableAgents = await this.discoverAgents(env);
        const agentSuggestions = availableAgents.map(agent => 
          `${agent.name}: ${agent.capabilities.join(', ')}`
        );
        
        return new Response(JSON.stringify({ 
          error: "Could not determine appropriate agent for this request",
          suggestion: "Try being more specific about what you want to do",
          availableAgents: agentSuggestions,
          examples: [
            "/ui?prompt=I want to upload a PDF",
            "/ui?prompt=Look up D&D character",
            "/ui?agent=pdf"
          ]
        }), { 
          status: 400, 
          headers: { "Content-Type": "application/json" } 
        });
      }
      
      // Fetch UI from the determined agent
      return this.getAgentUI(request, env, targetAgent);
    }

    // Dynamic proxy requests to discovered agents
    if (pathname.startsWith("/proxy/")) {
      return this.proxyToAgent(request, env, pathname, url);
    }

    // Dynamic routing to discovered agents (legacy - for direct access)
    if (pathname.startsWith("/agents/")) {
      return this.routeToAgent(request, env, pathname, url);
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
      "related_agents": await this.getDiscoveredAgentsForCard(request, env)
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
        "tools": await this.generateDynamicMcpTools(env)
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

      return await this.executeDynamicMcpTool(name, args, request, env);
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
      const response = await this.processUserMessage(message, { ...context, ...sessionContext }, request.url, env);
      
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

  // List available agents dynamically discovered from agent cards
  async handleListAgents(request, env) {
    try {
      const discoveredAgents = await this.discoverAgents(env);
      const baseUrl = request.url.replace(new URL(request.url).pathname, "");
      
      const agentList = discoveredAgents.map(agent => ({
        id: agent.id,
        name: agent.name,
        description: agent.description,
        capabilities: agent.capabilities,
        url: `${baseUrl}/agents/${agent.id}/`,
        ui_endpoint: `/ui?agent=${agent.id}`,
        agent_card: agent.card // Include full agent card for detailed info
      }));

      return new Response(JSON.stringify({
        agents: agentList,
        total: agentList.length,
        mcpCompatible: true,
        routing_info: {
          description: "Send natural language requests to /ui for intelligent agent routing",
          ui_endpoint: "/ui?prompt=your_request_here",
          chat_endpoint: "/chat"
        },
        discovery_method: "agent_cards_mcp_compliant"
      }), {
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      });
    } catch (error) {
      return new Response(JSON.stringify({
        error: "Failed to discover agents",
        details: error.message,
        agents: [],
        total: 0,
        fallback_info: "Agent discovery failed - check service bindings"
      }), {
        status: 500,
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      });
    }
  },

  // Process user messages and provide intelligent routing
  async processUserMessage(message, context, baseUrl, env) {
    const lowerMessage = message.toLowerCase();
    const baseUrlClean = baseUrl.replace(/\/chat.*$/, "");
    
    // Discover available agents dynamically
    const availableAgents = await this.discoverAgents(env);
    
    if (availableAgents.length === 0) {
      return {
        response: "🏰 Welcome to LoreSmith MCP Router! I'm your intelligent assistant for campaign management.\n\nNo agents are currently available. Please check your service configuration.",
        routing_reason: "No agents available"
      };
    }

    // Dynamic intent analysis based on available agents
    const bestMatch = await this.matchMessageToAgent(message, availableAgents);
    
    if (bestMatch && bestMatch.confidence > 0.3) {
      return {
        response: `${bestMatch.agent.icon || '🤖'} Perfect! I can help you with ${bestMatch.agent.name}. Loading the agent interface where you can access ${bestMatch.agent.capabilities.join(', ')}.`,
        agent_name: bestMatch.agent.name,
        action: "load_agent_ui",
        agent_type: bestMatch.agent.id,
        routing_reason: `Detected ${bestMatch.agent.name} intent (confidence: ${Math.round(bestMatch.confidence * 100)}%)`,
        capabilities: bestMatch.agent.capabilities
      };
    } else {
      // General help - show available agents dynamically
      const agentsList = availableAgents.map(agent => 
        `${agent.icon || '🤖'} <strong>${agent.name}</strong> - ${agent.description}`
      ).join('\n');
      
      const examples = availableAgents.slice(0, 3).map(agent => 
        `• "I need ${agent.capabilities[0] || 'help'}"`
      ).join('\n');

      return {
        response: `🏰 Welcome to LoreSmith MCP Router! I'm your intelligent assistant for campaign management.

<strong>Available Agents:</strong>

${agentsList}

<strong>How to use me:</strong>
Just describe what you need and I'll connect you to the right agent!

<strong>Try these examples:</strong>
${examples}

What can I help you with today?`,
        routing_reason: "General help request - showing dynamically discovered agents"
      };
    }
  },

  // Load and serve the chat interface HTML - simple routing interface
  getChatInterface() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>LoreSmith MCP Router - D&D Campaign Management</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            color: #333;
        }
        
        .header {
            background: rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(10px);
            padding: 2rem;
            text-align: center;
            color: white;
            border-bottom: 1px solid rgba(255, 255, 255, 0.2);
        }
        
        .header h1 {
            font-size: 2.5rem;
            margin-bottom: 0.5rem;
        }
        
        .header p {
            opacity: 0.9;
            font-size: 1.2rem;
        }
        
        .container {
            flex: 1;
            max-width: 1000px;
            margin: 0 auto;
            padding: 2rem;
            width: 100%;
        }
        
        .chat-section {
            background: white;
            border-radius: 15px;
            padding: 2rem;
            margin-bottom: 2rem;
            box-shadow: 0 10px 30px rgba(0,0,0,0.2);
        }
        
        .messages {
            min-height: 300px;
            max-height: 500px;
            overflow-y: auto;
            margin-bottom: 2rem;
            padding: 1rem;
            border: 1px solid #dee2e6;
            border-radius: 10px;
            background: #f8f9fa;
        }
        
        .message {
            margin-bottom: 1rem;
            padding: 1rem;
            border-radius: 8px;
        }
        
        .message.user {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            margin-left: 20%;
        }
        
        .message.assistant {
            background: white;
            border: 1px solid #dee2e6;
            margin-right: 20%;
        }
        
        .input-area {
            display: flex;
            gap: 1rem;
        }
        
        .input-area input {
            flex: 1;
            padding: 1rem;
            border: 2px solid #dee2e6;
            border-radius: 8px;
            font-size: 1rem;
            outline: none;
        }
        
        .input-area input:focus {
            border-color: #667eea;
        }
        
        .input-area button {
            padding: 1rem 2rem;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            border-radius: 8px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
        }
        
        .input-area button:hover {
            transform: translateY(-2px);
            box-shadow: 0 5px 15px rgba(0,0,0,0.2);
        }
        
        .agents-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 2rem;
            margin-bottom: 2rem;
        }
        
        .agent-card {
            background: white;
            border-radius: 15px;
            padding: 2rem;
            box-shadow: 0 10px 30px rgba(0,0,0,0.2);
            transition: transform 0.3s ease;
        }
        
        .agent-card:hover {
            transform: translateY(-5px);
        }
        
        .agent-card h3 {
            color: #495057;
            margin-bottom: 1rem;
            font-size: 1.5rem;
        }
        
        .agent-card p {
            color: #666;
            margin-bottom: 1.5rem;
            line-height: 1.6;
        }
        
        .agent-card .btn {
            display: inline-block;
            padding: 0.75rem 1.5rem;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            text-decoration: none;
            border-radius: 8px;
            font-weight: 600;
            transition: all 0.3s ease;
            border: none;
            cursor: pointer;
            margin-right: 1rem;
        }
        
        .agent-card .btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 5px 15px rgba(0,0,0,0.2);
        }
        
        .suggestions {
            background: rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(10px);
            padding: 1.5rem;
            border-radius: 10px;
            margin-bottom: 2rem;
        }
        
        .suggestions h4 {
            color: white;
            margin-bottom: 1rem;
        }
        
        .suggestion-buttons {
            display: flex;
            gap: 1rem;
            flex-wrap: wrap;
        }
        
        .suggestion-btn {
            background: rgba(255, 255, 255, 0.2);
            color: white;
            border: 1px solid rgba(255, 255, 255, 0.3);
            padding: 0.75rem 1.5rem;
            border-radius: 25px;
            cursor: pointer;
            font-size: 0.9rem;
            transition: all 0.3s ease;
        }
        
        .suggestion-btn:hover {
            background: rgba(255, 255, 255, 0.3);
        }
        
        .agent-ui-container {
            background: white;
            border-radius: 15px;
            margin: 2rem 0;
            box-shadow: 0 10px 30px rgba(0,0,0,0.2);
            overflow: hidden;
        }
        
        .agent-ui-header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 1.5rem;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        
        .agent-ui-header h3 {
            margin: 0;
            font-size: 1.5rem;
        }
        
        .close-agent-ui {
            background: rgba(255, 255, 255, 0.2);
            border: none;
            color: white;
            font-size: 1.5rem;
            width: 2rem;
            height: 2rem;
            border-radius: 50%;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        
        .close-agent-ui:hover {
            background: rgba(255, 255, 255, 0.3);
        }
        
        .agent-ui-content {
            padding: 2rem;
        }
        
        .agent-ui-chunk .prompt {
            background: #f8f9fa;
            padding: 1.5rem;
            border-radius: 10px;
            margin-bottom: 1.5rem;
            border-left: 4px solid #667eea;
        }
        
        .agent-ui-chunk .prompt h3 {
            color: #2c3e50;
            margin-bottom: 1rem;
        }
        
        .agent-ui-chunk .prompt p {
            color: #495057;
            line-height: 1.6;
            margin: 0;
        }
        
        .agent-ui-chunk .input-group {
            margin-bottom: 1.5rem;
        }
        
        .agent-ui-chunk .input-group label {
            display: block;
            margin-bottom: 0.5rem;
            font-weight: 600;
            color: #2c3e50;
        }
        
        .agent-ui-chunk .input-group input,
        .agent-ui-chunk .input-group textarea {
            width: 100%;
            padding: 0.75rem;
            border: 2px solid #dee2e6;
            border-radius: 8px;
            font-size: 1rem;
        }
        
        .agent-ui-chunk .input-group input:focus,
        .agent-ui-chunk .input-group textarea:focus {
            outline: none;
            border-color: #667eea;
        }
        
        .agent-ui-chunk .file-preview {
            background: #e8f4f8;
            padding: 1.5rem;
            border-radius: 10px;
            margin: 1.5rem 0;
            border: 2px solid #17a2b8;
        }
        
        .agent-ui-chunk .file-details {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 1rem;
        }
        
        .agent-ui-chunk .file-detail {
            background: white;
            padding: 1rem;
            border-radius: 6px;
        }
        
        .agent-ui-chunk .pdfs-list {
            margin: 1.5rem 0;
        }
        
        .agent-ui-chunk .pdf-item {
            background: #f8f9fa;
            padding: 1.5rem;
            border-radius: 10px;
            margin-bottom: 1rem;
            border: 1px solid #dee2e6;
        }
        
        .agent-ui-chunk .pdf-item h4 {
            color: #2c3e50;
            margin-bottom: 0.5rem;
        }
        
        .agent-ui-chunk .pdf-meta {
            color: #6c757d;
            font-size: 0.9rem;
            margin-bottom: 1rem;
        }
        
        .agent-ui-chunk .pdf-actions {
            display: flex;
            gap: 0.5rem;
            flex-wrap: wrap;
        }
        
        .agent-ui-chunk .pdf-actions button {
            padding: 0.5rem 1rem;
            font-size: 0.9rem;
            border-radius: 6px;
        }
        
        .agent-ui-chunk .character-result {
            background: #f8f9fa;
            padding: 1.5rem;
            border-radius: 10px;
            margin-top: 1.5rem;
            border: 1px solid #dee2e6;
        }
        
        .agent-ui-chunk .character-display h4 {
            color: #2c3e50;
            margin-bottom: 1rem;
        }
        
        .agent-ui-chunk .character-display p {
            margin-bottom: 0.5rem;
            color: #495057;
        }
        
        .agent-ui-chunk .status {
            padding: 1rem;
            border-radius: 8px;
            margin: 1rem 0;
            text-align: center;
            display: none;
        }
        
        .agent-ui-chunk .status.success {
            background: #d5f4e6;
            color: #27ae60;
            border: 2px solid #27ae60;
        }
        
        .agent-ui-chunk .status.error {
            background: #f8d7da;
            color: #721c24;
            border: 2px solid #f5c6cb;
        }
        
        .agent-ui-chunk .status.info {
            background: #cce7ff;
            color: #0066cc;
            border: 2px solid #0066cc;
        }
        
        .agent-ui-chunk .progress-bar {
            width: 100%;
            height: 20px;
            background: #e9ecef;
            border-radius: 10px;
            overflow: hidden;
            margin: 1rem 0;
        }
        
        .agent-ui-chunk .progress-fill {
            height: 100%;
            background: linear-gradient(90deg, #27ae60, #2ecc71);
            width: 0%;
            transition: width 0.3s;
        }
        
        @media (max-width: 768px) {
            .container {
                padding: 1rem;
            }
            
            .input-area {
                flex-direction: column;
            }
            
            .agents-grid {
                grid-template-columns: 1fr;
            }
            
            .agent-ui-content {
                padding: 1rem;
            }
            
            .agent-ui-chunk .file-details {
                grid-template-columns: 1fr;
            }
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>🏰 LoreSmith MCP Router</h1>
        <p>Intelligent routing to your D&D campaign management tools</p>
    </div>
    
    <div class="container">
        <div class="suggestions">
            <h4>Try asking me:</h4>
            <div class="suggestion-buttons" id="suggestionButtons">
                <button class="suggestion-btn" onclick="sendSuggestion('What agents are available?')">Show agents</button>
                <button class="suggestion-btn" onclick="sendSuggestion('Help me get started')">Get started</button>
                <button class="suggestion-btn" onclick="sendSuggestion('What can you help me with?')">Show capabilities</button>
            </div>
        </div>
        
        <div class="chat-section">
            <div class="messages" id="messages">
                <div class="message assistant">
                    <h3>👋 Welcome to LoreSmith MCP Router!</h3>
                    <p>I'm your intelligent routing assistant. Tell me what you need, and I'll connect you to the right agent or handle your request directly.</p>
                    <p><strong>Just describe what you want to do!</strong></p>
                </div>
            </div>
            
            <div class="input-area">
                <input type="text" id="messageInput" placeholder="Tell me what you need help with..." onkeypress="handleKeyPress(event)">
                <button onclick="sendMessage()" id="sendButton">Send</button>
            </div>
        </div>
        
                    <div class="agents-grid" id="agentsGrid">
              <div class="loading-agents">
                <p>🔍 Discovering available agents...</p>
              </div>
            </div>
    </div>

    <script>
        async function sendMessage() {
            const input = document.getElementById('messageInput');
            const message = input.value.trim();
            
            if (!message) return;
            
            // Add user message to chat
            addMessage(message, 'user');
            
            // Clear input and disable button
            input.value = '';
            const sendButton = document.getElementById('sendButton');
            sendButton.disabled = true;
            sendButton.textContent = 'Thinking...';
            
            try {
                const response = await fetch('/chat', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ message })
                });
                
                const data = await response.json();
                
                if (data.error) {
                    addMessage('Sorry, I encountered an error: ' + data.error, 'assistant');
                } else {
                    // Handle different response types
                    if (data.action === 'load_agent_ui') {
                        addMessage(data.response || 'Loading agent interface...', 'assistant');
                        setTimeout(() => {
                            // Use the original user message as the prompt for agent determination
                            loadAgentUI(message);
                        }, 500);
                    } else if (data.redirect_url) {
                        addMessage(\`I'm redirecting you to: \${data.agent_name}\`, 'assistant');
                        setTimeout(() => {
                            window.open(data.redirect_url, '_blank');
                        }, 1000);
                    } else {
                        addMessage(data.response || data.message || 'Request processed', 'assistant');
                    }
                }
                
            } catch (error) {
                addMessage('Sorry, I had trouble processing your request. Please try again.', 'assistant');
            }
            
            // Re-enable button
            sendButton.disabled = false;
            sendButton.textContent = 'Send';
            input.focus();
        }
        
        function sendSuggestion(text) {
            document.getElementById('messageInput').value = text;
            sendMessage();
        }
        
        function handleKeyPress(event) {
            if (event.key === 'Enter') {
                sendMessage();
            }
        }
        
        function addMessage(text, sender) {
            const messages = document.getElementById('messages');
            const messageDiv = document.createElement('div');
            messageDiv.className = \`message \${sender}\`;
            
            if (sender === 'assistant') {
                messageDiv.innerHTML = text;
            } else {
                messageDiv.textContent = text;
            }
            
            messages.appendChild(messageDiv);
            messages.scrollTop = messages.scrollHeight;
        }
        
        // Focus input on load
        document.getElementById('messageInput').focus();
        
        // Load available agents dynamically
        loadAvailableAgents();
        
        // Load dynamic suggestions
        loadDynamicSuggestions();
        
        // Load and display available agents from discovery
        async function loadAvailableAgents() {
            try {
                const response = await fetch('/agents');
                const data = await response.json();
                
                const agentsGrid = document.getElementById('agentsGrid');
                
                if (data.agents && data.agents.length > 0) {
                    let html = '';
                    
                    data.agents.forEach(agent => {
                        // Create natural language prompts based on agent capabilities
                        const primaryCapability = agent.capabilities[0] || 'general tasks';
                        const prompt = generatePromptFromCapabilities(agent.capabilities, agent.name);
                        
                        html += \`
                            <div class="agent-card">
                                <h3>\${agent.name}</h3>
                                <p>\${agent.description}</p>
                                <div class="capabilities">
                                    <strong>Capabilities:</strong> \${agent.capabilities.join(', ')}
                                </div>
                                <button class="btn" onclick="loadAgentUI('\${prompt}')">\${getAgentIcon(agent.capabilities)} Use \${agent.name}</button>
                                <button class="btn" onclick="sendSuggestion('Tell me about \${agent.name.toLowerCase()}')">\${getAgentIcon(agent.capabilities)} Ask About This Agent</button>
                            </div>
                        \`;
                    });
                    
                    agentsGrid.innerHTML = html;
                } else {
                    agentsGrid.innerHTML = '<div class="no-agents"><p>⚠️ No agents available. Check service configuration.</p></div>';
                }
            } catch (error) {
                const agentsGrid = document.getElementById('agentsGrid');
                agentsGrid.innerHTML = '<div class="error-agents"><p>❌ Failed to load agents: ' + error.message + '</p></div>';
            }
        }
        
        // Generate natural language prompt from agent capabilities
        function generatePromptFromCapabilities(capabilities, agentName) {
            // Map capabilities to natural language prompts
            const capabilityPrompts = {
                'pdf-upload': 'I want to upload and manage PDFs',
                'pdf-storage': 'I need to store PDF documents',
                'character-lookup': 'I want to lookup D&D Beyond characters',
                'character-sheet': 'I need character information',
                'campaign-management': 'I want to manage my campaign',
                'stats-retrieval': 'I need character stats'
            };
            
            // Find the best matching prompt
            for (const capability of capabilities) {
                const normalizedCap = capability.toLowerCase().replace(/[-_\s]+/g, '-');
                if (capabilityPrompts[normalizedCap]) {
                    return capabilityPrompts[normalizedCap];
                }
            }
            
            // Fallback: use agent name and first capability
            const firstCap = capabilities[0] || 'help';
            return \`I want to use \${agentName} for \${firstCap}\`;
        }
        
        // Get appropriate icon for agent based on capabilities
        function getAgentIcon(capabilities) {
            const capString = capabilities.join(' ').toLowerCase();
            
            if (capString.includes('pdf') || capString.includes('document') || capString.includes('file')) {
                return '📚';
            } else if (capString.includes('character') || capString.includes('dnd') || capString.includes('beyond')) {
                return '🐉';
            } else if (capString.includes('campaign') || capString.includes('session')) {
                return '🎲';
            } else {
                return '🔧';
            }
        }
        
        // Generic agent UI management based on user intent
        async function loadAgentUI(promptOrAgent, step = '1') {
            try {
                let url = \`/ui?prompt=\${encodeURIComponent(promptOrAgent)}&step=\${step}\`;
                
                const response = await fetch(url);
                
                // Check if response is HTML or JSON
                const contentType = response.headers.get('content-type');
                
                if (contentType && contentType.includes('text/html')) {
                    // Handle HTML response - insert directly into page
                    const htmlContent = await response.text();
                    showAgentHTMLUI(htmlContent);
                } else {
                    // Handle JSON response (legacy format)
                    const data = await response.json();
                    
                    if (data.success) {
                        showAgentUI(data.title, data.html, data.scripts);
                    } else {
                        addMessage('Failed to load agent interface: ' + (data.error || 'Unknown error'), 'assistant');
                        if (data.examples) {
                            addMessage('Try one of these examples: ' + data.examples.join(', '), 'assistant');
                        }
                    }
                }
            } catch (error) {
                addMessage('Error loading agent interface: ' + error.message, 'assistant');
            }
        }
        
        // Load agent UI based on natural language prompt
        async function loadAgentUIFromPrompt(prompt) {
            return loadAgentUI(prompt);
        }
        
        function showAgentHTMLUI(htmlContent) {
            // Create agent UI container for complete HTML
            const agentContainer = document.createElement('div');
            agentContainer.className = 'agent-ui-container';
            agentContainer.innerHTML = \`
                <div class="agent-ui-header">
                    <h3>Agent Interface</h3>
                    <button class="close-agent-ui" onclick="closeAgentUI()">×</button>
                </div>
                <div class="agent-ui-content">
                    \${htmlContent}
                </div>
            \`;
            
            // Add to page
            const container = document.querySelector('.container');
            container.appendChild(agentContainer);
            
            // Execute any script tags in the HTML content
            const scripts = agentContainer.querySelectorAll('script');
            scripts.forEach(script => {
                try {
                    const newScript = document.createElement('script');
                    
                    // Mark as agent script for cleanup first
                    newScript.setAttribute('data-agent-script', 'true');
                    
                    if (script.src) {
                        // External script
                        newScript.src = script.src;
                        newScript.type = 'text/javascript';
                    } else {
                        // Inline script - be careful with content
                        const scriptContent = script.textContent || script.innerHTML;
                        if (scriptContent && scriptContent.trim()) {
                            newScript.type = 'text/javascript';
                            newScript.textContent = scriptContent;
                        } else {
                            // Skip empty scripts
                            return;
                        }
                    }
                    
                    // Copy other attributes (except src which we handled above)
                    Array.from(script.attributes).forEach(attr => {
                        if (attr.name !== 'src' && attr.name !== 'type') {
                            newScript.setAttribute(attr.name, attr.value);
                        }
                    });
                    
                    // Remove old script first
                    script.remove();
                    
                    // Add new script to head to trigger execution
                    document.head.appendChild(newScript);
                } catch (error) {
                    console.warn('Failed to execute agent script:', error);
                }
            });
            
            // Scroll to agent UI
            agentContainer.scrollIntoView({ behavior: 'smooth' });
        }

        function showAgentUI(title, html, scripts) {
            // Create agent UI container
            const agentContainer = document.createElement('div');
            agentContainer.className = 'agent-ui-container';
            agentContainer.innerHTML = \`
                <div class="agent-ui-header">
                    <h3>\${title}</h3>
                    <button class="close-agent-ui" onclick="closeAgentUI()">×</button>
                </div>
                <div class="agent-ui-content">
                    \${html}
                </div>
            \`;
            
            // Add to page
            const container = document.querySelector('.container');
            container.appendChild(agentContainer);
            
            // Execute agent scripts
            if (scripts) {
                const scriptElement = document.createElement('script');
                scriptElement.textContent = scripts;
                document.head.appendChild(scriptElement);
            }
            
            // Scroll to agent UI
            agentContainer.scrollIntoView({ behavior: 'smooth' });
        }
        
        function closeAgentUI() {
            // Remove any scripts that were added for this agent
            const scripts = document.head.querySelectorAll('script[data-agent-script]');
            scripts.forEach(script => script.remove());
            
            // Clear any global functions that might conflict
            const agentFunctions = [
                'validatePdfApiKey', 'uploadPdf', 'deletePdf', 'downloadPdf',
                'lookupCharacter', 'fetchCharacterStats', 'displayCharacter'
            ];
            
            agentFunctions.forEach(funcName => {
                if (window[funcName]) {
                    delete window[funcName];
                }
            });
        }
        
        // Load dynamic suggestions based on available agents
        async function loadDynamicSuggestions() {
            try {
                const response = await fetch('/agents');
                const data = await response.json();
                
                const suggestionButtons = document.getElementById('suggestionButtons');
                
                if (data.agents && data.agents.length > 0) {
                    // Keep the generic buttons
                    const genericButtons = \`
                        <button class="suggestion-btn" onclick="sendSuggestion('What agents are available?')">Show agents</button>
                        <button class="suggestion-btn" onclick="sendSuggestion('Help me get started')">Get started</button>
                    \`;
                    
                    // Add agent-specific suggestions
                    let agentButtons = '';
                    data.agents.slice(0, 3).forEach(agent => {
                        const primaryCap = agent.capabilities[0] || 'help';
                        const suggestion = \`I need help with \${primaryCap}\`;
                        agentButtons += \`<button class="suggestion-btn" onclick="sendSuggestion('\${suggestion}')">\${getAgentIcon(agent.capabilities)} \${agent.name}</button>\`;
                    });
                    
                    suggestionButtons.innerHTML = genericButtons + agentButtons;
                }
            } catch (error) {
                console.warn('Failed to load dynamic suggestions:', error);
            }
        }
        
        function showAgentStatus(message, type) {
            const statusDiv = document.getElementById('pdfStatus') || document.getElementById('dndStatus');
            if (statusDiv) {
                statusDiv.textContent = message;
                statusDiv.className = 'status ' + type;
                statusDiv.style.display = 'block';
            } else {
                // Fallback to chat message
                addMessage(message, 'assistant');
            }
        }
        
        function hideAgentStatus() {
            const statusDiv = document.getElementById('pdfStatus') || document.getElementById('dndStatus');
            if (statusDiv) {
                statusDiv.style.display = 'none';
            }
        }
    </script>
</body>
</html>`;
  },

  // Dynamic route to any discovered agent
  async routeToAgent(request, env, pathname, url) {
    const pathParts = pathname.split('/');
    const agentId = pathParts[2]; // /agents/{agentId}/...
    
    if (!agentId) {
      return new Response('Agent ID required in path', { status: 400 });
    }
    
    const availableAgents = await this.discoverAgents(env);
    const targetAgent = availableAgents.find(agent => agent.id === agentId);
    
    if (!targetAgent) {
      return new Response(`Agent '${agentId}' not found`, { status: 404 });
    }
    
    const targetPath = pathname.replace(`/agents/${agentId}`, "") || "/";
    const targetUrl = new URL(targetPath + url.search, url.origin);
    
    // Forward the request to the agent via service binding
    const modifiedRequest = new Request(targetUrl, {
      method: request.method,
      headers: request.headers,
      body: request.body
    });
    
    return targetAgent.binding.fetch(modifiedRequest);
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
${await this.getAgentListForDisplay(env, baseUrl)}

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

  // Get agent capabilities dynamically from discovered agents
  async getAgentCapabilities(agent = "all", env) {
    const discoveredAgents = await this.discoverAgents(env);
    
    if (agent === "all") {
      const capabilities = {};
      for (const discoveredAgent of discoveredAgents) {
        capabilities[discoveredAgent.id] = {
          name: discoveredAgent.name,
          description: discoveredAgent.description,
          capabilities: discoveredAgent.capabilities,
          card: discoveredAgent.card
        };
      }
      
      return {
        total_agents: discoveredAgents.length,
        agents: capabilities
      };
    }

    const foundAgent = discoveredAgents.find(a => a.id === agent);
    if (foundAgent) {
      return {
        name: foundAgent.name,
        description: foundAgent.description,
        capabilities: foundAgent.capabilities,
        card: foundAgent.card
      };
    }

    return { error: "Agent not found" };
  },

  // Dynamic proxy requests to any discovered agent  
  async proxyToAgent(request, env, pathname, url) {
    const pathParts = pathname.split('/');
    const agentId = pathParts[2]; // /proxy/{agentId}/...
    
    if (!agentId) {
      return new Response('Agent ID required in proxy path', { status: 400 });
    }
    
    const availableAgents = await this.discoverAgents(env);
    const targetAgent = availableAgents.find(agent => agent.id === agentId);
    
    if (!targetAgent) {
      return new Response(`Agent '${agentId}' not found for proxy`, { status: 404 });
    }
    
    const targetPath = pathname.replace(`/proxy/${agentId}`, "") || "/";
    const targetUrl = new URL(targetPath + url.search, url.origin);
    
    // Forward the request to the agent via service binding
    const modifiedRequest = new Request(targetUrl, {
      method: request.method,
      headers: request.headers,
      body: request.body
    });
    
    const response = await targetAgent.binding.fetch(modifiedRequest);
    // Add CORS headers for proxy responses
    const newResponse = new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: {
        ...Object.fromEntries(response.headers),
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      }
    });
    return newResponse;
  },



  // Discover and cache available agents from their agent cards
  async discoverAgents(env) {
    const agents = [];
    
    // Get list of available agent service bindings from environment
    const agentBindings = this.getAgentBindings(env);
    
    for (const [agentId, binding] of agentBindings) {
      try {
        // Fetch agent card from each agent
        const agentCardRequest = new Request('http://internal/.well-known/agent.json', {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' }
        });
        
        const response = await binding.fetch(agentCardRequest);
        if (response.ok) {
          const agentCard = await response.json();
          agents.push({
            id: agentId,
            binding: binding,
            card: agentCard,
            capabilities: agentCard.capabilities || [],
            description: agentCard.description || '',
            name: agentCard.name || agentId
          });
        }
      } catch (error) {
        console.warn(`Failed to fetch agent card for ${agentId}:`, error);
      }
    }
    
    return agents;
  },

  // Get agent service bindings from environment dynamically
  getAgentBindings(env) {
    const bindings = new Map();
    
    // Dynamically discover agent bindings by checking environment variables
    for (const [key, value] of Object.entries(env)) {
      // Look for service bindings that match agent pattern
      if (key.endsWith('_AGENT') && typeof value === 'object' && value.fetch) {
        const agentId = key.replace('_AGENT', '').toLowerCase();
        bindings.set(agentId, value);
      }
    }
    
    // Also check for other common patterns
    if (env.AGENTS && Array.isArray(env.AGENTS)) {
      for (const agent of env.AGENTS) {
        if (agent.id && agent.binding) {
          bindings.set(agent.id, agent.binding);
        }
      }
    }
    
    return bindings;
  },

  // Determine which agent to use based on user intent and discovered agent capabilities
  async determineTargetAgent(userPrompt, agentHint, env) {
    // Discover available agents
    const availableAgents = await this.discoverAgents(env);
    
    if (availableAgents.length === 0) {
      return null;
    }

    // If explicit agent hint is provided, try to match it
    if (agentHint) {
      const normalizedHint = agentHint.toLowerCase();
      
      // Try exact ID match first
      const exactMatch = availableAgents.find(agent => 
        agent.id.toLowerCase() === normalizedHint ||
        agent.name.toLowerCase().includes(normalizedHint)
      );
      if (exactMatch) return exactMatch;
      
      // Try capability match
      const capabilityMatch = availableAgents.find(agent =>
        agent.capabilities.some(cap => cap.toLowerCase().includes(normalizedHint))
      );
      if (capabilityMatch) return capabilityMatch;
    }

    // If no prompt provided, can't determine intent
    if (!userPrompt) {
      return null;
    }

    // Analyze user prompt against agent capabilities and descriptions
    const prompt = userPrompt.toLowerCase();
    const scores = [];
    
    for (const agent of availableAgents) {
      let score = 0;
      
      // Score based on capabilities
      for (const capability of agent.capabilities) {
        const capWords = capability.toLowerCase().split(/[-_\s]+/);
        for (const word of capWords) {
          if (word.length > 2 && prompt.includes(word)) {
            score += 3; // High weight for capability matches
          }
        }
      }
      
      // Score based on description
      const descWords = agent.description.toLowerCase().split(/\s+/);
      for (const word of descWords) {
        if (word.length > 3 && prompt.includes(word)) {
          score += 1; // Lower weight for description matches
        }
      }
      
      // Score based on agent name
      const nameWords = agent.name.toLowerCase().split(/\s+/);
      for (const word of nameWords) {
        if (word.length > 2 && prompt.includes(word)) {
          score += 2; // Medium weight for name matches
        }
      }
      
      if (score > 0) {
        scores.push({ agent, score });
      }
    }
    
    // Return the highest scoring agent, or null if no matches
    if (scores.length === 0) {
      return null;
    }
    
    scores.sort((a, b) => b.score - a.score);
    return scores[0].agent;
  },

  // Generic method to get UI from any discovered agent
  async getAgentUI(request, env, agentObject) {
    const step = new URL(request.url).searchParams.get('step') || '1';
    
    try {
      // Create request to agent's complete UI endpoint
      const agentRequest = new Request('http://internal/ui?step=' + step, {
        method: 'GET',
        headers: { 'Content-Type': 'text/html' }
      });

      // Use the agent's service binding to fetch UI
      const response = await agentObject.binding.fetch(agentRequest);

      // Return agent response if successful, otherwise fallback
      if (response && response.ok) {
        // Ensure proper content type for HTML response
        const responseText = await response.text();
        return new Response(responseText, {
          status: response.status,
          statusText: response.statusText,
          headers: {
            'Content-Type': 'text/html',
            'Access-Control-Allow-Origin': '*'
          }
        });
      } else {
        return this.generateGenericAgentUnavailableHTML(agentObject);
      }
      
    } catch (error) {
      console.warn(`Failed to get UI from agent ${agentObject.id}:`, error);
      return this.generateGenericAgentUnavailableHTML(agentObject);
    }
  },

  // Generate a generic "agent unavailable" HTML response
  generateGenericAgentUnavailableHTML(agentObject) {
    const unavailableHTML = `
      <div class="agent-unavailable">
        <style>
          .agent-unavailable {
            max-width: 800px;
            margin: 0 auto;
            padding: 40px 20px;
            font-family: system-ui, -apple-system, sans-serif;
            text-align: center;
          }
          
          .unavailable-card {
            background: white;
            border-radius: 12px;
            padding: 40px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.1);
            border: 1px solid #e1e5e9;
          }
          
          .unavailable-icon {
            font-size: 4rem;
            margin-bottom: 20px;
          }
          
          .unavailable-title {
            font-size: 1.5rem;
            font-weight: 600;
            color: #1f2937;
            margin-bottom: 12px;
          }
          
          .unavailable-description {
            color: #6b7280;
            margin-bottom: 30px;
            line-height: 1.6;
          }
          
          .unavailable-status {
            background: #fee2e2;
            color: #991b1b;
            padding: 16px;
            border-radius: 8px;
            margin-bottom: 30px;
            border: 1px solid #fecaca;
          }
          
          .capabilities-section {
            text-align: left;
            background: #f9fafb;
            padding: 20px;
            border-radius: 8px;
            margin-top: 20px;
          }
          
          .capabilities-title {
            font-weight: 600;
            color: #374151;
            margin-bottom: 12px;
          }
          
          .capabilities-list {
            list-style: none;
            padding: 0;
            margin: 0;
          }
          
          .capabilities-list li {
            padding: 6px 0;
            color: #6b7280;
            border-bottom: 1px solid #e5e7eb;
          }
          
          .capabilities-list li:last-child {
            border-bottom: none;
          }
          
          .capabilities-list li:before {
            content: "•";
            color: #3b82f6;
            margin-right: 8px;
          }
          
          .instructions {
            background: #dbeafe;
            color: #1e40af;
            padding: 20px;
            border-radius: 8px;
            margin-top: 20px;
            text-align: left;
          }
          
          .instructions h4 {
            margin: 0 0 12px 0;
            color: #1e3a8a;
          }
          
          .instructions ol {
            margin: 0;
            padding-left: 20px;
          }
          
          .instructions li {
            margin-bottom: 8px;
            line-height: 1.5;
          }
          
          .instructions code {
            background: #1e3a8a;
            color: white;
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 0.9em;
          }
        </style>
        
        <div class="unavailable-card">
          <div class="unavailable-icon">⚠️</div>
          <h2 class="unavailable-title">${agentObject.name} Unavailable</h2>
          <p class="unavailable-description">${agentObject.description}</p>
          
          <div class="unavailable-status">
            ${agentObject.name} is currently unavailable. The service binding may not be configured or the agent may not be deployed.
          </div>
          
          <div class="capabilities-section">
            <h4 class="capabilities-title">Agent Capabilities:</h4>
            <ul class="capabilities-list">
              ${agentObject.capabilities.map(cap => `<li>${cap}</li>`).join('')}
            </ul>
          </div>
          
          <div class="instructions">
            <h4>To fix this issue:</h4>
            <ol>
              <li>Ensure the agent is deployed: <code>cd ${agentObject.id}-agent && wrangler deploy</code></li>
              <li>Check that service bindings are configured in wrangler.toml</li>
              <li>Verify the agent's <code>/ui</code> endpoint is working</li>
              <li>Restart the main agent after making changes</li>
            </ol>
          </div>
        </div>
      </div>
    `;

    return new Response(unavailableHTML, {
      headers: {
        'Content-Type': 'text/html',
        'Access-Control-Allow-Origin': '*'
      }
    });
  },

  // Generate a generic "agent unavailable" response (legacy JSON format)
  generateGenericAgentUnavailableChunk(agentObject) {
    return new Response(JSON.stringify({
      success: true,
      title: `${agentObject.name} Unavailable`,
      html: `
        <div class="agent-ui-chunk">
          <div class="prompt">
            <h3>${agentObject.name}</h3>
            <p>${agentObject.description}</p>
          </div>
          <div class="status-message" style="color: #dc3545; text-align: center; padding: 20px;">
            ⚠️ ${agentObject.name} is currently unavailable. Please try again later.
          </div>
          <div class="agent-capabilities" style="margin-top: 20px;">
            <h4>Agent Capabilities:</h4>
            <ul>
              ${agentObject.capabilities.map(cap => `<li>${cap}</li>`).join('')}
            </ul>
          </div>
        </div>
      `,
      scripts: ''
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  },

  // Get discovered agents for agent card endpoint
  async getDiscoveredAgentsForCard(request, env) {
    try {
      const discoveredAgents = await this.discoverAgents(env);
      const baseUrl = request.url.replace(new URL(request.url).pathname, "");
      
      return discoveredAgents.map(agent => ({
        name: agent.name,
        description: agent.description,
        path: `/agents/${agent.id}/`,
        capabilities: agent.capabilities
      }));
    } catch (error) {
      console.warn("Failed to discover agents for card:", error);
      return [];
    }
  },

  // Generate dynamic MCP tools based on discovered agents
  async generateDynamicMcpTools(env) {
    const tools = [];
    
    try {
      const discoveredAgents = await this.discoverAgents(env);
      
      // Add generic tools
      tools.push({
        name: "analyze_user_intent",
        description: "Analyze user message to determine the best agent or tool recommendation",
        inputSchema: {
          type: "object",
          properties: {
            message: {
              type: "string",
              description: "User's message to analyze"
            },
            context: {
              type: "string",
              description: "Previous conversation context"
            }
          },
          required: ["message"]
        }
      });

      tools.push({
        name: "get_agent_capabilities",
        description: "Get detailed information about available agents and their capabilities",
        inputSchema: {
          type: "object",
          properties: {
            agent: {
              type: "string",
              enum: ["all", ...discoveredAgents.map(a => a.id)],
              description: "Which agent's capabilities to retrieve"
            }
          }
        }
      });

      // Add dynamic routing tools for each discovered agent
      for (const agent of discoveredAgents) {
        tools.push({
          name: `route_to_${agent.id}`,
          description: `Route user to ${agent.name} for ${agent.description}`,
          inputSchema: {
            type: "object",
            properties: {
              intent: {
                type: "string",
                description: `User's intent regarding ${agent.name}`
              },
              context: {
                type: "string",
                description: `Additional context about their ${agent.name} needs`
              }
            },
            required: ["intent"]
          }
        });
      }
    } catch (error) {
      console.warn("Failed to generate dynamic MCP tools:", error);
      // Fallback to basic tools
      tools.push({
        name: "analyze_user_intent",
        description: "Analyze user message to determine the best agent or tool recommendation",
        inputSchema: {
          type: "object",
          properties: {
            message: { type: "string", description: "User's message to analyze" },
            context: { type: "string", description: "Previous conversation context" }
          },
          required: ["message"]
        }
      });
    }

    return tools;
  },

  // Execute dynamic MCP tools
  async executeDynamicMcpTool(name, args, request, env) {
    try {
      if (name === "analyze_user_intent") {
        const analysis = await this.analyzeUserIntent(args.message, args.context);
        return new Response(JSON.stringify({
          "jsonrpc": "2.0",
          "result": {
            "content": [{
              "type": "text",
              "text": JSON.stringify(analysis, null, 2)
            }]
          }
        }), {
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        });
      }

      if (name === "get_agent_capabilities") {
        const capabilities = await this.getAgentCapabilities(args.agent || "all", env);
        return new Response(JSON.stringify({
          "jsonrpc": "2.0",
          "result": {
            "content": [{
              "type": "text",
              "text": JSON.stringify(capabilities, null, 2)
            }]
          }
        }), {
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        });
      }

      // Handle dynamic routing tools
      if (name.startsWith("route_to_")) {
        const agentId = name.replace("route_to_", "");
        const discoveredAgents = await this.discoverAgents(env);
        const agent = discoveredAgents.find(a => a.id === agentId);
        
        if (agent) {
          return new Response(JSON.stringify({
            "jsonrpc": "2.0",
            "result": {
              "content": [{
                "type": "text",
                "text": `Routing to ${agent.name} for: ${args.intent}\nURL: ${new URL(request.url).origin}/agents/${agent.id}/`
              }]
            }
          }), {
            headers: { 
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*"
            }
          });
        }
      }

      // Tool not found
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

  // Match user message to best available agent
  async matchMessageToAgent(message, availableAgents) {
    const lowerMessage = message.toLowerCase();
    const scores = [];

    for (const agent of availableAgents) {
      let score = 0;
      let matches = [];

      // Score based on capabilities
      for (const capability of agent.capabilities) {
        const capWords = capability.toLowerCase().split(/[-_\s]+/);
        for (const word of capWords) {
          if (word.length > 2 && lowerMessage.includes(word)) {
            score += 3;
            matches.push(word);
          }
        }
      }

      // Score based on description
      const descWords = agent.description.toLowerCase().split(/\s+/);
      for (const word of descWords) {
        if (word.length > 3 && lowerMessage.includes(word)) {
          score += 1;
          matches.push(word);
        }
      }

      // Score based on agent name
      const nameWords = agent.name.toLowerCase().split(/\s+/);
      for (const word of nameWords) {
        if (word.length > 2 && lowerMessage.includes(word)) {
          score += 2;
          matches.push(word);
        }
      }

      if (score > 0) {
        scores.push({
          agent: { ...agent, icon: this.getAgentIcon(agent.capabilities) },
          score,
          confidence: Math.min(score / 10, 1), // Normalize to 0-1
          matches
        });
      }
    }

    if (scores.length === 0) {
      return null;
    }

    scores.sort((a, b) => b.score - a.score);
    return scores[0];
  },

  // Get appropriate icon for agent based on capabilities
  getAgentIcon(capabilities) {
    const capString = capabilities.join(' ').toLowerCase();
    
    if (capString.includes('pdf') || capString.includes('document') || capString.includes('file')) {
      return '📚';
    } else if (capString.includes('character') || capString.includes('dnd') || capString.includes('beyond')) {
      return '🐉';
    } else if (capString.includes('campaign') || capString.includes('session')) {
      return '🎲';
    } else {
      return '🤖';
    }
  },

  // Get agent list for display in default response
  async getAgentListForDisplay(env, baseUrl) {
    try {
      const discoveredAgents = await this.discoverAgents(env);
      if (discoveredAgents.length === 0) {
        return "No agents currently available.";
      }
      
      return discoveredAgents.map(agent => 
        `- ${agent.name}: ${baseUrl}/agents/${agent.id}/`
      ).join('\n');
    } catch (error) {
      return "Agent discovery failed.";
    }
  }

}; 