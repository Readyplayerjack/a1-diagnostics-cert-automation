import { query, DatabaseError } from '../clients/database.js';
import { error, info, warn } from './logger.js';

/**
 * Status values for processed tickets.
 */
export type ProcessedTicketStatus = 'success' | 'failed' | 'needs_review';

/**
 * Parameters for recording a successful ticket processing.
 */
export interface RecordSuccessParams {
  /** Jifeline ticket UUID */
  ticketId: string;
  /** Ticket number from Jifeline */
  ticketNumber: number;
  /** Jifeline customer ID */
  customerId: string;
  /** URL to the generated certificate PDF (optional, will be filled later) */
  certificateUrl?: string | null;
  /** Optional snapshot of key data for debugging/auditing */
  rawPayload?: unknown;
}

/**
 * Parameters for recording a failed ticket processing.
 */
export interface RecordFailureParams {
  /** Jifeline ticket UUID */
  ticketId: string;
  /** Ticket number from Jifeline */
  ticketNumber: number;
  /** Jifeline customer ID */
  customerId: string;
  /** Error message describing what went wrong */
  errorMessage: string;
  /** Optional snapshot of key data for debugging/auditing */
  rawPayload?: unknown;
  /** Status - defaults to 'failed', but can be 'needs_review' for manual intervention */
  status?: 'failed' | 'needs_review';
}

/**
 * Repository for managing processed tickets in the database.
 *
 * This repository ensures idempotency by using UNIQUE constraint on ticket_id.
 * If the same ticket is processed multiple times (e.g., due to retries or webhook duplicates),
 * we can check if it's already been successfully processed and skip it.
 *
 * The status field is used to:
 * - Skip tickets that are already 'success' when polling for new closed tickets
 * - Show a review queue for tickets with status 'needs_review'
 * - Track failed processing attempts for debugging and retry logic
 */
export class ProcessedTicketsRepository {
  /**
   * Checks if a ticket has been successfully processed.
   * @param ticketId Jifeline ticket UUID
   * @returns true if there is a row with this ticket_id and status = 'success'
   * @throws {DatabaseError} If the database query fails
   */
  async hasSuccessfulRecord(ticketId: string): Promise<boolean> {
    try {
      const result = await query<{ exists: boolean }>(
        `
        SELECT EXISTS(
          SELECT 1
          FROM processed_tickets
          WHERE ticket_id = $1 AND status = 'success'
        ) as exists
        `,
        [ticketId]
      );

      return result.rows[0]?.exists ?? false;
    } catch (error) {
      if (error instanceof DatabaseError) {
        throw error;
      }
      throw new DatabaseError(
        `Failed to check if ticket ${ticketId} has been successfully processed`,
        error
      );
    }
  }

  /**
   * Records a successful ticket processing.
   * @param params Parameters for the successful processing record
   * @throws {DatabaseError} If the database insert fails (e.g., duplicate ticket_id)
   */
  async recordSuccess(params: RecordSuccessParams): Promise<void> {
    const { ticketId, ticketNumber, customerId, certificateUrl, rawPayload } = params;

    try {
      await query(
        `
        INSERT INTO processed_tickets (
          ticket_id,
          ticket_number,
          customer_id,
          processed_at,
          certificate_url,
          status,
          raw_payload
        ) VALUES ($1, $2, $3, NOW(), $4, 'success', $5)
        `,
        [
          ticketId,
          ticketNumber,
          customerId,
          certificateUrl ?? null,
          rawPayload ? JSON.stringify(rawPayload) : null,
        ]
      );

      info('Ticket processing success recorded', {
        ticketId,
        ticketNumber,
        customerId,
        status: 'success',
        hasCertificateUrl: !!certificateUrl,
      });
    } catch (err) {
      if (err instanceof DatabaseError) {
        error('Database error recording ticket success', {
          ticketId,
          ticketNumber,
          customerId,
        });
        throw err;
      }
      // Check if it's a unique constraint violation (duplicate ticket_id)
      if (err && typeof err === 'object' && 'code' in err && err.code === '23505') {
        warn('Duplicate ticket_id detected when recording success', {
          ticketId,
          ticketNumber,
          customerId,
        });
        throw new DatabaseError(
          `Ticket ${ticketId} has already been processed (duplicate ticket_id)`,
          err
        );
      }
      error('Failed to record successful processing', {
        ticketId,
        ticketNumber,
        customerId,
      });
      throw new DatabaseError(`Failed to record successful processing for ticket ${ticketId}`, err);
    }
  }

  /**
   * Records a failed ticket processing.
   * @param params Parameters for the failed processing record
   * @throws {DatabaseError} If the database insert fails
   */
  async recordFailure(params: RecordFailureParams): Promise<void> {
    const {
      ticketId,
      ticketNumber,
      customerId,
      errorMessage,
      rawPayload,
      status = 'failed',
    } = params;

    try {
      await query(
        `
        INSERT INTO processed_tickets (
          ticket_id,
          ticket_number,
          customer_id,
          processed_at,
          status,
          error_message,
          raw_payload
        ) VALUES ($1, $2, $3, NOW(), $4, $5, $6)
        `,
        [
          ticketId,
          ticketNumber,
          customerId,
          status,
          errorMessage,
          rawPayload ? JSON.stringify(rawPayload) : null,
        ]
      );

      info('Ticket processing failure recorded', {
        ticketId,
        ticketNumber,
        customerId,
        status,
        errorMessage,
      });
    } catch (err) {
      if (err instanceof DatabaseError) {
        error('Database error recording ticket failure', {
          ticketId,
          ticketNumber,
          customerId,
          status,
        });
        throw err;
      }
      // Check if it's a unique constraint violation (duplicate ticket_id)
      if (err && typeof err === 'object' && 'code' in err && err.code === '23505') {
        warn('Duplicate ticket_id detected when recording failure', {
          ticketId,
          ticketNumber,
          customerId,
          status,
        });
        throw new DatabaseError(
          `Ticket ${ticketId} has already been processed (duplicate ticket_id)`,
          err
        );
      }
      error('Failed to record failed processing', {
        ticketId,
        ticketNumber,
        customerId,
        status,
      });
      throw new DatabaseError(`Failed to record failed processing for ticket ${ticketId}`, err);
    }
  }
}
