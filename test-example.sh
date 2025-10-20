#!/bin/bash

# Example test script for the LLM Meta-Endpoint Worker
# Make sure the worker is running (npm run dev) before running this script

# Set your API keys here (or use .dev.vars file)
OPENAI_KEY="${OPENAI_API_KEY:-your-openai-key}"
ANTHROPIC_KEY="${ANTHROPIC_API_KEY:-your-anthropic-key}"
GEMINI_KEY="${GEMINI_API_KEY:-your-gemini-key}"
GROK_KEY="${GROK_API_KEY:-your-grok-key}"

ENDPOINT="http://localhost:8787"

echo "Testing LLM Meta-Endpoint Worker..."
echo "=================================="
echo ""

# Test 1: Simple query with default schema
echo "Test 1: Simple query with default schema"
echo "-----------------------------------------"
curl -X POST "$ENDPOINT" \
  -H "Content-Type: application/json" \
  -d "{
    \"query\": \"What is the capital of France?\",
    \"apiKeys\": {
      \"openai\": \"$OPENAI_KEY\",
      \"anthropic\": \"$ANTHROPIC_KEY\",
      \"gemini\": \"$GEMINI_KEY\",
      \"grok\": \"$GROK_KEY\"
    }
  }" | jq '.'

echo ""
echo ""

# Test 2: Query with custom schema (only query OpenAI and Claude for this test)
echo "Test 2: Product review analysis with custom schema"
echo "---------------------------------------------------"
curl -X POST "$ENDPOINT" \
  -H "Content-Type: application/json" \
  -d "{
    \"query\": \"Analyze this product review: 'Great phone, amazing camera but battery life is disappointing.'\",
    \"apiKeys\": {
      \"openai\": \"$OPENAI_KEY\",
      \"anthropic\": \"$ANTHROPIC_KEY\"
    },
    \"schema\": {
      \"type\": \"object\",
      \"properties\": {
        \"sentiment\": {
          \"type\": \"string\",
          \"enum\": [\"positive\", \"negative\", \"neutral\"],
          \"description\": \"Overall sentiment\"
        },
        \"aspects\": {
          \"type\": \"array\",
          \"items\": {
            \"type\": \"object\",
            \"properties\": {
              \"feature\": {
                \"type\": \"string\",
                \"description\": \"Product feature mentioned\"
              },
              \"sentiment\": {
                \"type\": \"string\",
                \"enum\": [\"positive\", \"negative\", \"neutral\"]
              }
            },
            \"required\": [\"feature\", \"sentiment\"],
            \"additionalProperties\": false
          }
        },
        \"score\": {
          \"type\": \"number\",
          \"description\": \"Rating from 1-10\"
        }
      },
      \"required\": [\"sentiment\", \"aspects\", \"score\"],
      \"additionalProperties\": false
    }
  }" | jq '.'

echo ""
echo ""

# Test 3: Math problem with structured output (only Gemini for this test)
echo "Test 3: Math problem with step-by-step solution"
echo "------------------------------------------------"
curl -X POST "$ENDPOINT" \
  -H "Content-Type: application/json" \
  -d "{
    \"query\": \"Solve: If a train travels 120 km in 2 hours, what is its average speed?\",
    \"apiKeys\": {
      \"gemini\": \"$GEMINI_KEY\"
    },
    \"schema\": {
      \"type\": \"object\",
      \"properties\": {
        \"steps\": {
          \"type\": \"array\",
          \"items\": {
            \"type\": \"string\"
          },
          \"description\": \"Step-by-step solution\"
        },
        \"answer\": {
          \"type\": \"string\",
          \"description\": \"Final answer\"
        },
        \"unit\": {
          \"type\": \"string\",
          \"description\": \"Unit of measurement\"
        }
      },
      \"required\": [\"steps\", \"answer\", \"unit\"],
      \"additionalProperties\": false
    }
  }" | jq '.'

echo ""
echo "Tests completed!"
