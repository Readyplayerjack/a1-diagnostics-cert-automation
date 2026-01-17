import { JifelineApiClient } from '../clients/jifeline-api-client.js';
import { CertificateDataBuilder } from './certificate-data-builder.js';
import {
  ChromiumCertificatePdfGenerator,
  SimpleCertificatePdfGenerator,
  StubCertificatePdfGenerator,
  type CertificatePdfGenerator,
} from './certificate-pdf-generator.js';
import { loadConfig } from '../config/index.js';
import { RealRegMileageExtractor, StubRegMileageExtractor } from './reg-mileage-extractor.js';
import { SupabaseCertificateStorage, type CertificateStorage } from './certificate-storage.js';
import { ProcessedTicketsRepository } from './processed-tickets-repository.js';
import { TicketProcessingService } from './ticket-processing-service.js';
import { HttpOpenAiExtractionClient } from '../clients/openai-extraction-client.js';

/**
 * Creates a TicketProcessingService wired with production-ready dependencies.
 * - PDF Generator: ChromiumCertificatePdfGenerator (default) or SimpleCertificatePdfGenerator (if USE_SIMPLE_PDF=true)
 * - SupabaseCertificateStorage for real certificate persistence.
 * - RealRegMileageExtractor for registration/mileage extraction (regex + OpenAI).
 */
export function createTicketProcessingService(): TicketProcessingService {
  const processedTicketsRepository = new ProcessedTicketsRepository();
  const apiClient = new JifelineApiClient();
  const openAiClient = new HttpOpenAiExtractionClient();
  const regMileageExtractor = new RealRegMileageExtractor(apiClient, openAiClient);
  const certificateDataBuilder = new CertificateDataBuilder(apiClient, regMileageExtractor);

  // Choose PDF generator based on environment variable
  const config = loadConfig();
  let certificatePdfGenerator: CertificatePdfGenerator;
  if (config.USE_SIMPLE_PDF) {
    certificatePdfGenerator = new SimpleCertificatePdfGenerator();
  } else {
    certificatePdfGenerator = new ChromiumCertificatePdfGenerator();
  }

  const certificateStorage: CertificateStorage = new SupabaseCertificateStorage();

  return new TicketProcessingService(
    processedTicketsRepository,
    certificateDataBuilder,
    certificatePdfGenerator,
    certificateStorage,
    apiClient
  );
}

/**
 * Creates a TicketProcessingService with stub dependencies for testing/local development.
 * - StubCertificatePdfGenerator for fast, lightweight PDF generation (placeholder PDFs).
 * - StubRegMileageExtractor for registration/mileage extraction (always returns null).
 * - SupabaseCertificateStorage for real certificate persistence.
 */
export function createTicketProcessingServiceWithStubs(): TicketProcessingService {
  const processedTicketsRepository = new ProcessedTicketsRepository();
  const apiClient = new JifelineApiClient();
  const regMileageExtractor = new StubRegMileageExtractor();
  const certificateDataBuilder = new CertificateDataBuilder(apiClient, regMileageExtractor);
  const certificatePdfGenerator = new StubCertificatePdfGenerator();
  const certificateStorage: CertificateStorage = new SupabaseCertificateStorage();

  return new TicketProcessingService(
    processedTicketsRepository,
    certificateDataBuilder,
    certificatePdfGenerator,
    certificateStorage,
    apiClient
  );
}

