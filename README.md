# LLM Meta-Endpoint Worker

A Cloudflare Worker that queries multiple LLM APIs (OpenAI GPT-4, Anthropic Claude, Google Gemini, and xAI Grok) in parallel and returns combined structured JSON responses.

## Features

- **Parallel Query Execution**: Uses `Promise.all()` to query all four LLMs simultaneously
- **Structured JSON Output**: Enforces JSON schema across all providers using their native structured output APIs
- **Customizable Schema**: Provide your own JSON schema or use the default
- **Response Tracking**: Returns latency metrics for each provider and total request time
- **Pure Functional Style**: Clean, composable, testable code with separation of pure functions and side effects
- **Robust Error Handling**: Comprehensive error handling with Result types and graceful degradation
- **Structured Logging**: JSON-formatted logs with timestamps and context for easy debugging and monitoring
- **Comprehensive Testing**: Full unit and integration test suite with Vitest
- **Type Safety**: Full TypeScript support with proper type definitions

## Setup

### 1. Install Dependencies

```bash
cd llm-meta-endpoint
npm install
```

### 2. Configure API Keys (Optional)

You have two options for providing API keys:

#### Option 1: Pass keys in the request body (Most Flexible)

Simply include the `apiKeys` field in your POST request. This allows different users to use their own keys:

```json
{
  "query": "...",
  "apiKeys": {
    "openai": "sk-...",
    "anthropic": "sk-ant-...",
    "gemini": "...",
    "grok": "xai-..."
  }
}
```

#### Option 2: Configure as environment variables (For dedicated deployments)

For local development, create a `.dev.vars` file:

```env
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GEMINI_API_KEY=...
GROK_API_KEY=xai-...
```

For production deployment, set them as secrets in your Cloudflare Worker:

```bash
wrangler secret put OPENAI_API_KEY
wrangler secret put ANTHROPIC_API_KEY
wrangler secret put GEMINI_API_KEY
wrangler secret put GROK_API_KEY
```

**Note**: You can mix both approaches! Keys provided in the request body will override environment variables, and you only need to provide keys for the LLMs you want to query.

### 3. Run Locally

```bash
npm run dev
```

The worker will be available at `http://localhost:8787`

### 4. Deploy to Cloudflare

```bash
npm run deploy
```

## API Usage

### Endpoint

**POST** `/`

### Request Body

```json
{
  "query": "What is the capital of France?",
  "schema": {
    "type": "object",
    "properties": {
      "answer": {
        "type": "string",
        "description": "The answer to the query"
      },
      "confidence": {
        "type": "number",
        "description": "Confidence level from 0 to 1"
      }
    },
    "required": ["answer", "confidence"]
  },
  "apiKeys": {
    "openai": "sk-...",
    "anthropic": "sk-ant-...",
    "gemini": "...",
    "grok": "xai-..."
  }
}
```

**Notes**:
- The `schema` field is optional. If not provided, the default schema above will be used.
- The `apiKeys` field is optional. You can include all or just some API keys. Keys not provided in the request will fall back to environment variables if configured.
- If no keys are provided either in the request or environment, the worker will return an error.

### Response

```json
{
  "query": "What is the capital of France?",
  "responses": [
    {
      "provider": "OpenAI GPT-4",
      "success": true,
      "data": {
        "answer": "Paris",
        "confidence": 1.0
      },
      "latency": 1234
    },
    {
      "provider": "Anthropic Claude",
      "success": true,
      "data": {
        "answer": "Paris",
        "confidence": 0.99
      },
      "latency": 1456
    },
    {
      "provider": "Google Gemini",
      "success": true,
      "data": {
        "answer": "Paris",
        "confidence": 1.0
      },
      "latency": 1123
    },
    {
      "provider": "xAI Grok",
      "success": true,
      "data": {
        "answer": "Paris",
        "confidence": 1.0
      },
      "latency": 1389
    }
  ],
  "totalLatency": 1500
}
```

## Example Usage

### Using curl

**Option 1: Inline JSON**

```bash
curl -X POST http://localhost:8787 \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What is the capital of France?",
    "schema": {
      "type": "object",
      "properties": {
        "answer": {
          "type": "string",
          "description": "The answer to the query"
        },
        "confidence": {
          "type": "number",
          "description": "Confidence level from 0 to 1"
        }
      },
      "required": ["answer", "confidence"]
    },
    "apiKeys": {
      "openai": "sk-...",
      "anthropic": "sk-ant-...",
      "gemini": "...",
      "grok": "xai-..."
    }
  }'
```

**Option 2: Using a JSON file (most elegant)**

```bash
# Edit example-request.json with your API keys and query
curl -X POST http://localhost:8787 \
  -H "Content-Type: application/json" \
  -d @example-request.json
```

### Using JavaScript/TypeScript

```typescript
const response = await fetch('https://your-worker.workers.dev', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    query: 'What is the capital of France?',
    schema: {
      type: 'object',
      properties: {
        answer: {
          type: 'string',
          description: 'The answer to the query'
        },
        confidence: {
          type: 'number',
          description: 'Confidence level from 0 to 1'
        }
      },
      required: ['answer', 'confidence']
    },
    apiKeys: {
      openai: 'sk-...',
      anthropic: 'sk-ant-...',
      gemini: '...',
      grok: 'xai-...'
    }
  })
});

const data = await response.json();
console.log(data);
```

### Custom Schema Example

You can define complex schemas to extract structured data:

```json
{
  "query": "Analyze this product review: 'Great phone, amazing camera but battery life is disappointing.'",
  "schema": {
    "type": "object",
    "properties": {
      "sentiment": {
        "type": "string",
        "enum": ["positive", "negative", "neutral"],
        "description": "Overall sentiment"
      },
      "aspects": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "feature": {
              "type": "string",
              "description": "Product feature mentioned"
            },
            "sentiment": {
              "type": "string",
              "enum": ["positive", "negative", "neutral"]
            }
          },
          "required": ["feature", "sentiment"]
        }
      },
      "score": {
        "type": "number",
        "description": "Rating from 1-10"
      }
    },
    "required": ["sentiment", "aspects", "score"]
  }
}
```

## Testing

This project includes comprehensive unit and integration tests.

### Run Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run only unit tests
npm run test:unit

# Run only integration tests
npm run test:integration

# Run tests with coverage report
npm run test:coverage
```

### Test Structure

- **Unit Tests** (`tests/unit.test.js`): Test pure functions, request validation, response parsing, and business logic
- **Integration Tests** (`tests/integration.test.js`): Test the complete HTTP request/response cycle

### Running Integration Tests

Integration tests run against a local development server. Make sure the worker is running:

```bash
# Terminal 1
npm run dev

# Terminal 2
npm run test:integration
```

## Code Architecture

### Pure Functional Style

The codebase follows functional programming principles:

- **Pure Functions**: All business logic is implemented as pure functions (no side effects)
- **Separation of Concerns**: Clear separation between pure functions and I/O operations
- **Composability**: Small, focused functions that can be easily composed
- **Immutability**: Data structures are treated as immutable
- **Type Safety**: Full TypeScript type coverage

### Error Handling

Robust error handling throughout:

- **Result Type**: Custom `Result<T, E>` type for explicit error handling
- **Safe Parsing**: All JSON parsing wrapped in try-catch with Result types
- **Graceful Degradation**: Individual LLM failures don't crash the entire request
- **Detailed Error Messages**: Comprehensive error messages with context

### Logging

Structured logging for production debugging:

- **JSON Format**: All logs output as JSON for easy parsing
- **Log Levels**: INFO, WARN, ERROR levels
- **Timestamps**: ISO timestamps on all log entries
- **Context**: Rich context objects attached to log entries
- **Console Output**: Uses appropriate console methods (log, warn, error)

Example log output:
```json
{
  "level": "INFO",
  "timestamp": "2025-10-20T19:45:32.123Z",
  "message": "Querying OpenAI GPT-4",
  "context": {
    "query": "What is the capital of France?"
  }
}
```

## How It Works

### Structured Output Methods

Each LLM provider uses their native structured output API:

- **OpenAI GPT-4**: Uses `response_format` with `json_schema` parameter
- **Anthropic Claude**: Uses tool calling with a single tool definition (most reliable method for Claude)
- **Google Gemini**: Uses `responseMimeType: "application/json"` with `responseSchema`
- **xAI Grok**: Uses `response_format` parameter (similar to OpenAI)

### Parallel Execution

The worker uses `Promise.all()` to query all four APIs simultaneously, which means:

- Total response time is approximately equal to the slowest API response
- If one API fails, the others still complete successfully
- Cloudflare Workers support up to 6 simultaneous connections (we only use 4)

### Timeouts

- Cloudflare Workers have no hard timeout limit as long as the client stays connected
- Each API query has its own timeout handling
- The worker waits for all completions before responding

## Getting API Keys

- **OpenAI**: https://platform.openai.com/api-keys
- **Anthropic**: https://console.anthropic.com/
- **Google Gemini**: https://aistudio.google.com/apikey
- **xAI Grok**: https://console.x.ai/

## License

MIT
