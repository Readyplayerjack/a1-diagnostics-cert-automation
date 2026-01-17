import { loadConfig } from '../config/index.js';
import { withTimeout, TimeoutError } from '../utils/with-timeout.js';
import { retryWithBackoff, isRetryableError } from '../utils/retry.js';
import { openaiRateLimiter, estimateTokens } from '../utils/rate-limiter.js';
import { info, warn } from '../services/logger.js';
import { validate, openAiExtractionResponseSchema } from '../utils/validation.js';

export type OpenAiExtractionErrorCode =
  | 'OPENAI_CONFIG_ERROR'
  | 'OPENAI_API_ERROR'
  | 'OPENAI_INVALID_RESPONSE';

export class OpenAiExtractionError extends Error {
  public readonly code: OpenAiExtractionErrorCode;

  constructor(code: OpenAiExtractionErrorCode, message: string) {
    super(message);
    this.name = 'OpenAiExtractionError';
    this.code = code;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, OpenAiExtractionError);
    }
  }
}

export interface OpenAiExtractionRequest {
  conversationText: string;
  regexCandidates: {
    regs: string[];
    mileages: string[];
  };
}

export interface OpenAiExtractionResponse {
  vehicleRegistration: string | null;
  vehicleMileage: string | null;
  registrationConfidence: number;
  mileageConfidence: number;
  reasoning?: string;
}

interface ChatCompletionMessage {
  role: 'system' | 'user';
  content: string;
}

interface ChatCompletionChoice {
  message: {
    content: string;
  };
}

interface ChatCompletionResponse {
  choices: ChatCompletionChoice[];
}

interface OpenAiConfig {
  apiKey: string;
  baseUrl: string;
}

export interface OpenAiExtractionClient {
  extractRegAndMileage(
    params: OpenAiExtractionRequest
  ): Promise<OpenAiExtractionResponse>;
}

export class HttpOpenAiExtractionClient implements OpenAiExtractionClient {
  private readonly config: OpenAiConfig;

  constructor() {
    const env = loadConfig();
    const apiKey = env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new OpenAiExtractionError(
        'OPENAI_CONFIG_ERROR',
        'OPENAI_API_KEY is not configured'
      );
    }

    this.config = {
      apiKey,
      baseUrl: env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1',
    };
  }

  async extractRegAndMileage(
    params: OpenAiExtractionRequest
  ): Promise<OpenAiExtractionResponse> {
    const prompt = this.buildPrompt(params);
    const estimatedTokens = estimateTokens(prompt);

    return openaiRateLimiter.throttle(
      async () => {
        return retryWithBackoff(
          async () => {
            return withTimeout(
              this.executeExtraction(prompt),
              60000, // 60 second timeout for OpenAI (GPT can be slow)
              'OpenAI extraction'
            );
          },
          {
            maxRetries: 3,
            initialDelay: 2000, // Longer initial delay for OpenAI
            maxDelay: 20000,
            operation: 'OpenAI extraction',
            isRetryable: isRetryableError,
          }
        );
      },
      estimatedTokens
    );
  }

  /**
   * Executes the actual OpenAI API call (internal, used by extractRegAndMileage()).
   */
  private async executeExtraction(prompt: string): Promise<OpenAiExtractionResponse> {
    const messages: ChatCompletionMessage[] = [
      {
        role: 'system',
        content:
          'You are a precise extraction engine. Extract at most one UK vehicle registration and one odometer mileage reading from the conversation. ' +
          'If you are not confident, return nulls. Respond with STRICT JSON only, no extra text, matching exactly the given schema.',
      },
      {
        role: 'user',
        content: prompt,
      },
    ];

    const body = {
      model: 'gpt-4o-mini',
      messages,
      temperature: 0,
    };

    let response: Response;
    try {
      response = await fetch(`${this.config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
    } catch (error) {
      throw new OpenAiExtractionError('OPENAI_API_ERROR', 'Failed to call OpenAI API');
    }

    if (!response.ok) {
      throw new OpenAiExtractionError(
        'OPENAI_API_ERROR',
        `OpenAI API returned ${response.status} ${response.statusText}`
      );
    }

    let data: ChatCompletionResponse & { usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } };
    try {
      data = (await response.json()) as ChatCompletionResponse & {
        usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
      };
    } catch (error) {
      throw new OpenAiExtractionError(
        'OPENAI_API_ERROR',
        'Failed to parse OpenAI API response as JSON'
      );
    }

    // Log token usage for cost monitoring (do NOT log prompt or response content)
    if (data.usage) {
      const tokensUsed = data.usage.total_tokens ?? 0;
      const inputTokens = data.usage.prompt_tokens ?? 0;
      const outputTokens = data.usage.completion_tokens ?? 0;
      // Calculate estimated cost: $0.15/1M input, $0.60/1M output for gpt-4o-mini
      const estimatedCost = (inputTokens / 1_000_000) * 0.15 + (outputTokens / 1_000_000) * 0.6;
      
      info('OpenAI API token usage', {
        operation: 'extract_reg_mileage',
        tokensUsed,
        inputTokens,
        outputTokens,
        estimatedCostUSD: estimatedCost.toFixed(6),
        // Do NOT log: prompt, response, extracted values (contains customer data)
      });
    }

    const content = data.choices[0]?.message?.content;
    if (!content) {
      throw new OpenAiExtractionError(
        'OPENAI_INVALID_RESPONSE',
        'OpenAI API response had no content'
      );
    }

    const parsed = this.parseJson(content);
    if (!parsed) {
      return {
        vehicleRegistration: null,
        vehicleMileage: null,
        registrationConfidence: 0,
        mileageConfidence: 0,
        reasoning: 'Failed to parse OpenAI response as valid JSON',
      };
    }

    // Validate the parsed response against schema
    try {
      const validated = validate(openAiExtractionResponseSchema, parsed);
      return validated;
    } catch (validationError) {
      warn('OpenAI response validation failed', {
        operation: 'extract_reg_mileage',
        error: validationError instanceof Error ? validationError.message : String(validationError),
        // Do NOT log parsed content (contains customer data)
      });
      // Return parsed anyway (graceful degradation)
      return parsed;
    }
  }

  private buildPrompt(params: OpenAiExtractionRequest): string {
    const { conversationText, regexCandidates } = params;

    const normalisedText = conversationText
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const regsLabel =
      regexCandidates.regs.length > 0
        ? regexCandidates.regs.join(', ')
        : 'None';
    const mileagesLabel =
      regexCandidates.mileages.length > 0
        ? regexCandidates.mileages.join(', ')
        : 'None';

    return [
      'Task: From the conversation below, extract exactly one UK vehicle registration and one odometer mileage reading if you can do so with high confidence.',
      '',
      'Rules:',
      '- Use the most recent correction if the user says earlier values were wrong.',
      '- Never guess. If you are not confident, return null for that field.',
      '- The registration must be a real UK plate in formats like AA11 AAA (with or without a space).',
      '- Mileage should be a numeric odometer reading (e.g. 12345, 45,000), usually in miles.',
      '',
      'Conversation text (chronological):',
      normalisedText,
      '',
      'Regex candidates (may contain outdated or incorrect values; prefer the latest valid correction in the conversation):',
      `Registrations: ${regsLabel}`,
      `Mileages: ${mileagesLabel}`,
      '',
      'Respond with STRICT JSON ONLY, no markdown, no explanation outside the JSON, matching this TypeScript type exactly:',
      '{',
      '  "vehicleRegistration": string | null,',
      '  "vehicleMileage": string | null,',
      '  "registrationConfidence": number,',
      '  "mileageConfidence": number,',
      '  "reasoning": string',
      '}',
    ].join('\n');
  }

  private parseJson(content: string): OpenAiExtractionResponse | null {
    const firstBrace = content.indexOf('{');
    const lastBrace = content.lastIndexOf('}');
    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
      return null;
    }

    const jsonSubstring = content.slice(firstBrace, lastBrace + 1);
    try {
      const parsed = JSON.parse(jsonSubstring) as {
        vehicleRegistration: unknown;
        vehicleMileage: unknown;
        registrationConfidence: unknown;
        mileageConfidence: unknown;
        reasoning?: unknown;
      };

      return {
        vehicleRegistration:
          typeof parsed.vehicleRegistration === 'string'
            ? parsed.vehicleRegistration
            : null,
        vehicleMileage:
          typeof parsed.vehicleMileage === 'string'
            ? parsed.vehicleMileage
            : null,
        registrationConfidence:
          typeof parsed.registrationConfidence === 'number'
            ? parsed.registrationConfidence
            : 0,
        mileageConfidence:
          typeof parsed.mileageConfidence === 'number'
            ? parsed.mileageConfidence
            : 0,
        reasoning:
          typeof parsed.reasoning === 'string' ? parsed.reasoning : undefined,
      };
    } catch {
      return null;
    }
  }
}


