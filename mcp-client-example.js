// Example MCP Client for Durable Object Integration
// This demonstrates how to interact with the LoreSmith MCP Durable Object layer

class McpClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
    this.sessionId = null;
    this.websocket = null;
  }

  // Initialize a new MCP session
  async initialize(capabilities = {}) {
    try {
      const response = await fetch(`${this.baseUrl}/mcp/initialize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          capabilities: capabilities
        })
      });

      const result = await response.json();
      
      if (result.result) {
        this.sessionId = result.result.sessionId;
        console.log('MCP Session initialized:', result.result);
        return result.result;
      } else {
        throw new Error(result.error?.message || 'Failed to initialize session');
      }
    } catch (error) {
      console.error('Failed to initialize MCP session:', error);
      throw error;
    }
  }

  // Connect to WebSocket for real-time communication
  async connectWebSocket() {
    if (!this.sessionId) {
      throw new Error('Session not initialized. Call initialize() first.');
    }

    return new Promise((resolve, reject) => {
      const wsUrl = `${this.baseUrl.replace('http', 'ws')}/ws?sessionId=${this.sessionId}`;
      this.websocket = new WebSocket(wsUrl);

      this.websocket.onopen = () => {
        console.log('WebSocket connected');
        resolve();
      };

      this.websocket.onmessage = (event) => {
        const message = JSON.parse(event.data);
        console.log('Received MCP message:', message);
        this.handleMcpMessage(message);
      };

      this.websocket.onclose = () => {
        console.log('WebSocket disconnected');
      };

      this.websocket.onerror = (error) => {
        console.error('WebSocket error:', error);
        reject(error);
      };
    });
  }

  // Send MCP message via WebSocket
  sendMcpMessage(method, params = {}, id = null) {
    if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }

    const message = {
      jsonrpc: "2.0",
      method: method,
      params: params,
      id: id || Date.now()
    };

    this.websocket.send(JSON.stringify(message));
    return message.id;
  }

  // Handle incoming MCP messages
  handleMcpMessage(message) {
    // Override this method to handle specific message types
    console.log('MCP Message:', message);
  }

  // List available tools
  async listTools() {
    if (this.websocket) {
      return this.sendMcpMessage("tools/list");
    } else {
      // Fallback to HTTP
      const response = await fetch(`${this.baseUrl}/mcp/tools`);
      return response.json();
    }
  }

  // Call a tool
  async callTool(toolName, args) {
    if (this.websocket) {
      return this.sendMcpMessage("tools/call", {
        name: toolName,
        arguments: args
      });
    } else {
      // Fallback to HTTP
      const response = await fetch(`${this.baseUrl}/mcp/tools/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          params: {
            name: toolName,
            arguments: args
          }
        })
      });
      return response.json();
    }
  }

  // Send chat message
  async sendChatMessage(message, context = {}) {
    const response = await fetch(`${this.baseUrl}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: message,
        context: context,
        sessionId: this.sessionId
      })
    });

    return response.json();
  }

  // Get session state
  async getSessionState() {
    if (!this.sessionId) {
      throw new Error('Session not initialized');
    }

    const response = await fetch(`${this.baseUrl}/session/state?sessionId=${this.sessionId}`);
    return response.json();
  }

  // Add to conversation
  async addToConversation(message, role, metadata = {}) {
    const response = await fetch(`${this.baseUrl}/session/conversation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sessionId: this.sessionId,
        message: message,
        role: role,
        metadata: metadata
      })
    });

    return response.json();
  }

  // Disconnect
  disconnect() {
    if (this.websocket) {
      this.websocket.close();
      this.websocket = null;
    }
  }
}

// Example usage
async function example() {
  const client = new McpClient('https://your-domain.workers.dev');

  try {
    // Initialize session
    const session = await client.initialize({
      experimental: {},
      tools: { listChanged: true }
    });

    console.log('Session created:', session.sessionId);

    // Connect WebSocket for real-time communication
    await client.connectWebSocket();

    // List available tools
    await client.listTools();

    // Analyze user intent
    await client.callTool('analyze_user_intent', {
      message: 'I need to store my D&D books',
      context: 'New campaign setup'
    });

    // Send chat message
    const chatResponse = await client.sendChatMessage(
      'How can I organize my PDF collection for my D&D campaign?'
    );
    console.log('Chat response:', chatResponse);

    // Get session state
    const sessionState = await client.getSessionState();
    console.log('Session state:', sessionState);

    // Clean up
    client.disconnect();

  } catch (error) {
    console.error('Example failed:', error);
  }
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
  module.exports = McpClient;
}

// Example usage in browser
if (typeof window !== 'undefined') {
  window.McpClient = McpClient;
  
  // Auto-run example if this script is loaded directly
  if (window.location.search.includes('run-example')) {
    example();
  }
} 