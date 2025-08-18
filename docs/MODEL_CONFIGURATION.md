# Model Configuration

Loresmith uses a centralized model configuration system. All models are configured in one place for easy management.

## Changing Models

To change the models used by Loresmith, edit `src/constants.ts`:

```typescript
// Model configuration - Change models here!
export const MODEL_CONFIG = {
  // OpenAI Models
  OPENAI: {
    // Primary model for chat and general tasks
    PRIMARY: "gpt-4o-mini", // ← Change this for chat
    // Model for metadata generation and analysis
    ANALYSIS: "gpt-3.5-turbo", // ← Change this for analysis
    // Model for embeddings (if using OpenAI embeddings)
    EMBEDDINGS: "text-embedding-3-small",
  },
  // Model parameters
  PARAMETERS: {
    // Default temperature for chat responses
    CHAT_TEMPERATURE: 0.7,
    // Default temperature for analysis tasks
    ANALYSIS_TEMPERATURE: 0.3,
    // Maximum tokens for responses
    MAX_TOKENS: 4000,
    // Top P for response generation
    TOP_P: 0.9,
  },
} as const;
```

## Available Models

### Primary Models (Chat & General Tasks)

- `gpt-4o-mini` (default) - Fast, cost-effective
- `gpt-4o` - More capable, higher cost
- `gpt-4-turbo` - Balanced performance
- `gpt-4` - Most capable, highest cost
- `gpt-3.5-turbo` - Fast, good for simple tasks

### Analysis Models (Metadata & Analysis)

- `gpt-3.5-turbo` (default) - Good for analysis tasks
- `gpt-4o-mini` - Faster analysis
- `gpt-4o` - More accurate analysis

### Embedding Models

- `text-embedding-3-small` (default) - Fast, cost-effective
- `text-embedding-3-large` - More accurate, higher cost

## Usage

The models are automatically used throughout the codebase:

- **Chat agents** use `PRIMARY` model
- **File metadata generation** uses `ANALYSIS` model
- **Content analysis** uses `ANALYSIS` model

No code changes needed - just update the constants and restart the application!
