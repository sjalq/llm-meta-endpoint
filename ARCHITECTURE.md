# Architecture Documentation

## Overview

This worker follows a pure functional programming paradigm with clear separation of concerns, comprehensive error handling, and structured logging.

## Code Organization

```
src/index.ts
├── Types                    # TypeScript interfaces and type definitions
├── Constants               # Immutable configuration objects
├── Pure Utility Functions  # Side-effect free helper functions
├── Request Body Builders   # Pure functions to construct API requests
├── Response Parsers        # Pure functions to parse API responses
├── LLM Query Functions     # Side-effect functions for API calls
├── Main Business Logic     # Pure orchestration functions
└── Main Handler           # HTTP request handler (entry point)
```

## Functional Programming Principles

### 1. Pure Functions

Functions that:
- Always return the same output for the same input
- Have no side effects
- Don't mutate their arguments

**Examples:**
```typescript
// Pure function - deterministic, no side effects
const buildOpenAIRequestBody = (query: string, schema: any) => ({
  model: 'gpt-4o-2024-08-06',
  messages: [{ role: 'user', content: query }],
  response_format: {
    type: 'json_schema',
    json_schema: { name: 'response', strict: true, schema }
  }
});

// Pure function - data transformation
const validateRequest = (requestData: any): Result<QueryRequest, string> => {
  if (!requestData || typeof requestData !== 'object') {
    return { success: false, error: 'Invalid request body' };
  }
  // ... more validation
  return { success: true, value: requestData as QueryRequest };
};
```

### 2. Separation of Concerns

**Pure Functions (No I/O):**
- `buildOpenAIRequestBody`, `buildClaudeRequestBody`, etc.
- `parseOpenAIResponse`, `parseClaudeResponse`, etc.
- `validateRequest`
- `resolveApiKeys`
- `createCombinedResponse`

**Side Effect Functions (I/O Operations):**
- `queryOpenAI`, `queryClaude`, `queryGemini`, `queryGrok`
- `logToConsole`
- `fetch` operations

### 3. Higher-Order Functions

Reduce code duplication by creating function factories:

```typescript
const createLLMQueryFunction = (
  provider: string,
  url: string,
  buildHeaders: (apiKey: string) => Record<string, string>,
  buildBody: (query: string, schema: any) => any,
  parseResponse: (data: any) => Result<any, string>,
  urlModifier?: (url: string, apiKey: string) => string
) => async (query: string, schema: any, apiKey: string): Promise<LLMResponse> => {
  // Generic query implementation
};

// Create specific implementations
const queryOpenAI = createLLMQueryFunction(
  'OpenAI GPT-4',
  'https://api.openai.com/v1/chat/completions',
  (apiKey) => ({ 'Authorization': `Bearer ${apiKey}` }),
  buildOpenAIRequestBody,
  parseOpenAIResponse
);
```

### 4. Composition

Small functions composed to create complex behavior:

```typescript
const handleRequest = async (request: Request, env: Env): Promise<Response> => {
  // Compose multiple operations
  const validationResult = validateRequest(requestData);
  const apiKeys = resolveApiKeys(queryRequest, env);
  const promises = buildLLMPromises(queryRequest.query, schema, apiKeys);
  const responses = await Promise.all(promises);
  const result = createCombinedResponse(queryRequest.query, responses, totalLatency);
  return createSuccessResponse(result);
};
```

## Error Handling Pattern

### Result Type

Custom discriminated union type for explicit error handling:

```typescript
type Result<T, E = Error> =
  | { success: true; value: T }
  | { success: false; error: E };
```

**Usage:**
```typescript
const safeJsonParse = <T>(text: string): Result<T, string> => {
  try {
    return { success: true, value: JSON.parse(text) };
  } catch (error) {
    return {
      success: false,
      error: `JSON parse error: ${error.message}`
    };
  }
};

// Consumer
const result = safeJsonParse(responseText);
if (result.success) {
  console.log(result.value); // Type-safe access
} else {
  console.error(result.error); // Error handling
}
```

### Error Propagation

Errors are:
1. Caught at the source
2. Logged with context
3. Wrapped in Result type or LLMResponse
4. Propagated up without crashing other operations

```typescript
// Individual LLM failures don't crash the entire request
const responses = await Promise.all([
  queryOpenAI(...),  // May fail
  queryClaude(...),  // May fail
  queryGemini(...),  // May fail
  queryGrok(...)     // May fail
]);

// Each returns { success: boolean, ... }
// Consumers can handle mixed results
```

## Logging Architecture

### Structured Logging

All logs are JSON objects with consistent structure:

```typescript
interface LogEntry {
  level: 'INFO' | 'WARN' | 'ERROR';
  timestamp: string;
  message: string;
  context?: Record<string, any>;
}
```

### Pure Logging Functions

```typescript
// Pure function - creates log entry
const createLogEntry = (
  level: LogEntry['level'],
  message: string,
  context?: Record<string, any>
): LogEntry => ({
  level,
  timestamp: getCurrentTimestamp(),
  message,
  ...(context && { context })
});

// Side effect function - outputs to console
const logToConsole = (entry: LogEntry): void => {
  const logMethod = entry.level === 'ERROR' ? console.error :
                    entry.level === 'WARN' ? console.warn :
                    console.log;
  logMethod(JSON.stringify(entry));
};

// Composed convenience functions
const log = (level: LogEntry['level']) =>
  (message: string, context?: Record<string, any>): void => {
    logToConsole(createLogEntry(level, message, context));
  };

const logInfo = log('INFO');
const logWarn = log('WARN');
const logError = log('ERROR');
```

### Log Levels

- **INFO**: Normal operations, request lifecycle
- **WARN**: Recoverable errors, API failures
- **ERROR**: Critical errors, parsing failures

### Context Objects

Rich context for debugging:

```typescript
logInfo('Querying OpenAI GPT-4', {
  query: query.substring(0, 100)
});

logWarn('OpenAI API error', {
  status: response.status,
  responsePreview: responseText.substring(0, 200)
});

logError('JSON parse failed', {
  error: errorMessage,
  provider: 'OpenAI'
});
```

## Data Flow

```
HTTP Request
    ↓
Validate Request → Result<QueryRequest, string>
    ↓
Resolve API Keys → { openai?, anthropic?, gemini?, grok? }
    ↓
Build Promises → Promise<LLMResponse>[]
    ↓
Promise.all() → Parallel execution
    ↓
Collect Responses → LLMResponse[]
    ↓
Create Combined Response → CombinedResponse
    ↓
HTTP Response
```

## Testing Strategy

### Unit Tests

Test pure functions in isolation:

```javascript
describe('Request Validation', () => {
  it('should validate a valid request', () => {
    const requestData = { query: 'Test query' };
    expect(requestData.query).toBeDefined();
  });
});
```

### Integration Tests

Test complete HTTP cycle:

```javascript
describe('Worker HTTP Interface', () => {
  it('should reject GET requests', async () => {
    const response = await fetch(BASE_URL, { method: 'GET' });
    expect(response.status).toBe(405);
  });
});
```

### Why This Approach Works

1. **Testability**: Pure functions are easy to test
2. **Maintainability**: Clear separation makes changes safer
3. **Debuggability**: Structured logs provide rich context
4. **Reliability**: Explicit error handling prevents crashes

## Adding New LLM Providers

To add a new provider:

1. **Add configuration:**
```typescript
const LLM_CONFIGS = {
  newprovider: {
    name: 'New Provider',
    url: 'https://api.newprovider.com/v1/chat',
    model: 'model-name'
  }
}
```

2. **Create request body builder (pure):**
```typescript
const buildNewProviderRequestBody = (query: string, schema: any) => ({
  // Provider-specific structure
});
```

3. **Create response parser (pure):**
```typescript
const parseNewProviderResponse = (data: any): Result<any, string> => {
  // Provider-specific parsing
};
```

4. **Create query function:**
```typescript
const queryNewProvider = createLLMQueryFunction(
  LLM_CONFIGS.newprovider.name,
  LLM_CONFIGS.newprovider.url,
  (apiKey) => ({ 'Authorization': `Bearer ${apiKey}` }),
  buildNewProviderRequestBody,
  parseNewProviderResponse
);
```

5. **Update business logic:**
```typescript
const buildLLMPromises = (query, schema, apiKeys) => {
  const promises = [];
  // ... existing providers
  if (apiKeys.newprovider) {
    promises.push(queryNewProvider(query, schema, apiKeys.newprovider));
  }
  return promises;
};
```

## Best Practices

1. **Keep functions small** - Each function should do one thing
2. **Use Result types** - Explicit error handling over exceptions
3. **Log with context** - Always include relevant debugging info
4. **Test pure functions** - They're the easiest to test
5. **Compose functions** - Build complex behavior from simple parts
6. **Document types** - TypeScript interfaces serve as documentation
7. **Handle errors gracefully** - Never crash the entire request

## Performance Considerations

- **Parallel execution**: All LLM queries run simultaneously
- **No unnecessary allocations**: Immutable data patterns
- **Efficient parsing**: Single-pass JSON parsing with Result types
- **Minimal overhead**: Pure functions have minimal runtime cost
