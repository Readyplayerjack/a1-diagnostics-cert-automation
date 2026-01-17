import { ProcessedTicketsRepository } from '../services/processed-tickets-repository.js';
import { CertificateDataError } from '../services/certificate-data-builder.js';
import { createTicketProcessingService } from '../services/service-factory.js';
import { error, info, warn } from '../services/logger.js';

/**
 * Vercel serverless function request type.
 */
interface VercelRequest {
  method?: string;
  body?: unknown;
}

/**
 * Vercel serverless function response type.
 */
interface VercelResponse<T = unknown> {
  status: (code: number) => VercelResponse<T>;
  json: (body: T) => void;
}

/**
 * Request body schema for process-ticket endpoint.
 */
interface ProcessTicketRequest {
  ticketId: string;
}

/**
 * Success response when ticket is processed.
 */
interface ProcessTicketSuccessResponse {
  status: 'processed' | 'already_processed' | 'needs_review';
  ticketId: string;
}

/**
 * Error response for client errors.
 */
interface ProcessTicketErrorResponse {
  error: 'BAD_REQUEST' | 'MISSING_TICKET_ID' | 'INVALID_TICKET_ID';
  message?: string;
}

/**
 * Error response for server errors.
 */
interface ProcessTicketFailureResponse {
  status: 'failed';
  ticketId: string;
  error: 'INTERNAL_ERROR';
}

type ProcessTicketResponse =
  | ProcessTicketSuccessResponse
  | ProcessTicketErrorResponse
  | ProcessTicketFailureResponse;

/**
 * HTTP handler for processing a single ticket to generate a certificate.
 *
 * Endpoint: POST /api/process-ticket (Vercel) or equivalent serverless function path
 *
 * Request body:
 * {
 *   "ticketId": "uuid-string"
 * }
 *
 * Responses:
 * - 200 { status: 'processed', ticketId } - Ticket successfully processed
 * - 200 { status: 'already_processed', ticketId } - Ticket was already processed (idempotency)
 * - 200 { status: 'needs_review', ticketId } - Business/validation issue, recorded for review
 * - 400 { error: 'BAD_REQUEST' } - Invalid JSON body
 * - 400 { error: 'MISSING_TICKET_ID' } - ticketId missing from body
 * - 400 { error: 'INVALID_TICKET_ID' } - ticketId is not a valid non-empty string
 * - 500 { status: 'failed', ticketId, error: 'INTERNAL_ERROR' } - System/infrastructure error
 */
/**
 * Vercel serverless function handler for processing tickets.
 *
 * Deploy as: /api/process-ticket (Vercel) or equivalent serverless function path
 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse<ProcessTicketResponse>
): Promise<void> {
  // Only allow POST method
  if (req.method !== 'POST') {
    warn('Invalid HTTP method for process-ticket endpoint', { method: req.method });
    res.status(405).json({
      error: 'BAD_REQUEST',
      message: 'Method not allowed. Use POST.',
    } as ProcessTicketErrorResponse);
    return;
  }

  let ticketId: string;

  try {
    // Parse and validate request body
    if (!req.body || typeof req.body !== 'object') {
      warn('Invalid request body for process-ticket', { bodyType: typeof req.body });
      res.status(400).json({
        error: 'BAD_REQUEST',
        message: 'Invalid JSON body',
      });
      return;
    }

    const body = req.body as Partial<ProcessTicketRequest>;

    // Validate ticketId is present
    if (!('ticketId' in body)) {
      warn('Missing ticketId in request body');
      res.status(400).json({
        error: 'MISSING_TICKET_ID',
      });
      return;
    }

    // Validate ticketId is a non-empty string
    if (typeof body.ticketId !== 'string' || body.ticketId.trim().length === 0) {
      warn('Invalid ticketId in request body', {
        ticketIdType: typeof body.ticketId,
        ticketIdLength: typeof body.ticketId === 'string' ? body.ticketId.length : 0,
      });
      res.status(400).json({
        error: 'INVALID_TICKET_ID',
      });
      return;
    }

    ticketId = body.ticketId.trim();
  } catch (err) {
    // JSON parsing error or other body parsing issues
    warn('Request body parsing error', {
      errorMessage: err instanceof Error ? err.message : 'Unknown error',
    });
    res.status(400).json({
      error: 'BAD_REQUEST',
      message: 'Invalid JSON body',
    });
    return;
  }

  // Check if already processed before calling service (for idempotency response)
  const processedTicketsRepository = new ProcessedTicketsRepository();
  let wasAlreadyProcessed = false;
  try {
    wasAlreadyProcessed = await processedTicketsRepository.hasSuccessfulRecord(ticketId);
  } catch {
    // If check fails, continue - service will handle idempotency internally
  }

  if (wasAlreadyProcessed) {
    info('Ticket processing request: already processed', {
      ticketId,
      status: 'already_processed',
    });
    res.status(200).json({
      status: 'already_processed',
      ticketId,
    });
    return;
  }

  // Instantiate service and process ticket
  const ticketProcessingService = createTicketProcessingService();

  try {
    await ticketProcessingService.processClosedTicket(ticketId);

    // Service completed without throwing - check final status in database
    // to distinguish between 'processed' and 'needs_review'
    try {
      const isSuccess = await processedTicketsRepository.hasSuccessfulRecord(ticketId);
      if (isSuccess) {
        info('Ticket processing request: processed successfully', {
          ticketId,
          status: 'processed',
        });
        res.status(200).json({
          status: 'processed',
          ticketId,
        });
        return;
      }

      // If not success, check if it was recorded as needs_review
      // Query the database to check status
      const { query } = await import('../clients/database.js');
      const result = await query<{ status: string }>(
        `
        SELECT status
        FROM processed_tickets
        WHERE ticket_id = $1
        ORDER BY processed_at DESC
        LIMIT 1
        `,
        [ticketId]
      );

      const record = result.rows[0];
      if (record?.status === 'needs_review') {
        info('Ticket processing request: needs review', {
          ticketId,
          status: 'needs_review',
        });
        res.status(200).json({
          status: 'needs_review',
          ticketId,
        });
        return;
      }

      // Default to processed if we can't determine (shouldn't happen)
      info('Ticket processing request: processed (status unknown)', {
        ticketId,
        status: 'processed',
      });
      res.status(200).json({
        status: 'processed',
        ticketId,
      });
    } catch (dbError) {
      // If we can't check status, assume processed (service didn't throw)
      // Log the error for diagnostics
      warn('Failed to check ticket status after processing', {
        ticketId,
        errorMessage: dbError instanceof Error ? dbError.message : 'Unknown error',
      });
      info('Ticket processing request: processed (status check failed)', {
        ticketId,
        status: 'processed',
      });
      res.status(200).json({
        status: 'processed',
        ticketId,
      });
    }
  } catch (err) {
    // Service threw an error - this is a system/infrastructure failure
    // Log the error for diagnostics but don't leak details to client
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    const errorType = err instanceof Error && 'name' in err ? String(err.name) : 'UnknownError';

    // Check if it's a CertificateDataError (shouldn't happen as service handles it internally,
    // but handle defensively)
    if (err instanceof CertificateDataError) {
      // Service should have handled this, but if it didn't, treat as needs_review
      warn('Ticket processing request: needs review (CertificateDataError in handler)', {
        ticketId,
        status: 'needs_review',
        errorCode: err.code,
      });
      res.status(200).json({
        status: 'needs_review',
        ticketId,
      });
      return;
    }

    // All other errors are system failures
    error('Ticket processing request: system error', {
      ticketId,
      status: 'failed',
      errorType,
      errorMessage,
    });
    res.status(500).json({
      status: 'failed',
      ticketId,
      error: 'INTERNAL_ERROR',
    });
  }
}

