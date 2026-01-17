import type { CertificateData } from '../models/certificate-data.js';
import { error, info } from './logger.js';

/**
 * Error codes for PDF generation failures.
 */
export type CertificatePdfErrorCode =
  | 'MISSING_FIELD'
  | 'LAUNCH_FAILED'
  | 'RENDER_FAILED'
  | 'PDF_FAILED'
  | 'ENVIRONMENT_NOT_SUPPORTED';

/**
 * Structured error for PDF generation failures.
 */
export class CertificatePdfError extends Error {
  public readonly code: CertificatePdfErrorCode;
  public readonly details: string[] | undefined;
  public readonly cause: Error | undefined;

  constructor(code: CertificatePdfErrorCode, message: string, details?: string[], cause?: Error) {
    super(message);
    this.name = 'CertificatePdfError';
    this.code = code;
    this.details = details;
    this.cause = cause;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, CertificatePdfError);
    }
  }
}

/**
 * Interface for generating PDF certificates from CertificateData.
 *
 * This interface will be implemented by a real PDF generator (e.g., using Puppeteer/Chromium
 * to render HTML templates to PDF) in a future phase. The stub implementation is provided
 * for development and testing purposes.
 */
export interface CertificatePdfGenerator {
  /**
   * Generates a PDF certificate from the provided certificate data.
   * @param certificateData The certificate data to render into a PDF
   * @returns A Buffer containing the generated PDF
   * @throws {CertificatePdfError} If PDF generation fails
   */
  generate(certificateData: CertificateData): Promise<Buffer>;
}

/**
 * Simple PDF generator that creates a basic PDF without requiring Chromium/Puppeteer.
 * Useful for development environments where Chromium installation is problematic.
 *
 * This generates a valid PDF with certificate data as plain text.
 * For production use, prefer ChromiumCertificatePdfGenerator for proper HTML rendering.
 */
export class SimpleCertificatePdfGenerator implements CertificatePdfGenerator {
  /**
   * Generates a simple PDF with certificate data as text.
   * Creates a valid PDF structure without requiring browser dependencies.
   */
  async generate(certificateData: CertificateData): Promise<Buffer> {
    // Build text content from certificate data
    const lines: string[] = [
      'TEST CERTIFICATE',
      '',
      `Job Number: ${certificateData.jobNumber}`,
      `Date: ${certificateData.date} ${certificateData.time}`,
      '',
      'Workshop Information:',
      `  Name: ${certificateData.workshopName}`,
      `  Address: ${certificateData.workshopAddress}`,
      '',
      'Vehicle Information:',
      `  Make: ${certificateData.vehicleMake}`,
      `  Model: ${certificateData.vehicleModel}`,
      certificateData.vehicleRegistration ? `  Registration: ${certificateData.vehicleRegistration}` : '',
      certificateData.vin ? `  VIN: ${certificateData.vin}` : '',
      certificateData.vehicleMileage ? `  Mileage: ${certificateData.vehicleMileage}` : '',
      '',
      'Staff Information:',
      `  Employee: ${certificateData.employeeName}`,
      `  Remote Operator: ${certificateData.remoteOperatorName}`,
      '',
      'Calibration Result:',
      `  ${certificateData.calibrationResult}`,
      '',
      'Diagnostic Notes:',
      `  Pre-Scan: ${certificateData.preScanNotes}`,
      `  Post-Scan: ${certificateData.postScanNotes}`,
    ].filter((line) => line !== '');

    // Escape text for PDF content stream
    const escapePdfText = (text: string): string => {
      return text
        .replace(/\\/g, '\\\\')
        .replace(/\(/g, '\\(')
        .replace(/\)/g, '\\)')
        .replace(/\n/g, '\\n');
    };

    // Build PDF content stream
    const contentLines = lines.map((line, idx) => {
      const y = 750 - idx * 20; // Position lines from top
      return `100 ${y} Td (${escapePdfText(line)}) Tj 0 -20 Td`;
    });

    const contentStream = `BT
/F1 12 Tf
${contentLines.join('\n')}
ET`;

    // Create minimal valid PDF structure
    const pdfContent = `%PDF-1.4
1 0 obj
<<
/Type /Catalog
/Pages 2 0 R
>>
endobj
2 0 obj
<<
/Type /Pages
/Kids [3 0 R]
/Count 1
>>
endobj
3 0 obj
<<
/Type /Page
/Parent 2 0 R
/MediaBox [0 0 612 792]
/Contents 4 0 R
/Resources <<
/Font <<
/F1 <<
/Type /Font
/Subtype /Type1
/BaseFont /Helvetica
>>
>>
>>
>>
endobj
4 0 obj
<<
/Length ${contentStream.length}
>>
stream
${contentStream}
endstream
endobj
xref
0 5
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
0000000306 00000 n
trailer
<<
/Size 5
/Root 1 0 R
>>
startxref
${456 + contentStream.length - 100}
%%EOF`;

    return Buffer.from(pdfContent, 'utf-8');
  }
}

/**
 * Stub implementation of CertificatePdfGenerator that returns a minimal valid PDF placeholder.
 *
 * This implementation will be replaced with a real PDF generator that:
 * - Renders an HTML template using the CertificateData
 * - Uses Puppeteer/Chromium or similar to convert HTML to PDF
 * - Applies proper styling and formatting for the certificate
 *
 * TODO: Replace with a proper HTML→PDF implementation (e.g., Puppeteer/Chromium)
 */
export class StubCertificatePdfGenerator implements CertificatePdfGenerator {
  /**
   * Generates a minimal valid PDF buffer as a placeholder.
   * The PDF contains basic structure but no actual certificate content.
   */
  async generate(certificateData: CertificateData): Promise<Buffer> {
    // Create a minimal valid PDF structure
    // This is a basic PDF that contains placeholder text
    const pdfContent = `%PDF-1.4
1 0 obj
<<
/Type /Catalog
/Pages 2 0 R
>>
endobj
2 0 obj
<<
/Type /Pages
/Kids [3 0 R]
/Count 1
>>
endobj
3 0 obj
<<
/Type /Page
/Parent 2 0 R
/MediaBox [0 0 612 792]
/Contents 4 0 R
/Resources <<
/Font <<
/F1 <<
/Type /Font
/Subtype /Type1
/BaseFont /Helvetica
>>
>>
>>
>>
endobj
4 0 obj
<<
/Length 100
>>
stream
BT
/F1 12 Tf
100 700 Td
(Certificate PDF - Job #${certificateData.jobNumber} - STUB IMPLEMENTATION) Tj
ET
endstream
endobj
xref
0 5
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
0000000306 00000 n
trailer
<<
/Size 5
/Root 1 0 R
>>
startxref
456
%%EOF`;

    // Return asynchronously to satisfy lint rules
    return await Promise.resolve(Buffer.from(pdfContent, 'utf-8'));
  }
}

/**
 * Real implementation of CertificatePdfGenerator using Chromium/Puppeteer for HTML→PDF conversion.
 *
 * This implementation:
 * - Validates required CertificateData fields
 * - Renders an HTML template with CSS styling
 * - Uses headless Chromium (via @sparticuz/chromium) for serverless compatibility
 * - Generates a single-page A4 PDF certificate
 *
 * Note: Uses Arial font which supports basic Western European characters.
 * For extended character support, custom fonts would need to be added.
 */
export class ChromiumCertificatePdfGenerator implements CertificatePdfGenerator {
  /**
   * Validates that all required CertificateData fields are present.
   * @param certificateData The certificate data to validate
   * @throws {CertificatePdfError} If any required fields are missing
   */
  private validateRequiredFields(certificateData: CertificateData): void {
    const missingFields: string[] = [];

    if (!certificateData.workshopName) {
      missingFields.push('workshopName');
    }
    if (!certificateData.workshopAddress) {
      missingFields.push('workshopAddress');
    }
    if (certificateData.jobNumber === undefined || certificateData.jobNumber === null) {
      missingFields.push('jobNumber');
    }
    if (!certificateData.date) {
      missingFields.push('date');
    }
    if (!certificateData.time) {
      missingFields.push('time');
    }
    if (!certificateData.vehicleMake) {
      missingFields.push('vehicleMake');
    }
    if (!certificateData.vehicleModel) {
      missingFields.push('vehicleModel');
    }
    if (!certificateData.employeeName) {
      missingFields.push('employeeName');
    }
    if (!certificateData.remoteOperatorName) {
      missingFields.push('remoteOperatorName');
    }
    if (!certificateData.calibrationResult) {
      missingFields.push('calibrationResult');
    }
    if (!certificateData.preScanNotes) {
      missingFields.push('preScanNotes');
    }
    if (!certificateData.postScanNotes) {
      missingFields.push('postScanNotes');
    }

    if (missingFields.length > 0) {
      throw new CertificatePdfError(
        'MISSING_FIELD',
        `Missing required fields: ${missingFields.join(', ')}`,
        missingFields
      );
    }
  }

  /**
   * Escapes HTML special characters to prevent XSS and rendering issues.
   */
  private escapeHtml(text: string | null | undefined): string {
    if (!text) {
      return '';
    }
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Builds the HTML template for the certificate.
   */
  private buildHtmlTemplate(certificateData: CertificateData): string {
    const {
      workshopName,
      workshopAddress,
      vehicleMake,
      vehicleModel,
      vehicleRegistration,
      vin,
      vehicleMileage,
      jobNumber,
      date,
      time,
      employeeName,
      remoteOperatorName,
      calibrationToolUsed,
      systemName,
      calibrationResult,
      preScanNotes,
      postScanNotes,
    } = certificateData;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Calibration Protocol</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: Arial, sans-serif;
      font-size: 11pt;
      line-height: 1.4;
      color: #000;
      padding: 20mm 25mm;
      width: 210mm;
      min-height: 297mm;
    }
    .header {
      text-align: center;
      margin-bottom: 30px;
      border-bottom: 2px solid #000;
      padding-bottom: 15px;
    }
    .header h1 {
      font-size: 24pt;
      font-weight: bold;
      margin-bottom: 5px;
    }
    .header .subtitle {
      font-size: 14pt;
      font-weight: normal;
    }
    .section {
      margin-bottom: 20px;
    }
    .section-title {
      font-size: 12pt;
      font-weight: bold;
      margin-bottom: 8px;
      border-bottom: 1px solid #ccc;
      padding-bottom: 3px;
    }
    .info-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px 20px;
      margin-top: 8px;
    }
    .info-row {
      display: flex;
      flex-direction: column;
    }
    .info-label {
      font-weight: bold;
      font-size: 10pt;
      margin-bottom: 2px;
    }
    .info-value {
      font-size: 11pt;
      word-wrap: break-word;
      overflow-wrap: break-word;
    }
    .full-width {
      grid-column: 1 / -1;
    }
    .notes-section {
      margin-top: 15px;
    }
    .notes-section .info-value {
      white-space: pre-wrap;
      max-height: 60mm;
      overflow: hidden;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Calibration Protocol</h1>
    <div class="subtitle">A1 Diagnostics</div>
  </div>

  <div class="section">
    <div class="section-title">Workshop Information</div>
    <div class="info-grid">
      <div class="info-row full-width">
        <div class="info-label">Workshop Name</div>
        <div class="info-value">${this.escapeHtml(workshopName)}</div>
      </div>
      <div class="info-row full-width">
        <div class="info-label">Workshop Address</div>
        <div class="info-value">${this.escapeHtml(workshopAddress)}</div>
      </div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Vehicle Information</div>
    <div class="info-grid">
      <div class="info-row">
        <div class="info-label">Make</div>
        <div class="info-value">${this.escapeHtml(vehicleMake)}</div>
      </div>
      <div class="info-row">
        <div class="info-label">Model</div>
        <div class="info-value">${this.escapeHtml(vehicleModel)}</div>
      </div>
      ${
        vehicleRegistration
          ? `<div class="info-row">
        <div class="info-label">Registration</div>
        <div class="info-value">${this.escapeHtml(vehicleRegistration)}</div>
      </div>`
          : ''
      }
      ${
        vin
          ? `<div class="info-row">
        <div class="info-label">VIN</div>
        <div class="info-value">${this.escapeHtml(vin)}</div>
      </div>`
          : ''
      }
      ${
        vehicleMileage
          ? `<div class="info-row">
        <div class="info-label">Mileage</div>
        <div class="info-value">${this.escapeHtml(vehicleMileage)}</div>
      </div>`
          : ''
      }
    </div>
  </div>

  <div class="section">
    <div class="section-title">Job & Staff Information</div>
    <div class="info-grid">
      <div class="info-row">
        <div class="info-label">Job Number</div>
        <div class="info-value">${jobNumber}</div>
      </div>
      <div class="info-row">
        <div class="info-label">Date</div>
        <div class="info-value">${this.escapeHtml(date)}</div>
      </div>
      <div class="info-row">
        <div class="info-label">Time</div>
        <div class="info-value">${this.escapeHtml(time)}</div>
      </div>
      <div class="info-row">
        <div class="info-label">Employee Name</div>
        <div class="info-value">${this.escapeHtml(employeeName)}</div>
      </div>
      <div class="info-row">
        <div class="info-label">Remote Operator</div>
        <div class="info-value">${this.escapeHtml(remoteOperatorName)}</div>
      </div>
    </div>
  </div>

  ${
    calibrationToolUsed || systemName
      ? `<div class="section">
    <div class="section-title">System / Tool Information</div>
    <div class="info-grid">
      ${
        calibrationToolUsed
          ? `<div class="info-row">
        <div class="info-label">Calibration Tool</div>
        <div class="info-value">${this.escapeHtml(calibrationToolUsed)}</div>
      </div>`
          : ''
      }
      ${
        systemName
          ? `<div class="info-row">
        <div class="info-label">System Name</div>
        <div class="info-value">${this.escapeHtml(systemName)}</div>
      </div>`
          : ''
      }
    </div>
  </div>`
      : ''
  }

  <div class="section notes-section">
    <div class="section-title">Calibration Result & Diagnostic Notes</div>
    <div class="info-grid">
      <div class="info-row full-width">
        <div class="info-label">Calibration Result</div>
        <div class="info-value">${this.escapeHtml(calibrationResult)}</div>
      </div>
      <div class="info-row">
        <div class="info-label">Pre-Scan Notes</div>
        <div class="info-value">${this.escapeHtml(preScanNotes)}</div>
      </div>
      <div class="info-row">
        <div class="info-label">Post-Scan Notes</div>
        <div class="info-value">${this.escapeHtml(postScanNotes)}</div>
      </div>
    </div>
  </div>
</body>
</html>`;
  }

  /**
   * Generates a PDF certificate from CertificateData using Chromium.
   * @param certificateData The certificate data to render
   * @returns A Buffer containing the generated PDF
   * @throws {CertificatePdfError} If validation fails or PDF generation fails
   */
  async generate(certificateData: CertificateData): Promise<Buffer> {
    const jobNumber = certificateData.jobNumber;
    info('Starting PDF generation', { jobNumber });

    // Validate required fields
    try {
      this.validateRequiredFields(certificateData);
    } catch (err) {
      if (err instanceof CertificatePdfError) {
        error('PDF generation validation failed', {
          jobNumber,
          errorCode: err.code,
          errorMessage: err.message,
        });
      }
      throw err;
    }

    // Dynamic import to avoid inflating bundle size
    const puppeteer = await import('puppeteer-core').catch(() => {
      throw new CertificatePdfError(
        'ENVIRONMENT_NOT_SUPPORTED',
        'puppeteer-core could not be loaded. Ensure it is installed and compatible with this environment.'
      );
    });

    let chromiumModule: unknown;
    try {
      chromiumModule = await import('@sparticuz/chromium');
    } catch {
      throw new CertificatePdfError(
        'ENVIRONMENT_NOT_SUPPORTED',
        '@sparticuz/chromium could not be loaded. Ensure it is installed and compatible with this environment.'
      );
    }

    // Handle CommonJS export = Chromium structure (may be wrapped in default)
    // Type assertion needed because @sparticuz/chromium uses CommonJS export =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
    const chromiumExport = chromiumModule as any;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const ChromiumClass = (
      'default' in chromiumExport ? chromiumExport.default : chromiumExport
    ) as {
      executablePath: (input?: string) => Promise<string>;
      args: string[];
      defaultViewport: { width: number; height: number };
      headless: true | 'shell';
    };

    let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;
    let page: Awaited<ReturnType<Awaited<ReturnType<typeof puppeteer.launch>>['newPage']>> | null =
      null;

    try {
      // Configure Chromium for serverless environment
      const executablePath = await ChromiumClass.executablePath();
      if (!executablePath) {
        throw new CertificatePdfError(
          'ENVIRONMENT_NOT_SUPPORTED',
          'Chromium executable path could not be determined. This environment may not support Chromium.'
        );
      }

      // Convert headless mode: @sparticuz/chromium returns true | "shell", puppeteer expects boolean | "new"
      const headlessMode = ChromiumClass.headless;
      const headlessValue: boolean | 'new' =
        headlessMode === true ? true : headlessMode === 'shell' ? 'new' : true;

      // Launch browser with serverless-optimized args
      browser = await puppeteer.launch({
        args: ChromiumClass.args,
        defaultViewport: ChromiumClass.defaultViewport,
        executablePath,
        headless: headlessValue,
      });

      if (!browser) {
        throw new CertificatePdfError('LAUNCH_FAILED', 'Browser launch returned null');
      }

      page = await browser.newPage();

      if (!page) {
        throw new CertificatePdfError('LAUNCH_FAILED', 'Page creation returned null');
      }

      // Build HTML template
      const html = this.buildHtmlTemplate(certificateData);

      // Set content and wait for network to be idle
      await page.setContent(html, { waitUntil: 'networkidle0' });

      // Generate PDF with A4 format and margins
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: {
          top: '20mm',
          bottom: '20mm',
          left: '25mm',
          right: '25mm',
        },
      });

      // Validate PDF buffer
      if (!pdfBuffer || pdfBuffer.length === 0) {
        const err = new CertificatePdfError('PDF_FAILED', 'Generated PDF buffer is empty');
        error('PDF generation failed: empty buffer', {
          jobNumber,
          errorCode: err.code,
        });
        throw err;
      }

      // Check that buffer starts with PDF magic bytes
      const pdfHeader = pdfBuffer.toString('utf-8', 0, 4);
      if (pdfHeader !== '%PDF') {
        const err = new CertificatePdfError(
          'PDF_FAILED',
          'Generated buffer does not appear to be a valid PDF'
        );
        error('PDF generation failed: invalid PDF format', {
          jobNumber,
          errorCode: err.code,
        });
        throw err;
      }

      info('PDF generation completed successfully', {
        jobNumber,
        pdfSize: pdfBuffer.length,
      });

      return Buffer.from(pdfBuffer);
    } catch (err) {
      // Log Chromium errors clearly for debugging
      const errorMessage =
        err instanceof Error ? err.message : 'Unknown error during PDF generation';
      const errorName = err instanceof Error && 'name' in err ? String(err.name) : 'UnknownError';

      // Log detailed error information
      error('PDF generation failed (Chromium)', {
        jobNumber,
        errorName,
        errorMessage,
        errorCode: err instanceof CertificatePdfError ? err.code : 'PDF_FAILED',
        suggestion: 'Consider setting USE_SIMPLE_PDF=true for development environments',
      });

      // Re-throw CertificatePdfError as-is
      if (err instanceof CertificatePdfError) {
        throw err;
      }

      // Wrap other errors appropriately
      // Determine error code based on error type/message
      let errorCode: CertificatePdfErrorCode = 'PDF_FAILED';
      if (
        errorMessage.includes('launch') ||
        errorMessage.includes('executable') ||
        errorMessage.includes('spawn') ||
        errorMessage.includes('Unknown system error')
      ) {
        errorCode = 'LAUNCH_FAILED';
      } else if (errorMessage.includes('render') || errorMessage.includes('content')) {
        errorCode = 'RENDER_FAILED';
      } else if (errorMessage.includes('environment') || errorMessage.includes('not supported')) {
        errorCode = 'ENVIRONMENT_NOT_SUPPORTED';
      }

      throw new CertificatePdfError(
        errorCode,
        errorMessage,
        undefined,
        err instanceof Error ? err : new Error(String(err))
      );
    } finally {
      // Ensure cleanup
      if (page) {
        try {
          await page.close();
        } catch {
          // Ignore cleanup errors
        }
      }
      if (browser) {
        try {
          await browser.close();
        } catch {
          // Ignore cleanup errors
        }
      }
    }
  }
}
