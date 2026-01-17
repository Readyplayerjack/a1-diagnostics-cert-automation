/**
 * Input validation schemas using Zod.
 *
 * Validates all external inputs (API responses, user inputs, environment variables)
 * to prevent invalid data from causing runtime errors.
 */

import { z } from 'zod';

/**
 * Validates Jifeline ticket data structure.
 */
export const jifelineTicketSchema = z.object({
  id: z.string().uuid(),
  ticket_number: z.number().int().positive(),
  customer_id: z.string().nullable(),
  state: z.enum(['prepared', 'pending', 'in_progress', 'outsourced', 'closed', 'cancelled']),
  finished_at: z.string().nullable(),
  vehicle_model_id: z.number().int().positive(),
  created_at: z.string(),
  updated_at: z.string(),
});

/**
 * Validates OpenAI extraction response.
 */
export const openAiExtractionResponseSchema = z.object({
  vehicleRegistration: z.string().nullable(),
  vehicleMileage: z.number().nullable(),
  registrationConfidence: z.number().min(0).max(1),
  mileageConfidence: z.number().min(0).max(1),
  reasoning: z.string().optional(),
});

/**
 * Validates processed ticket record parameters.
 */
export const recordSuccessParamsSchema = z.object({
  ticketId: z.string().uuid(),
  ticketNumber: z.number().int().positive(),
  customerId: z.string().min(1),
  garageId: z.string().min(1),
  certificateUrl: z.string().url().nullable().optional(),
  rawPayload: z.unknown().optional(),
});

/**
 * Validates processed ticket failure parameters.
 */
export const recordFailureParamsSchema = z.object({
  ticketId: z.string().uuid(),
  ticketNumber: z.number().int().nonnegative(),
  customerId: z.string().min(1),
  garageId: z.string().min(1),
  errorMessage: z.string().min(1),
  rawPayload: z.unknown().optional(),
  status: z.enum(['failed', 'needs_review']).optional(),
});

/**
 * Validates process ticket request body.
 */
export const processTicketRequestSchema = z.object({
  ticketId: z.string().uuid(),
});

/**
 * Custom validation error class.
 */
export class ValidationError extends Error {
  public readonly code = 'VALIDATION_ERROR';
  public readonly details: z.ZodError;

  constructor(message: string, details: z.ZodError) {
    super(message);
    this.name = 'ValidationError';
    this.details = details;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ValidationError);
    }
  }
}

/**
 * Validates data against a Zod schema and throws ValidationError if invalid.
 */
export function validate<T>(schema: z.ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new ValidationError(
      `Validation failed: ${result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')}`,
      result.error
    );
  }
  return result.data;
}
