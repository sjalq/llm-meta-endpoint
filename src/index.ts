/**
 * LLM Meta-Endpoint Worker
 * Queries multiple LLM APIs in parallel and returns combined structured JSON responses
 * Pure functional style with comprehensive error handling and logging
 */

// ============================================================================
// Types
// ============================================================================

interface Env {
	OPENAI_API_KEY?: string;
	ANTHROPIC_API_KEY?: string;
	GEMINI_API_KEY?: string;
	GROK_API_KEY?: string;
}

interface QueryRequest {
	query: string;
	schema?: any;
	apiKeys?: {
		openai?: string;
		anthropic?: string;
		gemini?: string;
		grok?: string;
	};
}

interface LLMResponse {
	provider: string;
	success: boolean;
	data?: any;
	error?: string;
	latency: number;
}

interface CombinedResponse {
	query: string;
	responses: LLMResponse[];
	totalLatency: number;
	timestamp: string;
	providersQueried: number;
}

interface LogEntry {
	level: 'INFO' | 'WARN' | 'ERROR';
	timestamp: string;
	message: string;
	context?: Record<string, any>;
}

type Result<T, E = Error> =
	| { success: true; value: T }
	| { success: false; error: E };

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_SCHEMA = {
	type: "object",
	properties: {
		answer: {
			type: "string",
			description: "The answer to the query"
		},
		confidence: {
			type: "number",
			description: "Confidence level from 0 to 1"
		}
	},
	required: ["answer", "confidence"],
	additionalProperties: false
} as const;

const LLM_CONFIGS = {
	openai: {
		name: 'OpenAI GPT-4',
		url: 'https://api.openai.com/v1/chat/completions',
		model: 'gpt-4o-2024-08-06'
	},
	anthropic: {
		name: 'Anthropic Claude',
		url: 'https://api.anthropic.com/v1/messages',
		model: 'claude-sonnet-4-20250514'
	},
	gemini: {
		name: 'Google Gemini',
		url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent',
		model: 'gemini-1.5-pro'
	},
	grok: {
		name: 'xAI Grok',
		url: 'https://api.x.ai/v1/chat/completions',
		model: 'grok-2-1212'
	}
} as const;

// ============================================================================
// Pure Utility Functions
// ============================================================================

const getCurrentTimestamp = (): string => new Date().toISOString();

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

const logToConsole = (entry: LogEntry): void => {
	const logMethod = entry.level === 'ERROR' ? console.error :
	                  entry.level === 'WARN' ? console.warn :
	                  console.log;

	logMethod(JSON.stringify(entry));
};

const log = (level: LogEntry['level']) => (message: string, context?: Record<string, any>): void => {
	logToConsole(createLogEntry(level, message, context));
};

const logInfo = log('INFO');
const logWarn = log('WARN');
const logError = log('ERROR');

const safeJsonParse = <T = any>(text: string): Result<T, string> => {
	try {
		return { success: true, value: JSON.parse(text) };
	} catch (error) {
		return {
			success: false,
			error: `JSON parse error: ${error instanceof Error ? error.message : 'Unknown error'}`
		};
	}
};

const createErrorResponse = (status: number, message: string, details?: any): Response => {
	logError(message, { status, details });
	return new Response(
		JSON.stringify({
			error: message,
			...(details && { details }),
			timestamp: getCurrentTimestamp()
		}),
		{
			status,
			headers: { 'Content-Type': 'application/json' }
		}
	);
};

const createSuccessResponse = (data: CombinedResponse): Response => {
	logInfo('Request completed successfully', {
		query: data.query.substring(0, 100),
		providersQueried: data.providersQueried,
		totalLatency: data.totalLatency
	});

	return new Response(JSON.stringify(data, null, 2), {
		status: 200,
		headers: {
			'Content-Type': 'application/json',
			'Access-Control-Allow-Origin': '*'
		}
	});
};

// ============================================================================
// Request Body Builders (Pure Functions)
// ============================================================================

const buildOpenAIRequestBody = (query: string, schema: any) => ({
	model: LLM_CONFIGS.openai.model,
	messages: [{ role: 'user' as const, content: query }],
	response_format: {
		type: 'json_schema' as const,
		json_schema: {
			name: 'response',
			strict: true,
			schema
		}
	}
});

const buildClaudeRequestBody = (query: string, schema: any) => ({
	model: LLM_CONFIGS.anthropic.model,
	max_tokens: 4096,
	tools: [{
		name: 'respond',
		description: 'Respond to the query with structured data',
		input_schema: schema
	}],
	tool_choice: {
		type: 'tool' as const,
		name: 'respond'
	},
	messages: [{ role: 'user' as const, content: query }]
});

const buildGeminiRequestBody = (query: string, schema: any) => ({
	contents: [{
		parts: [{ text: query }]
	}],
	generationConfig: {
		responseMimeType: 'application/json',
		responseSchema: schema
	}
});

const buildGrokRequestBody = (query: string, schema: any) => ({
	model: LLM_CONFIGS.grok.model,
	messages: [{ role: 'user' as const, content: query }],
	response_format: {
		type: 'json_schema' as const,
		json_schema: {
			name: 'response',
			strict: true,
			schema
		}
	}
});

// ============================================================================
// Response Parsers (Pure Functions)
// ============================================================================

const parseOpenAIResponse = (data: any): Result<any, string> => {
	try {
		const content = data?.choices?.[0]?.message?.content;
		if (!content) {
			return { success: false, error: 'No content in OpenAI response' };
		}
		return safeJsonParse(content);
	} catch (error) {
		return { success: false, error: `OpenAI parse error: ${error}` };
	}
};

const parseClaudeResponse = (data: any): Result<any, string> => {
	try {
		const toolUse = data?.content?.find((block: any) => block.type === 'tool_use');
		if (!toolUse?.input) {
			return { success: false, error: 'No tool_use in Claude response' };
		}
		return { success: true, value: toolUse.input };
	} catch (error) {
		return { success: false, error: `Claude parse error: ${error}` };
	}
};

const parseGeminiResponse = (data: any): Result<any, string> => {
	try {
		const content = data?.candidates?.[0]?.content?.parts?.[0]?.text;
		if (!content) {
			return { success: false, error: 'No content in Gemini response' };
		}
		return safeJsonParse(content);
	} catch (error) {
		return { success: false, error: `Gemini parse error: ${error}` };
	}
};

const parseGrokResponse = (data: any): Result<any, string> => {
	try {
		const content = data?.choices?.[0]?.message?.content;
		if (!content) {
			return { success: false, error: 'No content in Grok response' };
		}
		return safeJsonParse(content);
	} catch (error) {
		return { success: false, error: `Grok parse error: ${error}` };
	}
};

// ============================================================================
// LLM Query Functions (Side Effects)
// ============================================================================

const createLLMQueryFunction = (
	provider: string,
	url: string,
	buildHeaders: (apiKey: string) => Record<string, string>,
	buildBody: (query: string, schema: any) => any,
	parseResponse: (data: any) => Result<any, string>,
	urlModifier?: (url: string, apiKey: string) => string
) => async (query: string, schema: any, apiKey: string): Promise<LLMResponse> => {
	const startTime = Date.now();

	logInfo(`Querying ${provider}`, { query: query.substring(0, 100) });

	try {
		const finalUrl = urlModifier ? urlModifier(url, apiKey) : url;
		const response = await fetch(finalUrl, {
			method: 'POST',
			headers: buildHeaders(apiKey),
			body: JSON.stringify(buildBody(query, schema))
		});

		const responseText = await response.text();
		const latency = Date.now() - startTime;

		if (!response.ok) {
			const errorMsg = `${provider} API error: ${response.status} ${response.statusText}`;
			logWarn(errorMsg, {
				status: response.status,
				responsePreview: responseText.substring(0, 200)
			});
			return {
				provider,
				success: false,
				error: errorMsg,
				latency
			};
		}

		const jsonParseResult = safeJsonParse(responseText);
		if (!jsonParseResult.success) {
			logError(`${provider} JSON parse failed`, { error: jsonParseResult.error });
			return {
				provider,
				success: false,
				error: jsonParseResult.error,
				latency
			};
		}

		const dataParseResult = parseResponse(jsonParseResult.value);
		if (!dataParseResult.success) {
			logError(`${provider} response parse failed`, { error: dataParseResult.error });
			return {
				provider,
				success: false,
				error: dataParseResult.error,
				latency
			};
		}

		logInfo(`${provider} query successful`, { latency });
		return {
			provider,
			success: true,
			data: dataParseResult.value,
			latency
		};
	} catch (error) {
		const latency = Date.now() - startTime;
		const errorMsg = error instanceof Error ? error.message : 'Unknown error';
		logError(`${provider} query failed`, { error: errorMsg, latency });
		return {
			provider,
			success: false,
			error: errorMsg,
			latency
		};
	}
};

const queryOpenAI = createLLMQueryFunction(
	LLM_CONFIGS.openai.name,
	LLM_CONFIGS.openai.url,
	(apiKey) => ({
		'Content-Type': 'application/json',
		'Authorization': `Bearer ${apiKey}`
	}),
	buildOpenAIRequestBody,
	parseOpenAIResponse
);

const queryClaude = createLLMQueryFunction(
	LLM_CONFIGS.anthropic.name,
	LLM_CONFIGS.anthropic.url,
	(apiKey) => ({
		'Content-Type': 'application/json',
		'x-api-key': apiKey,
		'anthropic-version': '2023-06-01'
	}),
	buildClaudeRequestBody,
	parseClaudeResponse
);

const queryGemini = createLLMQueryFunction(
	LLM_CONFIGS.gemini.name,
	LLM_CONFIGS.gemini.url,
	() => ({
		'Content-Type': 'application/json'
	}),
	buildGeminiRequestBody,
	parseGeminiResponse,
	(url, apiKey) => `${url}?key=${apiKey}`
);

const queryGrok = createLLMQueryFunction(
	LLM_CONFIGS.grok.name,
	LLM_CONFIGS.grok.url,
	(apiKey) => ({
		'Content-Type': 'application/json',
		'Authorization': `Bearer ${apiKey}`
	}),
	buildGrokRequestBody,
	parseGrokResponse
);

// ============================================================================
// Main Business Logic (Pure Functions)
// ============================================================================

const validateRequest = (requestData: any): Result<QueryRequest, string> => {
	if (!requestData || typeof requestData !== 'object') {
		return { success: false, error: 'Invalid request body' };
	}

	if (!requestData.query || typeof requestData.query !== 'string') {
		return { success: false, error: 'Missing required field: query' };
	}

	if (requestData.query.trim().length === 0) {
		return { success: false, error: 'Query cannot be empty' };
	}

	return { success: true, value: requestData as QueryRequest };
};

const resolveApiKeys = (requestData: QueryRequest, env: Env) => ({
	openai: requestData.apiKeys?.openai || env.OPENAI_API_KEY,
	anthropic: requestData.apiKeys?.anthropic || env.ANTHROPIC_API_KEY,
	gemini: requestData.apiKeys?.gemini || env.GEMINI_API_KEY,
	grok: requestData.apiKeys?.grok || env.GROK_API_KEY
});

const buildLLMPromises = (
	query: string,
	schema: any,
	apiKeys: ReturnType<typeof resolveApiKeys>
): Promise<LLMResponse>[] => {
	const promises: Promise<LLMResponse>[] = [];

	if (apiKeys.openai) promises.push(queryOpenAI(query, schema, apiKeys.openai));
	if (apiKeys.anthropic) promises.push(queryClaude(query, schema, apiKeys.anthropic));
	if (apiKeys.gemini) promises.push(queryGemini(query, schema, apiKeys.gemini));
	if (apiKeys.grok) promises.push(queryGrok(query, schema, apiKeys.grok));

	return promises;
};

const createCombinedResponse = (
	query: string,
	responses: LLMResponse[],
	totalLatency: number
): CombinedResponse => ({
	query,
	responses,
	totalLatency,
	timestamp: getCurrentTimestamp(),
	providersQueried: responses.length
});

// ============================================================================
// Main Handler
// ============================================================================

const handleRequest = async (request: Request, env: Env): Promise<Response> => {
	const overallStartTime = Date.now();

	logInfo('Received request', {
		method: request.method,
		url: request.url
	});

	// Validate HTTP method
	if (request.method !== 'POST') {
		return createErrorResponse(405, 'Method not allowed. Use POST.');
	}

	// Parse and validate request body
	let requestData: any;
	try {
		requestData = await request.json();
	} catch (error) {
		return createErrorResponse(400, 'Invalid JSON in request body', {
			parseError: error instanceof Error ? error.message : 'Unknown error'
		});
	}

	const validationResult = validateRequest(requestData);
	if (!validationResult.success) {
		return createErrorResponse(400, validationResult.error);
	}

	const queryRequest = validationResult.value;
	const schema = queryRequest.schema || DEFAULT_SCHEMA;
	const apiKeys = resolveApiKeys(queryRequest, env);

	// Build promises for available LLMs
	const promises = buildLLMPromises(queryRequest.query, schema, apiKeys);

	if (promises.length === 0) {
		return createErrorResponse(
			400,
			'No API keys provided. Include apiKeys in request body or configure environment variables.'
		);
	}

	logInfo('Querying LLMs in parallel', { count: promises.length });

	// Execute all queries in parallel
	let responses: LLMResponse[];
	try {
		responses = await Promise.all(promises);
	} catch (error) {
		return createErrorResponse(500, 'Failed to query LLMs', {
			error: error instanceof Error ? error.message : 'Unknown error'
		});
	}

	const totalLatency = Date.now() - overallStartTime;
	const result = createCombinedResponse(queryRequest.query, responses, totalLatency);

	return createSuccessResponse(result);
};

// ============================================================================
// Cloudflare Worker Export
// ============================================================================

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		try {
			return await handleRequest(request, env);
		} catch (error) {
			logError('Unhandled error in worker', {
				error: error instanceof Error ? error.message : 'Unknown error',
				stack: error instanceof Error ? error.stack : undefined
			});
			return createErrorResponse(500, 'Internal server error');
		}
	}
} satisfies ExportedHandler<Env>;
