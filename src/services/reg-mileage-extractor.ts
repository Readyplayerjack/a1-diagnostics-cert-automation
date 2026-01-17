/**
 * Error codes for registration and mileage extraction failures.
 */
import type { JifelineApiClient } from '../clients/jifeline-api-client.js';
import type {
  OpenAiExtractionClient,
  OpenAiExtractionResponse,
} from '../clients/openai-extraction-client.js';
import { warn } from './logger.js';

export type RegMileageExtractionErrorCode =
  | 'NO_CONVERSATION_DATA'
  | 'CONVERSATION_FETCH_FAILED'
  | 'REGISTRATION_NOT_FOUND'
  | 'MILEAGE_NOT_FOUND'
  | 'REGISTRATION_AMBIGUOUS'
  | 'MILEAGE_AMBIGUOUS'
  | 'REGISTRATION_INVALID_FORMAT'
  | 'MILEAGE_INVALID_FORMAT'
  | 'EXTRACTION_TIMEOUT'
  | 'UNKNOWN_ERROR';

/**
 * Severity level for extraction errors.
 * - 'error': System/infrastructure failure or critical extraction problem
 * - 'warning': Data quality issue (e.g., low confidence, ambiguous results)
 */
export type ExtractionErrorSeverity = 'error' | 'warning';

/**
 * Structured error for registration/mileage extraction failures.
 */
export class RegMileageExtractionError extends Error {
  public readonly code: RegMileageExtractionErrorCode;
  public readonly severity: ExtractionErrorSeverity;

  constructor(
    code: RegMileageExtractionErrorCode,
    message: string,
    severity: ExtractionErrorSeverity = 'warning'
  ) {
    super(message);
    this.name = 'RegMileageExtractionError';
    this.code = code;
    this.severity = severity;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, RegMileageExtractionError);
    }
  }
}

/**
 * Input parameters for registration and mileage extraction.
 */
export interface RegMileageExtractionInput {
  /** Jifeline ticket UUID */
  ticketId: string;
  /** Sequential ticket number */
  ticketNumber: number;
  /** Optional pre-fetched conversation text (if provided, extractor may skip fetching) */
  conversationText?: string;
}

/**
 * Source snippets showing where extracted values were found in the conversation.
 */
export interface ExtractionSourceSnippets {
  /** Snippet of conversation text containing the registration number */
  registration?: string;
  /** Snippet of conversation text containing the mileage value */
  mileage?: string;
}

/**
 * Result of registration and mileage extraction.
 *
 * Extraction failures (no data, low confidence, ambiguous) are represented
 * in errors and null values, not thrown. Only system/infrastructure failures
 * should result in thrown errors.
 */
export interface RegMileageExtractionResult {
  /** Extracted vehicle registration number, or null if not found/low confidence */
  vehicleRegistration: string | null;
  /** Extracted vehicle mileage, or null if not found/low confidence */
  vehicleMileage: string | null;
  /** Confidence score for registration extraction (0-1, where 1 is highest confidence) */
  registrationConfidence: number;
  /** Confidence score for mileage extraction (0-1, where 1 is highest confidence) */
  mileageConfidence: number;
  /** Array of extraction errors/warnings encountered during processing */
  errors: RegMileageExtractionError[];
  /** Optional source snippets showing where values were found */
  sourceSnippets?: ExtractionSourceSnippets;
}

/**
 * Interface for extracting vehicle registration and mileage from ticket conversations.
 *
 * This interface will be implemented by a real extractor that:
 * - Fetches conversation/chat data from Jifeline API (or uses pre-fetched text)
 * - Uses regex patterns to identify UK vehicle registration formats
 * - Uses LLM/AI to extract mileage values from natural language
 * - Validates extracted values and assigns confidence scores
 * - Handles ambiguous or missing data gracefully
 *
 * TODO: Implement real extraction logic using:
 * - Jifeline API conversation/message endpoints (e.g., GET /v2/tickets/{id}/messages)
 * - Regex patterns for UK registration formats (e.g., AB12 CDE, AB12CDE, etc.)
 * - LLM/AI service for natural language mileage extraction
 * - Confidence scoring based on pattern match quality and context
 */
export interface RegMileageExtractor {
  /**
   * Extracts vehicle registration and mileage from ticket conversation data.
   *
   * @param input Extraction input containing ticketId, ticketNumber, and optional conversationText
   * @returns Extraction result with values, confidence scores, and any errors/warnings
   * @throws {Error} Only for system/infrastructure failures (e.g., cannot fetch conversation from API)
   */
  extract(input: RegMileageExtractionInput): Promise<RegMileageExtractionResult>;
}

/**
 * System-level error for registration/mileage extraction failures.
 * This is used to signal infrastructure issues (e.g. OpenAI or Jifeline failures)
 * and is treated as non-critical by the certificate pipeline.
 */
export class RegMileageSystemError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RegMileageSystemError';
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, RegMileageSystemError);
    }
  }
}

/**
 * Stub implementation of RegMileageExtractor that always returns null values.
 *
 * This implementation:
 * - Always returns null for vehicleRegistration and vehicleMileage
 * - Sets confidence scores to 0
 * - Includes a warning error indicating no conversation data is available
 *
 * TODO: Replace with real implementation that:
 * - Fetches conversation data from Jifeline API (e.g., GET /v2/tickets/{id}/messages or similar)
 * - Uses regex patterns to extract UK vehicle registration numbers
 * - Uses LLM/AI to extract mileage from natural language conversation
 * - Validates and scores extracted values
 * - Handles ambiguous cases (multiple matches, low confidence, etc.)
 */
export class StubRegMileageExtractor implements RegMileageExtractor {
  /**
   * Always returns null values with zero confidence and a warning error.
   */
  async extract(_input: RegMileageExtractionInput): Promise<RegMileageExtractionResult> {
    return {
      vehicleRegistration: null,
      vehicleMileage: null,
      registrationConfidence: 0,
      mileageConfidence: 0,
      errors: [
        new RegMileageExtractionError(
          'NO_CONVERSATION_DATA',
          'Stub implementation: conversation data extraction not yet implemented',
          'warning'
        ),
      ],
    };
  }
}

interface RegexExtractionResult {
  registrations: string[];
  mileages: number[];
  registrationSnippets: string[];
  mileageSnippets: string[];
}

/**
 * Real implementation of RegMileageExtractor that combines:
 * - Regex-based extraction for UK registrations and mileage
 * - GPT-4o-mini fallback via OpenAiExtractionClient for ambiguous/missing data
 */
export class RealRegMileageExtractor implements RegMileageExtractor {
  private readonly apiClient: JifelineApiClient;
  private readonly openAiClient: OpenAiExtractionClient;

  constructor(apiClient: JifelineApiClient, openAiClient: OpenAiExtractionClient) {
    this.apiClient = apiClient;
    this.openAiClient = openAiClient;
  }

  async extract(input: RegMileageExtractionInput): Promise<RegMileageExtractionResult> {
    const { ticketId, ticketNumber, conversationText } = input;

    let text = conversationText ?? null;
    if (!text) {
      try {
        text = await this.apiClient.getTicketConversationText(ticketId);
      } catch (error) {
        throw new RegMileageSystemError(
          'Failed to fetch conversation from Jifeline'
        );
      }
    }

    if (!text) {
      return {
        vehicleRegistration: null,
        vehicleMileage: null,
        registrationConfidence: 0,
        mileageConfidence: 0,
        errors: [
          new RegMileageExtractionError(
            'NO_CONVERSATION_DATA',
            'No conversation text available for extraction',
            'warning'
          ),
        ],
      };
    }

    const normalisedText = this.normaliseText(text);
    const regexResult = this.regexExtract(normalisedText);

    const registrationCandidates = regexResult.registrations;
    const mileageCandidates = regexResult.mileages;

    const hasSingleReg = registrationCandidates.length === 1;
    const hasSingleMileage = mileageCandidates.length === 1;

    if (hasSingleReg && hasSingleMileage) {
      const vehicleRegistration = this.validateRegistration(registrationCandidates[0]);
      const vehicleMileage = this.validateMileage(mileageCandidates[0]);

      const errors: RegMileageExtractionError[] = [];
      let registrationConfidence = 0.95;
      let mileageConfidence = 0.95;

      if (!vehicleRegistration) {
        errors.push(
          new RegMileageExtractionError(
            'REGISTRATION_INVALID_FORMAT',
            'Extracted registration failed validation',
            'warning'
          )
        );
        registrationConfidence = 0.1;
      }

      if (vehicleMileage === null) {
        errors.push(
          new RegMileageExtractionError(
            'MILEAGE_INVALID_FORMAT',
            'Extracted mileage failed validation',
            'warning'
          )
        );
        mileageConfidence = 0.1;
      }

      return {
        vehicleRegistration,
        vehicleMileage: vehicleMileage !== null ? String(vehicleMileage) : null,
        registrationConfidence,
        mileageConfidence,
        errors,
        sourceSnippets: {
          registration: regexResult.registrationSnippets[0],
          mileage: regexResult.mileageSnippets[0],
        },
      };
    }

    // Ambiguous or missing data - fall back to OpenAI
    try {
      const aiResult = await this.openAiClient.extractRegAndMileage({
        conversationText: normalisedText,
        regexCandidates: {
          regs: registrationCandidates,
          mileages: mileageCandidates.map((m) => String(m)),
        },
      });

      return this.buildResultFromAi(aiResult, normalisedText);
    } catch (error) {
      warn('OpenAI extraction failed; treating as system error', {
        ticketId,
        ticketNumber,
      });
      throw new RegMileageSystemError('OpenAI extraction failed');
    }
  }

  private normaliseText(text: string): string {
    return text
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private regexExtract(text: string): RegexExtractionResult {
    const registrations: string[] = [];
    const mileages: number[] = [];
    const registrationSnippets: string[] = [];
    const mileageSnippets: string[] = [];

    // UK registration: AA11 AAA (with or without space)
    const regPattern = /\b([A-Z]{2}\d{2}\s?[A-Z]{3})\b/gi;
    let regMatch: RegExpExecArray | null;
    while ((regMatch = regPattern.exec(text)) !== null) {
      const raw = regMatch[1].toUpperCase();
      registrations.push(raw);
      registrationSnippets.push(this.buildSnippet(text, regMatch.index, regMatch[0].length));
    }

    // Mileage pattern: numeric value with optional commas/decimals, followed by unit
    const mileagePattern =
      /\b(\d{1,3}(?:,\d{3})*|\d+)(?:\.\d+)?\s*(miles?|mi|km)\b/gi;
    let mileageMatch: RegExpExecArray | null;
    while ((mileageMatch = mileagePattern.exec(text)) !== null) {
      const rawNumber = mileageMatch[1].replace(/,/g, '');
      const unit = mileageMatch[2].toLowerCase();
      const value = Number.parseFloat(rawNumber);
      if (Number.isNaN(value)) {
        continue;
      }
      // Accept only plausible mileage range in miles; ignore km for now
      if (unit === 'km') {
        continue;
      }
      if (value >= 0 && value <= 500_000) {
        mileages.push(value);
        mileageSnippets.push(
          this.buildSnippet(text, mileageMatch.index, mileageMatch[0].length)
        );
      }
    }

    // Prefer the last occurrence in case of corrections, but keep all candidates for the LLM
    return {
      registrations,
      mileages,
      registrationSnippets,
      mileageSnippets,
    };
  }

  private buildSnippet(text: string, index: number, length: number): string {
    const start = Math.max(0, index - 30);
    const end = Math.min(text.length, index + length + 30);
    return text.slice(start, end).trim();
  }

  private validateRegistration(reg: string): string | null {
    const normalised = reg.toUpperCase().replace(/\s+/g, '');
    const pattern = /^[A-Z]{2}\d{2}[A-Z]{3}$/;
    if (!pattern.test(normalised)) {
      return null;
    }
    // Reformat as AA11 AAA
    return `${normalised.slice(0, 2)}${normalised.slice(2, 4)} ${normalised.slice(4)}`;
  }

  private validateMileage(value: number): number | null {
    if (!Number.isFinite(value)) {
      return null;
    }
    if (value < 0 || value > 500_000) {
      return null;
    }
    return Math.round(value);
  }

  private buildResultFromAi(
    aiResult: OpenAiExtractionResponse,
    text: string
  ): RegMileageExtractionResult {
    const errors: RegMileageExtractionError[] = [];

    const validatedReg =
      aiResult.vehicleRegistration !== null
        ? this.validateRegistration(aiResult.vehicleRegistration)
        : null;
    let registrationConfidence = aiResult.registrationConfidence;
    if (!validatedReg && aiResult.vehicleRegistration !== null) {
      errors.push(
        new RegMileageExtractionError(
          'REGISTRATION_INVALID_FORMAT',
          'LLM-provided registration failed validation',
          'warning'
        )
      );
      registrationConfidence = 0.1;
    }

    const numericMileage =
      aiResult.vehicleMileage !== null
        ? Number.parseFloat(aiResult.vehicleMileage.replace(/,/g, ''))
        : null;
    const validatedMileage =
      numericMileage !== null && !Number.isNaN(numericMileage)
        ? this.validateMileage(numericMileage)
        : null;
    let mileageConfidence = aiResult.mileageConfidence;
    if (!validatedMileage && aiResult.vehicleMileage !== null) {
      errors.push(
        new RegMileageExtractionError(
          'MILEAGE_INVALID_FORMAT',
          'LLM-provided mileage failed validation',
          'warning'
        )
      );
      mileageConfidence = 0.1;
    }

    const registrationSnippet =
      validatedReg !== null
        ? this.findSnippetForValue(text, validatedReg)
        : undefined;
    const mileageSnippet =
      validatedMileage !== null
        ? this.findSnippetForValue(text, String(validatedMileage))
        : undefined;

    return {
      vehicleRegistration: validatedReg,
      vehicleMileage: validatedMileage !== null ? String(validatedMileage) : null,
      registrationConfidence,
      mileageConfidence,
      errors,
      sourceSnippets: {
        registration: registrationSnippet,
        mileage: mileageSnippet,
      },
    };
  }

  private findSnippetForValue(text: string, value: string): string | undefined {
    const index = text.indexOf(value);
    if (index === -1) {
      return undefined;
    }
    return this.buildSnippet(text, index, value.length);
  }
}


