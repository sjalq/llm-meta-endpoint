# Quick Start Guide

## 1. Install and Run

```bash
cd llm-meta-endpoint
npm install
npm run dev
```

## 2. Make Your First Request

Create a file `test-request.json`:

```json
{
  "query": "What is 2+2? Be concise.",
  "apiKeys": {
    "openai": "YOUR_OPENAI_KEY_HERE"
  }
}
```

Then run:

```bash
curl -X POST http://localhost:8787 \
  -H "Content-Type: application/json" \
  -d @test-request.json | jq '.'
```

## 3. Common Patterns

### Query All Four LLMs

```bash
curl -X POST http://localhost:8787 \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What is the capital of France?",
    "apiKeys": {
      "openai": "sk-...",
      "anthropic": "sk-ant-...",
      "gemini": "...",
      "grok": "xai-..."
    }
  }' | jq '.'
```

### Query Just One or Two LLMs

```bash
curl -X POST http://localhost:8787 \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What is 5+5?",
    "apiKeys": {
      "openai": "sk-...",
      "anthropic": "sk-ant-..."
    }
  }' | jq '.'
```

### Custom Schema Example

```bash
curl -X POST http://localhost:8787 \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Analyze: Great product but expensive",
    "schema": {
      "type": "object",
      "properties": {
        "sentiment": {
          "type": "string",
          "enum": ["positive", "negative", "neutral"]
        },
        "price_concern": {
          "type": "boolean"
        },
        "score": {
          "type": "number",
          "minimum": 1,
          "maximum": 10
        }
      },
      "required": ["sentiment", "price_concern", "score"]
    },
    "apiKeys": {
      "openai": "sk-..."
    }
  }' | jq '.'
```

## 4. Running Tests

```bash
# Terminal 1: Start dev server
npm run dev

# Terminal 2: Run tests
npm test

# Run specific tests
npm run test:unit
npm run test:integration
```

## 5. Deploy to Production

```bash
# Set your API keys (optional - can be passed in requests)
wrangler secret put OPENAI_API_KEY
wrangler secret put ANTHROPIC_API_KEY
wrangler secret put GEMINI_API_KEY
wrangler secret put GROK_API_KEY

# Deploy
npm run deploy
```

## Response Format

```json
{
  "query": "Your query here",
  "responses": [
    {
      "provider": "OpenAI GPT-4",
      "success": true,
      "data": {
        "answer": "...",
        "confidence": 0.95
      },
      "latency": 1234
    },
    {
      "provider": "Anthropic Claude",
      "success": true,
      "data": {
        "answer": "...",
        "confidence": 0.98
      },
      "latency": 1456
    }
  ],
  "totalLatency": 1500,
  "timestamp": "2025-10-20T19:45:32.123Z",
  "providersQueried": 2
}
```

## Error Handling

If a provider fails, it returns an error in its response:

```json
{
  "provider": "OpenAI GPT-4",
  "success": false,
  "error": "OpenAI API error: 429 Too Many Requests",
  "latency": 234
}
```

The other providers continue to work normally!

## Logging

Check your console/logs for structured JSON output:

```json
{
  "level": "INFO",
  "timestamp": "2025-10-20T19:45:32.123Z",
  "message": "Querying OpenAI GPT-4",
  "context": {
    "query": "What is 2+2?"
  }
}
```

## Tips

1. **Start with one LLM** - Test with one API key first
2. **Use example-request.json** - Edit and use the template file
3. **Check logs** - Structured logging helps debug issues
4. **Test locally first** - Use `npm run dev` before deploying
5. **Run tests** - Ensure everything works with `npm test`

## Common Issues

### "No API keys provided"
- Make sure you include the `apiKeys` field in your request
- Or set environment variables in `.dev.vars`

### "Invalid JSON in request body"
- Check your JSON syntax with a validator
- Make sure all quotes are proper double quotes

### LLM returns error
- Check that your API key is valid
- Verify you have credits/quota remaining
- Check the provider's status page

## Next Steps

- Read the full [README.md](./README.md) for detailed documentation
- Check out [tests/](./tests/) for example usage patterns
- Modify the default schema in `src/index.ts`
- Add custom logging or monitoring
