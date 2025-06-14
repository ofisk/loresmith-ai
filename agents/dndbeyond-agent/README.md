# D&D Beyond Character & Campaign Agent

A Cloudflare Worker agent that provides A2A protocol-compliant access to D&D Beyond character sheets and campaign information. This agent allows you to programmatically fetch character data, campaign details, and party information for D&D 5e games.

## ⚠️ Important Disclaimers

- **Unofficial API**: This agent uses D&D Beyond's unofficial API endpoints that may change or become unavailable at any time
- **Rate Limiting**: D&D Beyond implements rate limiting that may temporarily block access if too many requests are made
- **Public Characters Only**: Only works with public D&D Beyond characters
- **Captcha Risk**: High usage may trigger captcha requirements on the main D&D Beyond website

## Features

- 🎲 **Character Lookup**: Fetch detailed character information by character ID
- 🏰 **Campaign Data**: Get campaign information and party member details  
- 👥 **Party Overview**: Simplified party stats optimized for DM screens
- 🔐 **API Key Authentication**: Secure access with bearer token authentication
- 🌐 **A2A Protocol Compliant**: Standard agent card endpoint for discovery
- 📱 **Web Interface**: Built-in UI for testing and character lookup

## Quick Start

### 1. Deploy to Cloudflare Workers

```bash
# Clone or download the files
# dndbeyond-agent.js, dndbeyond-wrangler.toml, dndbeyond-package.json

# Install dependencies
npm install

# Set your API key secret
wrangler secret put API_KEY
# Enter a secure API key when prompted

# Deploy to Cloudflare Workers
wrangler deploy
```

### 2. Test the Agent

Visit your deployed worker URL to access the web interface:
```
https://your-worker-name.your-subdomain.workers.dev
```

Or test the API directly:
```bash
curl -H "Authorization: Bearer YOUR_API_KEY" \
  https://your-worker-name.your-subdomain.workers.dev/character/12345678
```

## API Endpoints

### Agent Discovery
- `GET /.well-known/agent.json` - A2A protocol agent card

### Character Data
- `GET /character/{id}` - Get character by D&D Beyond character ID
- `GET /campaign/{characterId}` - Get campaign info from character's campaign
- `GET /party/{characterId}` - Get simplified party overview for DM use

### Web Interface
- `GET /` or `/ui` - Interactive character lookup interface

## Authentication

All endpoints require API key authentication:

```bash
Authorization: Bearer YOUR_API_KEY
```

Set your API key using Wrangler:
```bash
wrangler secret put API_KEY
```

## Example Usage

### Get Character Information

```javascript
const response = await fetch('https://your-agent.workers.dev/character/12345678', {
  headers: {
    'Authorization': 'Bearer YOUR_API_KEY'
  }
});

const data = await response.json();
console.log(data.character);
```

### Response Format

```json
{
  "success": true,
  "character": {
    "id": 12345678,
    "name": "Aragorn",
    "level": 5,
    "race": "Human",
    "classes": [
      {"name": "Ranger", "level": 5}
    ],
    "stats": {
      "strength": 16,
      "dexterity": 14,
      "constitution": 13,
      "intelligence": 12,
      "wisdom": 15,
      "charisma": 10
    },
    "hitPoints": {
      "current": 45,
      "max": 45
    },
    "armorClass": 16,
    "speed": 30,
    "avatarUrl": "https://..."
  }
}
```

## Configuration

### Environment Variables

Set via `wrangler secret put`:

- `API_KEY` - Required. Authentication key for API access

### Rate Limiting

The agent respects D&D Beyond's rate limits:
- Recommended: Max 10 requests per minute
- Automatic delays between batch requests
- Error handling for rate limit responses

## Finding Character IDs

Character IDs are the numeric values in D&D Beyond character URLs:
```
https://www.dndbeyond.com/characters/12345678
                                    ^^^^^^^^
                                 Character ID
```

## Error Handling

Common error responses:

```json
{
  "error": "Character not found or not public",
  "message": "The character may be private or the ID is invalid"
}
```

```json
{
  "error": "Rate limited by D&D Beyond",
  "message": "Please try again later"
}
```

## Development

### Local Development

```bash
# Start local development server
npm run dev

# Test locally
curl -H "Authorization: Bearer test-key" \
  http://localhost:8787/character/12345678
```

### Deployment

```bash
# Deploy to production
npm run deploy

# View logs
npm run tail
```

## Limitations

1. **No Official API**: Uses reverse-engineered endpoints
2. **Public Characters Only**: Cannot access private characters
3. **Rate Limits**: Subject to D&D Beyond's rate limiting
4. **No Character Search**: Requires specific character IDs
5. **Potential Breakage**: Endpoints may change without notice

## Legal & Ethical Use

- Respect D&D Beyond's terms of service
- Only access public character data
- Implement reasonable rate limiting
- Don't overload D&D Beyond's servers
- Consider supporting D&D Beyond if you use their data

## Troubleshooting

### Character Not Found
- Ensure the character is public on D&D Beyond
- Verify the character ID is correct
- Check if the character still exists

### Rate Limited
- Reduce request frequency
- Implement delays between requests
- Consider caching responses

### Authentication Errors
- Verify API key is set correctly
- Check Authorization header format
- Ensure API key matches the deployed secret

## License

MIT License - See LICENSE file for details

## Contributing

Contributions welcome! Please:
1. Test thoroughly with public characters
2. Respect rate limits during development
3. Document any new endpoints discovered
4. Follow existing code style

## Support

For issues and questions:
1. Check the troubleshooting section
2. Verify your setup against the quick start guide
3. Test with known public characters first
4. Check Cloudflare Worker logs for errors
