#!/usr/bin/env node
/**
 * Ticket Audit Script
 *
 * Purpose: Provides a comprehensive, machine-readable audit report for a given ticket.
 * Verifies end-to-end what the system did for a ticket without modifying anything.
 *
 * Usage:
 *   npm run audit:ticket -- <ticket-uuid>
 *
 * This script:
 *   - Fetches ticket from Jifeline API
 *   - Checks processed_tickets table for processing record
 *   - Verifies PDF exists in Supabase Storage
 *   - Rebuilds CertificateData to see what system thinks certificate should contain
 *   - Outputs JSON audit report to stdout
 *
 * This is a READ-ONLY diagnostic tool - no writes or modifications are performed.
 */

import { JifelineApiClient } from '../src/clients/jifeline-api-client.js';
import { CertificateDataBuilder } from '../src/services/certificate-data-builder.js';
import { RealRegMileageExtractor } from '../src/services/reg-mileage-extractor.js';
import { HttpOpenAiExtractionClient } from '../src/clients/openai-extraction-client.js';
import { supabaseClient } from '../src/clients/supabase-client.js';
import { query, closePool } from '../src/clients/database.js';
import { loadConfig } from '../src/config/index.js';

const CERTIFICATES_BUCKET = 'certificates';

interface AuditReport {
  ticketId: string;
  ticketNumber: number | null;
  ticketStatus: string;
  workshopName: string | null;
  employeeName: string | null;
  jifelineCustomersEndpointStatus: 'ok' | '404' | 'error';
  processedTicketRow: {
    status: string;
    certificateUrl: string | null;
    errorMessage: string | null;
    processedAt: string | null;
  } | null;
  pdf: {
    foundInStorage: boolean;
    storagePath: string | null;
    publicUrl: string | null;
  };
  certificateData: {
    vehicleMake: string | null;
    vehicleModel: string | null;
    vehicleRegistration: string | null;
    vehicleMileage: string | null;
    jobNumber: number | null;
    date: string | null;
    time: string | null;
  } | null;
  consistencyChecks: {
    ticketVsProcessed: 'ok' | 'mismatch' | 'missing';
    pdfVsProcessed: 'ok' | 'mismatch' | 'missing';
    notes: string[];
  };
}

async function auditTicket(ticketId: string): Promise<AuditReport> {
  const report: AuditReport = {
    ticketId,
    ticketNumber: null,
    ticketStatus: 'unknown',
    workshopName: null,
    employeeName: null,
    jifelineCustomersEndpointStatus: 'error',
    processedTicketRow: null,
    pdf: {
      foundInStorage: false,
      storagePath: null,
      publicUrl: null,
    },
    certificateData: null,
    consistencyChecks: {
      ticketVsProcessed: 'missing',
      pdfVsProcessed: 'missing',
      notes: [],
    },
  };

  const apiClient = new JifelineApiClient();

  // Step 1: Fetch ticket from Jifeline
  let ticket;
  try {
    ticket = await apiClient.getTicketById(ticketId);
    report.ticketId = ticket.id;
    report.ticketNumber = ticket.ticket_number;
    report.ticketStatus = ticket.state;
  } catch (error) {
    report.consistencyChecks.notes.push(
      `Failed to fetch ticket from Jifeline: ${error instanceof Error ? error.message : String(error)}`
    );
    return report;
  }

  // Step 2: Check processed_tickets table
  try {
    const dbResult = await query<{
      ticket_id: string;
      ticket_number: number;
      status: string;
      certificate_url: string | null;
      error_message: string | null;
      processed_at: string;
    }>(
      `SELECT ticket_id, ticket_number, status, certificate_url, error_message, processed_at
       FROM processed_tickets
       WHERE ticket_id = $1
       ORDER BY processed_at DESC
       LIMIT 1`,
      [ticketId]
    );

    if (dbResult.rows.length > 0) {
      const row = dbResult.rows[0];
      report.processedTicketRow = {
        status: row.status,
        certificateUrl: row.certificate_url,
        errorMessage: row.error_message,
        processedAt: row.processed_at,
      };

      // Consistency check: ticket number match
      // Convert both to numbers for comparison (DB might return string)
      const jifelineTicketNumber = Number(ticket.ticket_number);
      const dbTicketNumber = Number(row.ticket_number);
      
      if (jifelineTicketNumber === dbTicketNumber && !isNaN(jifelineTicketNumber) && !isNaN(dbTicketNumber)) {
        report.consistencyChecks.ticketVsProcessed = 'ok';
      } else {
        report.consistencyChecks.ticketVsProcessed = 'mismatch';
        report.consistencyChecks.notes.push(
          `Ticket number mismatch: Jifeline=${ticket.ticket_number} (${typeof ticket.ticket_number}), DB=${row.ticket_number} (${typeof row.ticket_number})`
        );
      }
    } else {
      report.consistencyChecks.ticketVsProcessed = 'missing';
      report.consistencyChecks.notes.push('No processed_tickets record found for this ticket');
    }
  } catch (error) {
    report.consistencyChecks.notes.push(
      `Database query failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  // Step 3: Check Supabase Storage for PDF
  if (ticket.ticket_number) {
    const expectedPath = `${ticket.ticket_number}-${ticketId}.pdf`;
    report.pdf.storagePath = expectedPath;

    try {
      // Check if file exists by listing files in bucket and searching for exact match
      const { data: fileList, error: listError } = await supabaseClient.storage
        .from(CERTIFICATES_BUCKET)
        .list('', {
          limit: 1000,
        });

      if (!listError && fileList) {
        const fileExists = fileList.some((file) => file.name === expectedPath);
        
        if (fileExists) {
          report.pdf.foundInStorage = true;
          // Get public URL
          const { data: urlData } = supabaseClient.storage
            .from(CERTIFICATES_BUCKET)
            .getPublicUrl(expectedPath);
          
          if (urlData && urlData.publicUrl) {
            report.pdf.publicUrl = urlData.publicUrl;
          }
        } else {
          report.pdf.foundInStorage = false;
        }
      } else if (listError) {
        // If listing fails, try to get public URL as fallback check
        const { data: urlData } = supabaseClient.storage
          .from(CERTIFICATES_BUCKET)
          .getPublicUrl(expectedPath);
        
        if (urlData && urlData.publicUrl) {
          // URL generation doesn't verify file exists, but indicates path format is valid
          report.consistencyChecks.notes.push(
            `Storage listing failed, but URL format is valid (file existence not verified)`
          );
        }
      }
    } catch (error) {
      report.consistencyChecks.notes.push(
        `Storage check failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    // Consistency check: PDF vs processed_tickets
    if (report.processedTicketRow) {
      if (report.pdf.foundInStorage && report.processedTicketRow.certificateUrl) {
        report.consistencyChecks.pdfVsProcessed = 'ok';
      } else if (!report.pdf.foundInStorage && !report.processedTicketRow.certificateUrl) {
        report.consistencyChecks.pdfVsProcessed = 'ok'; // Both missing - consistent
      } else {
        report.consistencyChecks.pdfVsProcessed = 'mismatch';
        report.consistencyChecks.notes.push(
          `PDF storage mismatch: found=${report.pdf.foundInStorage}, DB URL=${report.processedTicketRow.certificateUrl ? 'present' : 'null'}`
        );
      }
    } else {
      report.consistencyChecks.pdfVsProcessed = 'missing';
    }
  }

  // Step 4: Test Jifeline customers endpoint
  if (ticket.customer_id) {
    try {
      await apiClient.getCustomerById(ticket.customer_id);
      report.jifelineCustomersEndpointStatus = 'ok';
    } catch (error) {
      if (error instanceof Error && error.message.includes('404')) {
        report.jifelineCustomersEndpointStatus = '404';
        report.consistencyChecks.notes.push(
          `Customer endpoint returned 404 (expected with current permissions)`
        );
      } else {
        report.jifelineCustomersEndpointStatus = 'error';
        report.consistencyChecks.notes.push(
          `Customer endpoint error: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  } else {
    report.consistencyChecks.notes.push('Ticket has no customer_id');
  }

  // Step 5: Rebuild CertificateData (read-only, no PDF generation)
  try {
    const openAiClient = new HttpOpenAiExtractionClient();
    const regMileageExtractor = new RealRegMileageExtractor(apiClient, openAiClient);
    const dataBuilder = new CertificateDataBuilder(apiClient, regMileageExtractor);

    const certificateData = await dataBuilder.buildForTicket(ticket);

    report.workshopName = certificateData.workshopName;
    report.employeeName = certificateData.employeeName;
    report.certificateData = {
      vehicleMake: certificateData.vehicleMake,
      vehicleModel: certificateData.vehicleModel,
      vehicleRegistration: certificateData.vehicleRegistration,
      vehicleMileage: certificateData.vehicleMileage,
      jobNumber: certificateData.jobNumber,
      date: certificateData.date,
      time: certificateData.time,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    report.consistencyChecks.notes.push(`CertificateData build failed: ${errorMessage}`);
    
    // If it's a known error (like customer 404), that's expected - don't fail the audit
    if (errorMessage.includes('CUSTOMER_NOT_FOUND') || errorMessage.includes('404')) {
      report.consistencyChecks.notes.push(
        'Note: Customer 404 is expected with current permissions - fallback values will be used'
      );
    }
  }

  return report;
}

async function main() {
  const ticketId = process.argv[2];

  if (!ticketId) {
    console.error('Usage: npm run audit:ticket -- <ticket-uuid>');
    console.error('\nExample:');
    console.error('  npm run audit:ticket -- 1536aad7-fc68-4703-afaf-6168c45b6a6a\n');
    process.exit(1);
  }

  try {
    // Load config to ensure env vars are valid
    loadConfig();

    // Run audit
    const report = await auditTicket(ticketId);

    // Output JSON to stdout
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    console.error('Audit failed:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  } finally {
    await closePool();
  }
}

main();

