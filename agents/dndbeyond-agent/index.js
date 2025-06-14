// D&D Beyond Character & Campaign Agent
// A Cloudflare Worker that provides A2A protocol-compliant access to D&D Beyond data
// Fetches character sheets, campaign info, and party details for D&D campaign management

export default {
  async fetch(req, env) {
    const { pathname } = new URL(req.url);

    // A2A Protocol agent card endpoint
    if (pathname === "/.well-known/agent.json") {
      return new Response(JSON.stringify({
        "@type": "AgentCard",
        "name": "D&D Beyond Character & Campaign Agent",
        "description": "Fetches character sheets, campaign information, and party details from D&D Beyond.",
        "version": "1.0.0",
        "capabilities": ["character-lookup", "campaign-data", "party-management"],
        "api": {
          "url": "https://dndbeyond-agent.example.workers.dev",
          "authentication": { "type": "api-key", "header": "Authorization", "format": "Bearer {api-key}" },
          "endpoints": [
            { "path": "/character/{id}", "method": "GET", "description": "Get character by ID" },
            { "path": "/campaign/{characterId}", "method": "GET", "description": "Get campaign info" },
            { "path": "/party/{characterId}", "method": "GET", "description": "Get party overview" }
          ]
        }
      }), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    }

    // API-only agent - no UI served directly

    // CORS
    if (req.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization"
        }
      });
    }

    // Get character by ID
    if (pathname.startsWith("/character/") && req.method === "GET") {
      const authResponse = await this.requireAuthentication(req, env);
      if (authResponse.error) return authResponse.error;

      const characterId = pathname.split("/character/")[1];
      if (!characterId || !characterId.match(/^\d+$/)) {
        return new Response(JSON.stringify({ error: "Invalid character ID" }), { 
          status: 400, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
      }

      try {
        const character = await this.fetchCharacter(characterId);
        return new Response(JSON.stringify({ success: true, character }), {
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
      } catch (error) {
        return new Response(JSON.stringify({ error: "Failed to fetch character", message: error.message }), { 
          status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
      }
    }

    return new Response(JSON.stringify({ error: "Not found" }), { 
      status: 404, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  },

  async fetchCharacter(characterId) {
    const url = `https://character-service.dndbeyond.com/character/v5/character/${characterId}`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Referer': 'https://www.dndbeyond.com/'
      }
    });

    if (!response.ok) {
      if (response.status === 404) throw new Error('Character not found or not public');
      if (response.status === 429) throw new Error('Rate limited by D&D Beyond');
      throw new Error(`D&D Beyond API error: ${response.status}`);
    }

    const data = await response.json();
    
    return {
      id: data.id,
      name: data.name,
      level: data.classes?.reduce((total, cls) => total + cls.level, 0) || 1,
      race: data.race?.fullName || data.race?.baseName,
      classes: data.classes?.map(cls => ({ name: cls.definition?.name, level: cls.level })) || [],
      stats: {
        strength: data.stats?.[0]?.value || 10,
        dexterity: data.stats?.[1]?.value || 10,
        constitution: data.stats?.[2]?.value || 10,
        intelligence: data.stats?.[3]?.value || 10,
        wisdom: data.stats?.[4]?.value || 10,
        charisma: data.stats?.[5]?.value || 10
      },
      hitPoints: {
        current: data.baseHitPoints + (data.bonusHitPoints || 0),
        max: data.baseHitPoints + (data.bonusHitPoints || 0)
      },
      armorClass: data.armorClass || 10,
      speed: data.speed?.walk || 30,
      avatarUrl: data.avatarUrl
    };
  },

  async requireAuthentication(req, env) {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return {
        error: new Response(JSON.stringify({ error: "Authentication required" }), { 
          status: 401, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        })
      };
    }

    const apiKey = authHeader.substring(7);
    if (!env.API_KEY || apiKey !== env.API_KEY) {
      return {
        error: new Response(JSON.stringify({ error: "Invalid API key" }), { 
          status: 403, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        })
      };
    }

    return { success: true };
  },

  getCharacterUI() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>D&D Beyond Character Lookup</title>
    <style>
        body { font-family: system-ui; background: linear-gradient(135deg, #8B0000, #DC143C); min-height: 100vh; padding: 20px; margin: 0; }
        .container { max-width: 800px; margin: 0 auto; background: white; border-radius: 20px; box-shadow: 0 20px 40px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #8B0000, #DC143C); color: white; padding: 30px; text-align: center; border-radius: 20px 20px 0 0; }
        .header h1 { font-size: 2.5em; margin: 0 0 10px 0; }
        .content { padding: 40px; }
        .auth-section { margin-bottom: 30px; padding: 20px; background: #f8f9fa; border-radius: 10px; }
        .input-group { margin-bottom: 20px; }
        .input-group label { display: block; margin-bottom: 5px; font-weight: 600; color: #8B0000; }
        .input-group input { width: 100%; padding: 12px; border: 2px solid #ddd; border-radius: 8px; }
        .btn { background: linear-gradient(135deg, #DC143C, #8B0000); color: white; border: none; padding: 12px 30px; border-radius: 8px; cursor: pointer; margin: 5px; }
        .status { padding: 15px; border-radius: 8px; margin: 15px 0; display: none; }
        .status.success { background: #d5f4e6; color: #27ae60; }
        .status.error { background: #f8d7da; color: #721c24; }
        .status.info { background: #cce7ff; color: #0066cc; }
        .character-card { background: #f8f9fa; padding: 20px; border-radius: 10px; margin: 15px 0; }
        .character-name { font-size: 1.5em; font-weight: bold; color: #8B0000; margin-bottom: 10px; }
        .stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap: 10px; }
        .stat-block { background: white; padding: 10px; border-radius: 5px; text-align: center; }
        .stat-value { font-size: 1.2em; font-weight: bold; color: #DC143C; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🐉 D&D Beyond Character Lookup</h1>
            <p>Access character sheets and campaign information</p>
        </div>
        <div class="content">
            <div class="auth-section">
                <h3>🔐 Authentication</h3>
                <div class="input-group">
                    <label for="apiKey">API Key</label>
                    <input type="password" id="apiKey" placeholder="Enter your API key">
                </div>
            </div>
            
            <div class="input-group">
                <label for="characterId">Character ID</label>
                <input type="number" id="characterId" placeholder="Enter D&D Beyond character ID">
            </div>
            
            <button class="btn" onclick="lookupCharacter()">Get Character</button>
            
            <div class="status" id="status"></div>
            <div id="results"></div>
        </div>
    </div>

    <script>
        function showStatus(type, message) {
            const status = document.getElementById('status');
            status.className = 'status ' + type;
            status.textContent = message;
            status.style.display = 'block';
        }
        
        async function lookupCharacter() {
            const apiKey = document.getElementById('apiKey').value.trim();
            const characterId = document.getElementById('characterId').value.trim();
            
            if (!apiKey) {
                showStatus('error', 'Please enter your API key');
                return;
            }
            
            if (!characterId) {
                showStatus('error', 'Please enter a character ID');
                return;
            }
            
            showStatus('info', 'Looking up character...');
            
            try {
                const response = await fetch(\`/character/\${characterId}\`, {
                    headers: { 'Authorization': \`Bearer \${apiKey}\` }
                });
                
                const result = await response.json();
                
                if (result.success) {
                    displayCharacter(result.character);
                    showStatus('success', 'Character loaded successfully!');
                } else {
                    throw new Error(result.message || 'Failed to load character');
                }
            } catch (error) {
                showStatus('error', 'Error: ' + error.message);
            }
        }
        
        function displayCharacter(character) {
            const results = document.getElementById('results');
            results.innerHTML = \`
                <div class="character-card">
                    <div class="character-name">\${character.name}</div>
                    <p>Level \${character.level} \${character.race} \${character.classes.map(c => c.name).join('/')}</p>
                    
                    <div class="stat-grid">
                        <div class="stat-block">
                            <div>Hit Points</div>
                            <div class="stat-value">\${character.hitPoints.current}/\${character.hitPoints.max}</div>
                        </div>
                        <div class="stat-block">
                            <div>AC</div>
                            <div class="stat-value">\${character.armorClass}</div>
                        </div>
                        <div class="stat-block">
                            <div>Speed</div>
                            <div class="stat-value">\${character.speed}</div>
                        </div>
                        <div class="stat-block">
                            <div>STR</div>
                            <div class="stat-value">\${character.stats.strength}</div>
                        </div>
                        <div class="stat-block">
                            <div>DEX</div>
                            <div class="stat-value">\${character.stats.dexterity}</div>
                        </div>
                        <div class="stat-block">
                            <div>CON</div>
                            <div class="stat-value">\${character.stats.constitution}</div>
                        </div>
                        <div class="stat-block">
                            <div>INT</div>
                            <div class="stat-value">\${character.stats.intelligence}</div>
                        </div>
                        <div class="stat-block">
                            <div>WIS</div>
                            <div class="stat-value">\${character.stats.wisdom}</div>
                        </div>
                        <div class="stat-block">
                            <div>CHA</div>
                            <div class="stat-value">\${character.stats.charisma}</div>
                        </div>
                    </div>
                </div>
            \`;
        }
    </script>
</body>
</html>`;
  }
}; 