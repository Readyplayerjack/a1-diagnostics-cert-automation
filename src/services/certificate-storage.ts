import { supabaseClient } from '../clients/supabase-client.js';
import { error, info } from './logger.js';

const CERTIFICATES_BUCKET = 'certificates';

/**
 * Interface for storing certificate PDFs and retrieving their URLs.
 *
 * This interface will be implemented by a real storage service (e.g., Supabase Storage)
 * in a future phase. The stub implementation is provided for development and testing purposes.
 */
export interface CertificateStorage {
  /**
   * Saves a certificate PDF and returns its public URL.
   * @param params Object containing ticketId, ticketNumber, and the PDF buffer
   * @returns The public URL where the certificate can be accessed
   */
  saveCertificatePdf(params: {
    ticketId: string;
    ticketNumber: number;
    buffer: Buffer;
  }): Promise<string>;
}

export type CertificateStorageErrorCode = 'UPLOAD_FAILED' | 'URL_GENERATION_FAILED' | 'UNKNOWN';

interface CertificateStorageErrorParams {
  readonly message: string;
  readonly code: CertificateStorageErrorCode;
  readonly bucket: string;
  readonly path: string;
  readonly originalError?: unknown;
}

export class CertificateStorageError extends Error {
  readonly code: CertificateStorageErrorCode;
  readonly bucket: string;
  readonly path: string;
  readonly originalError?: unknown;

  constructor(params: CertificateStorageErrorParams) {
    super(params.message);
    this.name = 'CertificateStorageError';
    this.code = params.code;
    this.bucket = params.bucket;
    this.path = params.path;
    this.originalError = params.originalError;
  }
}

/**
 * TODO: Ensure the 'certificates' bucket exists and has the desired access
 * configuration in the Supabase dashboard.
 */
export class SupabaseCertificateStorage implements CertificateStorage {
  private readonly client = supabaseClient;

  constructor(client = supabaseClient) {
    this.client = client;
  }

  async saveCertificatePdf(params: {
    ticketId: string;
    ticketNumber: number;
    buffer: Buffer;
  }): Promise<string> {
    const { ticketId, ticketNumber, buffer } = params;
    const bucket = CERTIFICATES_BUCKET;
    // Path should NOT include bucket name - Supabase .from(bucket) already specifies the bucket
    const path = `${ticketNumber}-${ticketId}.pdf`;

    try {
      const { error: uploadError } = await this.client.storage.from(bucket).upload(path, buffer, {
        contentType: 'application/pdf',
        upsert: true,
      });

      if (uploadError) {
        const err = new CertificateStorageError({
          message: `Failed to upload certificate PDF to bucket ${bucket}`,
          code: 'UPLOAD_FAILED',
          bucket,
          path,
          originalError: uploadError,
        });
        error('Certificate storage upload failed', {
          ticketId,
          ticketNumber,
          bucket,
          path,
          errorCode: err.code,
        });
        throw err;
      }

      let publicUrl: string | null;
      try {
        const { data } = this.client.storage.from(bucket).getPublicUrl(path);
        publicUrl = data.publicUrl ?? null;
      } catch (urlGenerationError) {
        const err = new CertificateStorageError({
          message: `Failed to generate public URL for ${path}`,
          code: 'URL_GENERATION_FAILED',
          bucket,
          path,
          originalError: urlGenerationError,
        });
        error('Certificate storage URL generation failed', {
          ticketId,
          ticketNumber,
          bucket,
          path,
          errorCode: err.code,
        });
        throw err;
      }

      if (!publicUrl) {
        const err = new CertificateStorageError({
          message: `Public URL missing for ${path}`,
          code: 'URL_GENERATION_FAILED',
          bucket,
          path,
        });
        error('Certificate storage URL missing', {
          ticketId,
          ticketNumber,
          bucket,
          path,
          errorCode: err.code,
        });
        throw err;
      }

      info('Certificate PDF stored successfully', {
        ticketId,
        ticketNumber,
        bucket,
        path,
        certificateUrl: publicUrl,
      });

      return publicUrl;
    } catch (err) {
      if (err instanceof CertificateStorageError) {
        throw err;
      }

      const storageError = new CertificateStorageError({
        message: 'Unexpected error while saving certificate PDF',
        code: 'UNKNOWN',
        bucket,
        path,
        originalError: err,
      });
      error('Certificate storage unexpected error', {
        ticketId,
        ticketNumber,
        bucket,
        path,
        errorCode: storageError.code,
      });
      throw storageError;
    }
  }
}

export const supabaseCertificateStorage = new SupabaseCertificateStorage();

/**
 * Stub implementation of CertificateStorage that returns a fake URL without actually storing files.
 *
 * This implementation will be replaced with a real storage service that:
 * - Uploads PDFs to Supabase Storage (or similar cloud storage)
 * - Organizes files by ticket number and ID
 * - Returns public URLs for accessing the stored certificates
 * - Handles errors and retries for upload failures
 *
 * The Supabase-backed implementation is the default for production runtime.
 */
export class StubCertificateStorage implements CertificateStorage {
  /**
   * Simulates saving a certificate PDF by returning a fake but well-formed URL.
   * Does not actually upload the file to any storage service.
   */
  async saveCertificatePdf(params: {
    ticketId: string;
    ticketNumber: number;
    buffer: Buffer;
  }): Promise<string> {
    const { ticketId, ticketNumber } = params;

    // Log that we would upload the PDF in a real implementation
    // In production, this would upload to Supabase Storage or similar
    // eslint-disable-next-line no-console
    console.log(
      `[STUB] Would upload certificate PDF for ticket ${ticketId} (job #${ticketNumber}), size: ${params.buffer.length} bytes`
    );

    // Return a fake but well-formed URL
    // In production, this would be the actual public URL from Supabase Storage
    return await Promise.resolve(
      `https://example.com/certificates/${ticketNumber}-${ticketId}.pdf`
    );
  }
}
