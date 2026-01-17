import type { CertificateData } from '../models/certificate-data.js';
import type { Ticket } from '../models/index.js';
import { ProcessedTicketsRepository } from './processed-tickets-repository.js';
import { CertificateDataBuilder, CertificateDataError } from './certificate-data-builder.js';
import type { CertificatePdfGenerator } from './certificate-pdf-generator.js';
import type { CertificateStorage } from './certificate-storage.js';
import { JifelineApiClient } from '../clients/jifeline-api-client.js';
import { JifelineNotFoundError } from '../clients/jifeline-api-errors.js';
import { error, info, warn } from './logger.js';

/**
 * Service that orchestrates the processing of closed tickets to generate certificates.
 *
 * This service coordinates the following steps:
 * 1. Idempotency check - ensures tickets are not processed twice
 * 2. Data building - transforms Jifeline API data into CertificateData
 * 3. PDF generation - creates a PDF certificate from the data
 * 4. Storage - saves the PDF and gets a public URL
 * 5. Recording - records success or failure in the database
 *
 * Error handling distinguishes between:
 * - needs_review: Data/validation problems (e.g., missing required fields, entities not found)
 *   These are business logic issues that may require manual intervention.
 * - failed: System/infrastructure problems (e.g., PDF generation failure, storage failure)
 *   These are technical issues that may be retried automatically.
 *
 * This service is purely orchestration and does not contain any PDF generation,
 * storage, or data transformation logic - it delegates to injected dependencies.
 */
export class TicketProcessingService {
  private readonly processedTicketsRepository: ProcessedTicketsRepository;
  private readonly certificateDataBuilder: CertificateDataBuilder;
  private readonly certificatePdfGenerator: CertificatePdfGenerator;
  private readonly certificateStorage: CertificateStorage;
  private readonly apiClient: JifelineApiClient;

  constructor(
    processedTicketsRepository: ProcessedTicketsRepository,
    certificateDataBuilder: CertificateDataBuilder,
    certificatePdfGenerator: CertificatePdfGenerator,
    certificateStorage: CertificateStorage,
    apiClient: JifelineApiClient
  ) {
    this.processedTicketsRepository = processedTicketsRepository;
    this.certificateDataBuilder = certificateDataBuilder;
    this.certificatePdfGenerator = certificatePdfGenerator;
    this.certificateStorage = certificateStorage;
    this.apiClient = apiClient;
  }

  /**
   * Processes a closed ticket to generate a certificate.
   *
   * Processing flow:
   * 1. Idempotency check - returns early if already successfully processed
   * 2. Load ticket to extract ticketNumber and customerId for error handling
   * 3. Build CertificateData - if CertificateDataError is thrown, records failure with 'needs_review'
   * 4. Generate PDF from CertificateData
   * 5. Store PDF and get certificate URL
   * 6. Record success with certificate URL
   *
   * If errors occur during PDF generation or storage (step 4-5), records failure with 'failed'
   * status and re-throws the error for higher-level monitoring.
   *
   * @param ticketId Jifeline ticket UUID
   * @throws {Error} If a system error occurs during PDF generation or storage (after data is built)
   */
  async processClosedTicket(ticketId: string): Promise<void> {
    info('Starting ticket processing', { ticketId });

    // Step 1: Idempotency check
    const alreadyProcessed = await this.processedTicketsRepository.hasSuccessfulRecord(ticketId);
    if (alreadyProcessed) {
      info('Ticket already processed, skipping', { ticketId, status: 'already_processed' });
      return;
    }

    // Step 2: Load ticket to extract ticketNumber and customerId for error handling
    let ticket: Ticket;
    try {
      ticket = await this.apiClient.getTicketById(ticketId);
    } catch (err) {
      if (err instanceof JifelineNotFoundError) {
        // Ticket doesn't exist - treat as data/validation issue
        warn('Ticket not found, recording as needs_review', {
          ticketId,
          errorCode: 'TICKET_NOT_FOUND',
        });
        await this.processedTicketsRepository.recordFailure({
          ticketId,
          ticketNumber: 0, // Unknown
          customerId: 'unknown',
          errorMessage: `Ticket not found: ${ticketId}`,
          status: 'needs_review',
        });
        return;
      }
      // System error - re-throw for higher-level handling
      throw err;
    }

    const ticketNumber = ticket.ticket_number;
    const customerId = ticket.customer_id ?? 'unknown';

    // Step 3: Build CertificateData
    let certificateData: CertificateData;
    try {
      certificateData = await this.certificateDataBuilder.buildForTicket(ticketId);
    } catch (err) {
      if (err instanceof CertificateDataError) {
        // Data/validation problem - record as needs_review
        const errorMessage = `[${err.code}] ${err.message}`;
        warn('Certificate data validation failed, recording as needs_review', {
          ticketId,
          ticketNumber,
          customerId,
          errorCode: err.code,
          errorMessage: err.message,
          status: 'needs_review',
        });
        await this.processedTicketsRepository.recordFailure({
          ticketId,
          ticketNumber,
          customerId,
          errorMessage,
          status: 'needs_review',
          rawPayload: {
            errorCode: err.code,
            errorMessage: err.message,
          },
        });
        return;
      }
      // System error during data building - re-throw for higher-level handling
      throw err;
    }

    // Step 4-5: Generate PDF and store it
    try {
      const pdfBuffer = await this.certificatePdfGenerator.generate(certificateData);
      const certificateUrl = await this.certificateStorage.saveCertificatePdf({
        ticketId,
        ticketNumber: certificateData.jobNumber,
        buffer: pdfBuffer,
      });

      // Step 6: Record success
      await this.processedTicketsRepository.recordSuccess({
        ticketId,
        ticketNumber: certificateData.jobNumber,
        customerId: ticket.customer_id ?? 'unknown',
        certificateUrl,
        rawPayload: {
          workshopName: certificateData.workshopName,
          vehicleMake: certificateData.vehicleMake,
          vehicleModel: certificateData.vehicleModel,
          jobNumber: certificateData.jobNumber,
          date: certificateData.date,
        },
      });

      info('Ticket processed successfully', {
        ticketId,
        ticketNumber: certificateData.jobNumber,
        customerId: ticket.customer_id ?? 'unknown',
        certificateUrl,
        status: 'processed',
      });
    } catch (err) {
      // System error during PDF generation or storage
      const errorMessage =
        err instanceof Error ? err.message : 'Unknown error during PDF generation or storage';
      const errorType = err instanceof Error && 'name' in err ? String(err.name) : 'UnknownError';

      error('System error during PDF generation or storage', {
        ticketId,
        ticketNumber: certificateData.jobNumber,
        customerId: ticket.customer_id ?? 'unknown',
        errorType,
        errorMessage,
        status: 'failed',
        step: 'pdf_generation_or_storage',
      });

      await this.processedTicketsRepository.recordFailure({
        ticketId,
        ticketNumber: certificateData.jobNumber,
        customerId: ticket.customer_id ?? 'unknown',
        errorMessage: `PDF/Storage error: ${errorMessage}`,
        status: 'failed',
        rawPayload: {
          errorType,
          errorMessage,
          step: 'pdf_generation_or_storage',
        },
      });

      // Re-throw for higher-level monitoring
      throw err;
    }
  }
}
