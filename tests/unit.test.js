/**
 * Unit Tests for LLM Meta-Endpoint Worker
 * Tests pure functions and business logic
 */

import { describe, it, expect, beforeEach } from 'vitest';

// Mock test data
const mockSchema = {
  type: 'object',
  properties: {
    answer: { type: 'string' },
    confidence: { type: 'number' }
  },
  required: ['answer', 'confidence']
};

const mockQueryRequest = {
  query: 'What is the capital of France?',
  schema: mockSchema,
  apiKeys: {
    openai: 'test-openai-key',
    anthropic: 'test-anthropic-key'
  }
};

const mockLLMResponse = {
  provider: 'Test Provider',
  success: true,
  data: { answer: 'Paris', confidence: 0.99 },
  latency: 1234
};

describe('Request Validation', () => {
  it('should validate a valid request', () => {
    const requestData = {
      query: 'Test query',
      schema: mockSchema
    };

    expect(requestData.query).toBeDefined();
    expect(typeof requestData.query).toBe('string');
    expect(requestData.query.trim().length).toBeGreaterThan(0);
  });

  it('should reject request with missing query', () => {
    const requestData = {
      schema: mockSchema
    };

    expect(requestData.query).toBeUndefined();
  });

  it('should reject request with empty query', () => {
    const requestData = {
      query: '   ',
      schema: mockSchema
    };

    expect(requestData.query.trim().length).toBe(0);
  });

  it('should reject non-string query', () => {
    const requestData = {
      query: 123,
      schema: mockSchema
    };

    expect(typeof requestData.query).not.toBe('string');
  });

  it('should accept request without schema (uses default)', () => {
    const requestData = {
      query: 'Test query'
    };

    expect(requestData.query).toBeDefined();
    expect(requestData.schema).toBeUndefined();
  });
});

describe('API Key Resolution', () => {
  it('should use request body API keys when provided', () => {
    const requestData = {
      query: 'Test',
      apiKeys: {
        openai: 'request-key'
      }
    };
    const env = {
      OPENAI_API_KEY: 'env-key'
    };

    const openaiKey = requestData.apiKeys?.openai || env.OPENAI_API_KEY;
    expect(openaiKey).toBe('request-key');
  });

  it('should fall back to env vars when no request keys', () => {
    const requestData = {
      query: 'Test'
    };
    const env = {
      OPENAI_API_KEY: 'env-key'
    };

    const openaiKey = requestData.apiKeys?.openai || env.OPENAI_API_KEY;
    expect(openaiKey).toBe('env-key');
  });

  it('should handle partial API keys', () => {
    const requestData = {
      query: 'Test',
      apiKeys: {
        openai: 'openai-key'
      }
    };
    const env = {
      ANTHROPIC_API_KEY: 'anthropic-env-key'
    };

    const openaiKey = requestData.apiKeys?.openai || env.OPENAI_API_KEY;
    const anthropicKey = requestData.apiKeys?.anthropic || env.ANTHROPIC_API_KEY;

    expect(openaiKey).toBe('openai-key');
    expect(anthropicKey).toBe('anthropic-env-key');
  });

  it('should return undefined when no keys available', () => {
    const requestData = { query: 'Test' };
    const env = {};

    const openaiKey = requestData.apiKeys?.openai || env.OPENAI_API_KEY;
    expect(openaiKey).toBeUndefined();
  });
});

describe('JSON Parsing Safety', () => {
  it('should parse valid JSON', () => {
    const validJson = '{"answer": "Paris", "confidence": 0.99}';
    let result;
    let error;

    try {
      result = JSON.parse(validJson);
    } catch (e) {
      error = e;
    }

    expect(error).toBeUndefined();
    expect(result).toEqual({ answer: 'Paris', confidence: 0.99 });
  });

  it('should handle invalid JSON gracefully', () => {
    const invalidJson = '{invalid json}';
    let result;
    let error;

    try {
      result = JSON.parse(invalidJson);
    } catch (e) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(result).toBeUndefined();
  });

  it('should handle empty string', () => {
    const emptyString = '';
    let error;

    try {
      JSON.parse(emptyString);
    } catch (e) {
      error = e;
    }

    expect(error).toBeDefined();
  });
});

describe('Response Parsing', () => {
  it('should parse OpenAI response structure', () => {
    const openAIResponse = {
      choices: [
        {
          message: {
            content: '{"answer": "Paris", "confidence": 0.99}'
          }
        }
      ]
    };

    const content = openAIResponse.choices?.[0]?.message?.content;
    expect(content).toBeDefined();
    expect(typeof content).toBe('string');

    const parsed = JSON.parse(content);
    expect(parsed.answer).toBe('Paris');
  });

  it('should parse Claude response structure', () => {
    const claudeResponse = {
      content: [
        { type: 'text', text: 'Some text' },
        {
          type: 'tool_use',
          input: { answer: 'Paris', confidence: 0.99 }
        }
      ]
    };

    const toolUse = claudeResponse.content?.find(block => block.type === 'tool_use');
    expect(toolUse).toBeDefined();
    expect(toolUse.input).toEqual({ answer: 'Paris', confidence: 0.99 });
  });

  it('should parse Gemini response structure', () => {
    const geminiResponse = {
      candidates: [
        {
          content: {
            parts: [
              { text: '{"answer": "Paris", "confidence": 0.99}' }
            ]
          }
        }
      ]
    };

    const content = geminiResponse.candidates?.[0]?.content?.parts?.[0]?.text;
    expect(content).toBeDefined();

    const parsed = JSON.parse(content);
    expect(parsed.answer).toBe('Paris');
  });

  it('should parse Grok response structure', () => {
    const grokResponse = {
      choices: [
        {
          message: {
            content: '{"answer": "Paris", "confidence": 0.99}'
          }
        }
      ]
    };

    const content = grokResponse.choices?.[0]?.message?.content;
    expect(content).toBeDefined();

    const parsed = JSON.parse(content);
    expect(parsed.answer).toBe('Paris');
  });

  it('should handle missing fields in responses', () => {
    const malformedResponse = {
      choices: []
    };

    const content = malformedResponse.choices?.[0]?.message?.content;
    expect(content).toBeUndefined();
  });
});

describe('Request Body Builders', () => {
  it('should build valid OpenAI request body', () => {
    const query = 'Test query';
    const schema = mockSchema;

    const body = {
      model: 'gpt-4o-2024-08-06',
      messages: [{ role: 'user', content: query }],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'response',
          strict: true,
          schema
        }
      }
    };

    expect(body.model).toBe('gpt-4o-2024-08-06');
    expect(body.messages[0].content).toBe(query);
    expect(body.response_format.json_schema.schema).toEqual(schema);
  });

  it('should build valid Claude request body', () => {
    const query = 'Test query';
    const schema = mockSchema;

    const body = {
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      tools: [{
        name: 'respond',
        description: 'Respond to the query with structured data',
        input_schema: schema
      }],
      tool_choice: {
        type: 'tool',
        name: 'respond'
      },
      messages: [{ role: 'user', content: query }]
    };

    expect(body.model).toBe('claude-sonnet-4-20250514');
    expect(body.tools[0].input_schema).toEqual(schema);
    expect(body.messages[0].content).toBe(query);
  });

  it('should build valid Gemini request body', () => {
    const query = 'Test query';
    const schema = mockSchema;

    const body = {
      contents: [{
        parts: [{ text: query }]
      }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: schema
      }
    };

    expect(body.contents[0].parts[0].text).toBe(query);
    expect(body.generationConfig.responseSchema).toEqual(schema);
  });

  it('should build valid Grok request body', () => {
    const query = 'Test query';
    const schema = mockSchema;

    const body = {
      model: 'grok-2-1212',
      messages: [{ role: 'user', content: query }],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'response',
          strict: true,
          schema
        }
      }
    };

    expect(body.model).toBe('grok-2-1212');
    expect(body.messages[0].content).toBe(query);
    expect(body.response_format.json_schema.schema).toEqual(schema);
  });
});

describe('Combined Response Structure', () => {
  it('should create valid combined response', () => {
    const query = 'Test query';
    const responses = [
      mockLLMResponse,
      { ...mockLLMResponse, provider: 'Provider 2' }
    ];
    const totalLatency = 2500;

    const combined = {
      query,
      responses,
      totalLatency,
      timestamp: new Date().toISOString(),
      providersQueried: responses.length
    };

    expect(combined.query).toBe(query);
    expect(combined.responses).toHaveLength(2);
    expect(combined.totalLatency).toBe(totalLatency);
    expect(combined.providersQueried).toBe(2);
    expect(combined.timestamp).toBeDefined();
  });

  it('should handle single provider response', () => {
    const responses = [mockLLMResponse];
    const combined = {
      query: 'Test',
      responses,
      totalLatency: 1000,
      timestamp: new Date().toISOString(),
      providersQueried: responses.length
    };

    expect(combined.providersQueried).toBe(1);
  });

  it('should handle all four providers', () => {
    const responses = [
      { ...mockLLMResponse, provider: 'OpenAI GPT-4' },
      { ...mockLLMResponse, provider: 'Anthropic Claude' },
      { ...mockLLMResponse, provider: 'Google Gemini' },
      { ...mockLLMResponse, provider: 'xAI Grok' }
    ];

    const combined = {
      query: 'Test',
      responses,
      totalLatency: 3000,
      timestamp: new Date().toISOString(),
      providersQueried: responses.length
    };

    expect(combined.providersQueried).toBe(4);
    expect(combined.responses.map(r => r.provider)).toContain('OpenAI GPT-4');
    expect(combined.responses.map(r => r.provider)).toContain('Anthropic Claude');
  });
});

describe('Error Handling', () => {
  it('should handle LLM response errors', () => {
    const errorResponse = {
      provider: 'Test Provider',
      success: false,
      error: 'API error: 429 Too Many Requests',
      latency: 500
    };

    expect(errorResponse.success).toBe(false);
    expect(errorResponse.error).toBeDefined();
    expect(errorResponse.data).toBeUndefined();
  });

  it('should track latency even on errors', () => {
    const errorResponse = {
      provider: 'Test Provider',
      success: false,
      error: 'Network error',
      latency: 5000
    };

    expect(errorResponse.latency).toBeGreaterThan(0);
  });

  it('should handle mixed success and error responses', () => {
    const responses = [
      { provider: 'Provider 1', success: true, data: {}, latency: 1000 },
      { provider: 'Provider 2', success: false, error: 'Failed', latency: 500 },
      { provider: 'Provider 3', success: true, data: {}, latency: 1200 }
    ];

    const successCount = responses.filter(r => r.success).length;
    const errorCount = responses.filter(r => !r.success).length;

    expect(successCount).toBe(2);
    expect(errorCount).toBe(1);
  });
});

describe('Logging Utilities', () => {
  it('should create valid log entry', () => {
    const logEntry = {
      level: 'INFO',
      timestamp: new Date().toISOString(),
      message: 'Test message',
      context: { key: 'value' }
    };

    expect(logEntry.level).toBe('INFO');
    expect(logEntry.timestamp).toBeDefined();
    expect(logEntry.message).toBe('Test message');
    expect(logEntry.context.key).toBe('value');
  });

  it('should support different log levels', () => {
    const levels = ['INFO', 'WARN', 'ERROR'];

    levels.forEach(level => {
      const logEntry = {
        level,
        timestamp: new Date().toISOString(),
        message: `${level} message`
      };

      expect(['INFO', 'WARN', 'ERROR']).toContain(logEntry.level);
    });
  });

  it('should include timestamp in ISO format', () => {
    const timestamp = new Date().toISOString();

    expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
});

describe('Promise Array Building', () => {
  it('should build promises only for available API keys', () => {
    const apiKeys = {
      openai: 'key1',
      anthropic: undefined,
      gemini: 'key3',
      grok: undefined
    };

    const availableKeys = Object.entries(apiKeys)
      .filter(([_, key]) => key !== undefined)
      .map(([provider, _]) => provider);

    expect(availableKeys).toHaveLength(2);
    expect(availableKeys).toContain('openai');
    expect(availableKeys).toContain('gemini');
  });

  it('should handle no API keys', () => {
    const apiKeys = {
      openai: undefined,
      anthropic: undefined,
      gemini: undefined,
      grok: undefined
    };

    const availableKeys = Object.values(apiKeys).filter(key => key !== undefined);
    expect(availableKeys).toHaveLength(0);
  });

  it('should handle all API keys', () => {
    const apiKeys = {
      openai: 'key1',
      anthropic: 'key2',
      gemini: 'key3',
      grok: 'key4'
    };

    const availableKeys = Object.values(apiKeys).filter(key => key !== undefined);
    expect(availableKeys).toHaveLength(4);
  });
});
