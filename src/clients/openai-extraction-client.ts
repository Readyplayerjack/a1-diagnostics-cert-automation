import { loadConfig } from '../config/index.js';

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

    let data: ChatCompletionResponse;
    try {
      data = (await response.json()) as ChatCompletionResponse;
    } catch (error) {
      throw new OpenAiExtractionError(
        'OPENAI_API_ERROR',
        'Failed to parse OpenAI API response as JSON'
      );
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

    return parsed;
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


