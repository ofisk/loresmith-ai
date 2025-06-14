export const CHAT_INTERFACE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>LoreSmith Assistant - D&D Campaign Planning</title>
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
            padding: 1rem 2rem;
            text-align: center;
            color: white;
            border-bottom: 1px solid rgba(255, 255, 255, 0.2);
        }
        
        .header h1 {
            font-size: 2rem;
            margin-bottom: 0.5rem;
        }
        
        .header p {
            opacity: 0.9;
            font-size: 1.1rem;
        }
        
        .chat-container {
            flex: 1;
            display: flex;
            flex-direction: column;
            max-width: 800px;
            margin: 0 auto;
            padding: 2rem;
            width: 100%;
        }
        
        .messages {
            flex: 1;
            background: white;
            border-radius: 15px;
            padding: 2rem;
            margin-bottom: 2rem;
            box-shadow: 0 10px 30px rgba(0,0,0,0.2);
            overflow-y: auto;
            min-height: 400px;
            max-height: 600px;
        }
        
        .message {
            margin-bottom: 1.5rem;
            padding: 1rem;
            border-radius: 10px;
            max-width: 80%;
        }
        
        .message.user {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            margin-left: auto;
            text-align: right;
        }
        
        .message.assistant {
            background: #f8f9fa;
            border: 1px solid #dee2e6;
        }
        
        .message.assistant h3 {
            color: #495057;
            margin-bottom: 0.5rem;
        }
        
        .features {
            list-style: none;
            margin: 1rem 0;
        }
        
        .features li {
            padding: 0.25rem 0;
            color: #666;
        }
        
        .features li:before {
            content: "✓ ";
            color: #28a745;
            font-weight: bold;
        }
        
        .action-buttons {
            margin-top: 1rem;
            display: flex;
            gap: 1rem;
            flex-wrap: wrap;
        }
        
        .btn {
            padding: 0.75rem 1.5rem;
            border: none;
            border-radius: 8px;
            text-decoration: none;
            font-weight: 600;
            transition: all 0.3s ease;
            cursor: pointer;
            display: inline-block;
        }
        
        .btn-primary {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
        }
        
        .btn-secondary {
            background: #6c757d;
            color: white;
        }
        
        .btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 5px 15px rgba(0,0,0,0.2);
        }
        
        .input-area {
            display: flex;
            gap: 1rem;
            background: white;
            padding: 1.5rem;
            border-radius: 15px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.2);
        }
        
        .input-area input {
            flex: 1;
            padding: 1rem;
            border: 2px solid #dee2e6;
            border-radius: 8px;
            font-size: 1rem;
            outline: none;
            transition: border-color 0.3s ease;
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
        
        .input-area button:disabled {
            opacity: 0.6;
            cursor: not-allowed;
            transform: none;
        }
        
        .suggestions {
            background: rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(10px);
            padding: 1rem;
            border-radius: 10px;
            margin-bottom: 1rem;
        }
        
        .suggestions h4 {
            color: white;
            margin-bottom: 0.5rem;
        }
        
        .suggestion-buttons {
            display: flex;
            gap: 0.5rem;
            flex-wrap: wrap;
        }
        
        .suggestion-btn {
            background: rgba(255, 255, 255, 0.2);
            color: white;
            border: 1px solid rgba(255, 255, 255, 0.3);
            padding: 0.5rem 1rem;
            border-radius: 20px;
            cursor: pointer;
            font-size: 0.9rem;
            transition: all 0.3s ease;
        }
        
        .suggestion-btn:hover {
            background: rgba(255, 255, 255, 0.3);
        }
        
        @media (max-width: 768px) {
            .chat-container {
                padding: 1rem;
            }
            
            .input-area {
                flex-direction: column;
            }
            
            .action-buttons {
                flex-direction: column;
            }
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>🏰 LoreSmith Assistant</h1>
        <p>Your guide to D&D campaign planning tools</p>
    </div>
    
    <div class="chat-container">
        <div class="suggestions">
            <h4>Try asking me:</h4>
            <div class="suggestion-buttons">
                <button class="suggestion-btn" onclick="sendSuggestion('I need to store my D&D books')">Store D&D books</button>
                <button class="suggestion-btn" onclick="sendSuggestion('How can I manage player characters?')">Manage characters</button>
                <button class="suggestion-btn" onclick="sendSuggestion('I\\'m a new DM, what tools do you recommend?')">New DM help</button>
                <button class="suggestion-btn" onclick="sendSuggestion('What can you help me with?')">Show all options</button>
            </div>
        </div>
        
        <div class="messages" id="messages">
            <div class="message assistant">
                <h3>👋 Welcome to LoreSmith!</h3>
                <p>I'm here to help you find the perfect tools for your D&D campaign planning. Whether you need to manage PDFs, track characters, or organize your campaign, I'll guide you to the right agent.</p>
                <p><strong>Just tell me what you're looking for!</strong></p>
            </div>
        </div>
        
        <div class="input-area">
            <input type="text" id="messageInput" placeholder="Ask me about D&D campaign planning tools..." onkeypress="handleKeyPress(event)">
            <button onclick="sendMessage()" id="sendButton">Send</button>
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
                    addAssistantResponse(data);
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
            messageDiv.textContent = text;
            messages.appendChild(messageDiv);
            messages.scrollTop = messages.scrollHeight;
        }
        
        function addAssistantResponse(data) {
            const messages = document.getElementById('messages');
            const messageDiv = document.createElement('div');
            messageDiv.className = 'message assistant';
            
            let html = \`<h3>\${data.message}</h3>\`;
            
            if (data.explanation) {
                html += \`<p>\${data.explanation}</p>\`;
            }
            
            if (data.features) {
                html += '<ul class="features">';
                data.features.forEach(feature => {
                    html += \`<li>\${feature}</li>\`;
                });
                html += '</ul>';
            }
            
            if (data.agents) {
                data.agents.forEach(agent => {
                    html += \`<div style="margin: 1rem 0; padding: 1rem; background: #f8f9fa; border-radius: 8px;">
                        <h4>\${agent.name}</h4>
                        <p>\${agent.description}</p>
                        <p><strong>Best for:</strong> \${agent.best_for}</p>
                    </div>\`;
                });
            }
            
            if (data.suggestions) {
                html += '<p><strong>Try asking:</strong></p><ul>';
                data.suggestions.forEach(suggestion => {
                    html += \`<li style="color: #666; margin: 0.25rem 0;">\${suggestion}</li>\`;
                });
                html += '</ul>';
            }
            
            // Add action buttons
            if (data.action || data.alternative || data.agents) {
                html += '<div class="action-buttons">';
                
                if (data.action) {
                    html += \`<a href="\${data.action.url}" class="btn btn-primary" target="_blank">\${data.action.text}</a>\`;
                }
                
                if (data.alternative) {
                    html += \`<a href="\${data.alternative.url}" class="btn btn-secondary" target="_blank">\${data.alternative.text}</a>\`;
                }
                
                if (data.agents) {
                    data.agents.forEach(agent => {
                        html += \`<a href="\${agent.url}" class="btn btn-primary" target="_blank">Launch \${agent.name.replace(/[📚🎲]/g, '').trim()}</a>\`;
                    });
                }
                
                html += '</div>';
            }
            
            messageDiv.innerHTML = html;
            messages.appendChild(messageDiv);
            messages.scrollTop = messages.scrollHeight;
        }
        
        // Focus input on load
        document.getElementById('messageInput').focus();
    </script>
</body>
</html>`; 