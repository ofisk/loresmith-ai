export default {
    async fetch(req) {
      const { pathname } = new URL(req.url);
  
      if (pathname === "/.well-known/agent.json") {
        return new Response(JSON.stringify({
          "@type": "AgentCard",
          "name": "LoreSmith PDF Parser",
          "description": "Parses D&D 5e PDFs and extracts structured content",
          "api": {
            "url": "https://loresmith.example.workers.dev",
            "endpoints": ["/parse"]
          }
        }), {
          headers: { "Content-Type": "application/json" }
        });
      }
  
      if (pathname === "/parse" && req.method === "POST") {
        const body = await req.json();
        const text = body.text || "No content"; // Simulate parsing
        return new Response(JSON.stringify({
          result: `Parsed content: ${text.slice(0, 100)}...`
        }), { headers: { "Content-Type": "application/json" } });
      }
  
      return new Response("LoreSmith Agent Ready", {
        headers: { "Content-Type": "text/plain" }
      });
    }
  };
  