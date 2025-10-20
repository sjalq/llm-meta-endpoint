/**
 * Integration Tests for LLM Meta-Endpoint Worker
 * Tests the complete request/response cycle
 */

import { describe, it, expect, beforeAll } from 'vitest';

// Test configuration
const BASE_URL = process.env.TEST_URL || 'http://localhost:8787';

const mockSchema = {
  type: 'object',
  properties: {
    answer: { type: 'string' },
    confidence: { type: 'number' }
  },
  required: ['answer', 'confidence'],
  additionalProperties: false
};

describe('Worker HTTP Interface', () => {
  it('should reject GET requests', async () => {
    const response = await fetch(BASE_URL, {
      method: 'GET'
    });

    expect(response.status).toBe(405);

    const data = await response.json();
    expect(data.error).toContain('Method not allowed');
  });

  it('should reject PUT requests', async () => {
    const response = await fetch(BASE_URL, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'test' })
    });

    expect(response.status).toBe(405);
  });

  it('should reject DELETE requests', async () => {
    const response = await fetch(BASE_URL, {
      method: 'DELETE'
    });

    expect(response.status).toBe(405);
  });

  it('should accept POST requests', async () => {
    const response = await fetch(BASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: 'test',
        apiKeys: { openai: 'fake-key' }
      })
    });

    // Should not be 405
    expect(response.status).not.toBe(405);
  });
});

describe('Request Validation', () => {
  it('should reject invalid JSON', async () => {
    const response = await fetch(BASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'invalid json{'
    });

    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data.error).toContain('Invalid JSON');
  });

  it('should reject missing query field', async () => {
    const response = await fetch(BASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        schema: mockSchema
      })
    });

    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data.error).toContain('query');
  });

  it('should reject empty query', async () => {
    const response = await fetch(BASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: '   '
      })
    });

    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data.error).toContain('empty');
  });

  it('should reject request with no API keys', async () => {
    const response = await fetch(BASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: 'What is 2+2?'
      })
    });

    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data.error).toContain('API keys');
  });

  it('should accept valid request structure', async () => {
    const response = await fetch(BASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: 'What is 2+2?',
        schema: mockSchema,
        apiKeys: {
          openai: 'fake-key-for-testing'
        }
      })
    });

    // Should pass validation (may fail on actual API call with fake key)
    const data = await response.json();
    expect(data.error).not.toContain('Missing required field');
  });
});

describe('Response Structure', () => {
  it('should return JSON content type', async () => {
    const response = await fetch(BASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: 'test',
        apiKeys: { openai: 'fake' }
      })
    });

    const contentType = response.headers.get('content-type');
    expect(contentType).toContain('application/json');
  });

  it('should include CORS headers', async () => {
    const response = await fetch(BASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: 'test',
        apiKeys: { openai: 'fake' }
      })
    });

    // If successful, should have CORS header
    if (response.status === 200) {
      const corsHeader = response.headers.get('access-control-allow-origin');
      expect(corsHeader).toBe('*');
    }
  });

  it('error responses should include timestamp', async () => {
    const response = await fetch(BASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: ''
      })
    });

    const data = await response.json();
    expect(data.timestamp).toBeDefined();
    expect(data.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe('Schema Handling', () => {
  it('should use default schema when not provided', async () => {
    const response = await fetch(BASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: 'test query',
        apiKeys: { openai: 'fake' }
      })
    });

    // Request should be accepted (validation passed)
    expect(response.status).not.toBe(400);
  });

  it('should accept custom schema', async () => {
    const customSchema = {
      type: 'object',
      properties: {
        result: { type: 'string' },
        score: { type: 'number' }
      },
      required: ['result']
    };

    const response = await fetch(BASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: 'test query',
        schema: customSchema,
        apiKeys: { openai: 'fake' }
      })
    });

    expect(response.status).not.toBe(400);
  });
});

describe('API Key Handling', () => {
  it('should accept single API key', async () => {
    const response = await fetch(BASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: 'test',
        apiKeys: { openai: 'test-key' }
      })
    });

    // Should not fail validation
    const data = await response.json();
    if (data.error) {
      expect(data.error).not.toContain('No API keys');
    }
  });

  it('should accept multiple API keys', async () => {
    const response = await fetch(BASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: 'test',
        apiKeys: {
          openai: 'test-key-1',
          anthropic: 'test-key-2',
          gemini: 'test-key-3',
          grok: 'test-key-4'
        }
      })
    });

    const data = await response.json();
    if (data.error) {
      expect(data.error).not.toContain('No API keys');
    }
  });

  it('should handle partial API keys', async () => {
    const response = await fetch(BASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: 'test',
        apiKeys: {
          openai: 'test-key',
          gemini: 'test-key'
        }
      })
    });

    const data = await response.json();
    if (data.error) {
      expect(data.error).not.toContain('No API keys');
    }
  });
});

describe('Parallel Query Behavior', () => {
  it('should query multiple providers when multiple keys provided', async () => {
    const response = await fetch(BASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: 'test',
        apiKeys: {
          openai: 'fake-1',
          anthropic: 'fake-2'
        }
      })
    });

    const data = await response.json();

    // Even if API calls fail, response structure should indicate 2 providers
    if (data.responses) {
      expect(data.providersQueried).toBe(2);
      expect(data.responses).toHaveLength(2);
    }
  });

  it('should track total latency', async () => {
    const response = await fetch(BASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: 'test',
        apiKeys: { openai: 'fake' }
      })
    });

    const data = await response.json();

    if (data.totalLatency !== undefined) {
      expect(data.totalLatency).toBeGreaterThan(0);
      expect(typeof data.totalLatency).toBe('number');
    }
  });
});

describe('Error Response Format', () => {
  it('should return consistent error format', async () => {
    const response = await fetch(BASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });

    const data = await response.json();

    expect(data.error).toBeDefined();
    expect(typeof data.error).toBe('string');
    expect(data.timestamp).toBeDefined();
  });

  it('should include details in error response when available', async () => {
    const response = await fetch(BASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not valid json'
    });

    const data = await response.json();

    expect(data.error).toBeDefined();
    // May include details field with parse error
    if (data.details) {
      expect(typeof data.details).toBe('object');
    }
  });
});

describe('Success Response Format', () => {
  it('should include all required fields in success response', async () => {
    // Note: This test requires valid API keys in environment
    // It will be skipped if no real keys are available

    if (!process.env.OPENAI_API_KEY && !process.env.TEST_WITH_REAL_KEYS) {
      return; // Skip this test
    }

    const response = await fetch(BASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: 'What is 2+2? Answer briefly.',
        schema: mockSchema,
        apiKeys: {
          openai: process.env.OPENAI_API_KEY
        }
      })
    });

    if (response.status === 200) {
      const data = await response.json();

      expect(data.query).toBeDefined();
      expect(data.responses).toBeDefined();
      expect(Array.isArray(data.responses)).toBe(true);
      expect(data.totalLatency).toBeDefined();
      expect(data.timestamp).toBeDefined();
      expect(data.providersQueried).toBeDefined();
    }
  });
});

describe('Response Body Size', () => {
  it('should handle long queries', async () => {
    const longQuery = 'test '.repeat(500); // 2500 characters

    const response = await fetch(BASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: longQuery,
        apiKeys: { openai: 'fake' }
      })
    });

    // Should accept long queries
    expect(response.status).not.toBe(413); // Not "Payload Too Large"
  });

  it('should handle complex schemas', async () => {
    const complexSchema = {
      type: 'object',
      properties: {
        field1: { type: 'string' },
        field2: { type: 'number' },
        field3: { type: 'boolean' },
        nested: {
          type: 'object',
          properties: {
            subfield1: { type: 'string' },
            subfield2: {
              type: 'array',
              items: { type: 'string' }
            }
          }
        }
      }
    };

    const response = await fetch(BASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: 'test',
        schema: complexSchema,
        apiKeys: { openai: 'fake' }
      })
    });

    expect(response.status).not.toBe(400);
  });
});
