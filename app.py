# app.py
from flask import Flask, jsonify
import a2a

app = Flask(__name__)

@app.route("/.well-known/agent.json")
def agent_card():
    return jsonify({
        "@type": "AgentCard",
        "name": "PDFParserAgent",
        "description": "Parses PDFs and returns raw text or structured content.",
        "api": {
            "url": "https://your-agent-url.com",
            "endpoints": ["/parse"]
        }
    })

@app.route("/parse", methods=["POST"])
def parse_pdf():
    # Accept PDF, return parsed text (placeholder logic)
    return jsonify({"text": "Sample parsed text."})

if __name__ == "__main__":
    app.run()
