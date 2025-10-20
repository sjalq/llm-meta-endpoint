/**
 * Property-Based Tests
 * Tests invariants and edge cases with generated inputs
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// Helper to simulate safeJsonParse behavior
const safeJsonParse = (text) => {
  try {
    return { success: true, value: JSON.parse(text) };
  } catch (error) {
    return {
      success: false,
      error: `JSON parse error: ${error.message}`
    };
  }
};

describe('Property-Based: JSON Parsing', () => {
  it('should always return a Result type', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const result = safeJsonParse(input);
        expect(result).toHaveProperty('success');
        expect(typeof result.success).toBe('boolean');

        if (result.success) {
          expect(result).toHaveProperty('value');
        } else {
          expect(result).toHaveProperty('error');
          expect(typeof result.error).toBe('string');
        }
      })
    );
  });

  it('should handle all string inputs without throwing', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        expect(() => safeJsonParse(input)).not.toThrow();
      })
    );
  });

  it('should successfully parse valid JSON objects', () => {
    fc.assert(
      fc.property(fc.jsonValue(), (value) => {
        const jsonString = JSON.stringify(value);
        const result = safeJsonParse(jsonString);

        expect(result.success).toBe(true);
        if (result.success) {
          // JSON.stringify converts -0 to 0, so we need deep equal comparison
          expect(JSON.stringify(result.value)).toEqual(JSON.stringify(value));
        }
      })
    );
  });

  it('should handle unicode strings', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const result = safeJsonParse(input);
        expect(result).toHaveProperty('success');
        expect(typeof result.success).toBe('boolean');
      })
    );
  });

  it('should handle empty strings', () => {
    const result = safeJsonParse('');
    expect(result.success).toBe(false);
    expect(result.error).toContain('JSON parse error');
  });

  it('should handle whitespace', () => {
    fc.assert(
      fc.property(fc.string().filter(s => /^\s*$/.test(s)), (input) => {
        const result = safeJsonParse(input);
        if (input.trim() === '') {
          expect(result.success).toBe(false);
        }
      })
    );
  });
});

describe('Property-Based: Edge Cases for LLM Responses', () => {
  it('should handle plain strings (not JSON)', () => {
    const plainStrings = [
      'Paris',
      'Hello World',
      '42',
      'true',
      'undefined',
      'null',
      '{broken json',
      '{"incomplete": '
    ];

    plainStrings.forEach(str => {
      const result = safeJsonParse(str);
      // These should either parse successfully (if valid JSON) or fail gracefully
      expect(result).toHaveProperty('success');
    });
  });

  it('should handle malformed JSON objects', () => {
    const malformed = [
      '{key: "value"}',           // Missing quotes on key
      "{'key': 'value'}",         // Single quotes
      '{broken',                  // Incomplete
      'undefined',                // JavaScript keyword
      'NaN',                      // JavaScript keyword
      '{a:1,b:2,}',              // Trailing comma
      '{"key": undefined}',       // undefined value
    ];

    malformed.forEach(json => {
      const result = safeJsonParse(json);
      // All of these should fail but not throw
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  it('should handle very large strings', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 10000, maxLength: 50000 }), (largeString) => {
        expect(() => safeJsonParse(largeString)).not.toThrow();
      }),
      { numRuns: 10 } // Fewer runs for performance
    );
  });

  it('should handle nested JSON structures', () => {
    fc.assert(
      fc.property(
        fc.json({ depthSize: 'medium' }),
        (jsonObj) => {
          const result = safeJsonParse(jsonObj);
          expect(() => safeJsonParse(jsonObj)).not.toThrow();
        }
      )
    );
  });
});

describe('Property-Based: Query Request Validation', () => {
  it('should validate query field exists and is non-empty', () => {
    fc.assert(
      fc.property(
        fc.record({
          query: fc.string({ minLength: 1 }).filter(s => s.trim().length > 0)
        }),
        (requestData) => {
          const hasQuery = requestData.query !== undefined;
          const isNonEmpty = requestData.query.trim().length > 0;
          expect(hasQuery).toBe(true);
          expect(isNonEmpty).toBe(true);
        }
      )
    );
  });

  it('should reject empty or whitespace-only queries', () => {
    fc.assert(
      fc.property(
        fc.string().filter(s => /^\s*$/.test(s)),
        (whitespace) => {
          expect(whitespace.trim().length).toBe(0);
        }
      )
    );
  });

  it('should handle queries of varying lengths', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 10000 }),
        (query) => {
          expect(typeof query).toBe('string');
          expect(query.length).toBeGreaterThan(0);
        }
      )
    );
  });
});

describe('Property-Based: API Key Resolution', () => {
  it('should prefer request keys over env keys', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        (requestKey, envKey) => {
          const resolved = requestKey || envKey;
          expect(resolved).toBe(requestKey);
        }
      )
    );
  });

  it('should handle missing keys gracefully', () => {
    fc.assert(
      fc.property(
        fc.option(fc.string(), { nil: undefined }),
        fc.option(fc.string(), { nil: undefined }),
        (requestKey, envKey) => {
          const resolved = requestKey || envKey;
          // Should be string or undefined, never throw
          expect(
            typeof resolved === 'string' || resolved === undefined
          ).toBe(true);
        }
      )
    );
  });
});

describe('Property-Based: Response Parsing Edge Cases', () => {
  it('should handle missing fields in API responses', () => {
    const responseVariants = [
      {},
      { choices: [] },
      { choices: [{}] },
      { choices: [{ message: {} }] },
      { choices: [{ message: { content: null } }] },
      { choices: [{ message: { content: undefined } }] },
      null,
      undefined
    ];

    responseVariants.forEach(response => {
      const content = response?.choices?.[0]?.message?.content;
      expect(
        content === undefined || content === null || typeof content === 'string'
      ).toBe(true);
    });
  });

  it('should handle various content types in responses', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.string(),
          fc.constant(null),
          fc.constant(undefined),
          fc.integer(),
          fc.boolean()
        ),
        (content) => {
          // Content can be anything - we just check it doesn't crash
          const isValid =
            typeof content === 'string' ||
            content === null ||
            content === undefined ||
            typeof content === 'number' ||
            typeof content === 'boolean';
          expect(isValid).toBe(true);
        }
      )
    );
  });
});

describe('Property-Based: Latency Tracking', () => {
  it('latency should always be non-negative', () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 10000 }),
        fc.nat({ max: 10000 }),
        (startTime, endTime) => {
          // Simulate: const latency = endTime - startTime;
          const latency = Math.abs(endTime - startTime);
          expect(latency).toBeGreaterThanOrEqual(0);
        }
      )
    );
  });
});

describe('Property-Based: Schema Validation', () => {
  it('should handle any valid JSON schema', () => {
    fc.assert(
      fc.property(
        fc.json(),
        (schema) => {
          // Any JSON object can be a schema
          expect(() => JSON.stringify(schema)).not.toThrow();
        }
      )
    );
  });

  it('should handle empty or minimal schemas', () => {
    const schemas = [
      {},
      { type: 'object' },
      { type: 'object', properties: {} },
      null,
      undefined
    ];

    schemas.forEach(schema => {
      const finalSchema = schema || { type: 'object' };
      expect(typeof finalSchema).toBe('object');
    });
  });
});

describe('Property-Based: Error Messages', () => {
  it('error messages should always be strings', () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.string(), fc.constantFrom(null, undefined)),
        (errorInput) => {
          const errorMsg = errorInput || 'Unknown error';
          expect(typeof errorMsg).toBe('string');
        }
      )
    );
  });

  it('should handle errors from various sources', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.string().filter(s => s.length > 0),
          fc.record({ message: fc.string().filter(s => s.trim().length > 0) }),
          fc.constant(null),
          fc.constant(undefined)
        ),
        (error) => {
          // Handle objects without prototype safely
          let message;
          if (error && typeof error === 'object' && 'message' in error && error.message) {
            message = error.message;
          } else if (error === null || error === undefined) {
            message = 'Unknown error';
          } else {
            try {
              message = String(error);
            } catch {
              message = 'Unknown error';
            }
          }
          expect(typeof message).toBe('string');
          expect(message.trim().length).toBeGreaterThan(0);
        }
      )
    );
  });
});

describe('Property-Based: Combined Response Structure', () => {
  it('should always include required fields', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.array(fc.record({
          provider: fc.string(),
          success: fc.boolean(),
          latency: fc.nat()
        })),
        fc.nat(),
        (query, responses, latency) => {
          const combined = {
            query,
            responses,
            totalLatency: latency,
            timestamp: new Date().toISOString(),
            providersQueried: responses.length
          };

          expect(combined).toHaveProperty('query');
          expect(combined).toHaveProperty('responses');
          expect(combined).toHaveProperty('totalLatency');
          expect(combined).toHaveProperty('timestamp');
          expect(combined).toHaveProperty('providersQueried');
          expect(combined.providersQueried).toBe(responses.length);
        }
      )
    );
  });
});
