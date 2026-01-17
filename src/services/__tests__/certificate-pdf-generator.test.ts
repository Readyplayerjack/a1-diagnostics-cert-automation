/* eslint-disable @typescript-eslint/no-floating-promises */
// Note: node:test's test() function doesn't return a promise that needs awaiting
import assert from 'node:assert/strict';
import test from 'node:test';
import type { CertificateData } from '../../models/certificate-data.js';
import {
  CertificatePdfError,
  ChromiumCertificatePdfGenerator,
} from '../certificate-pdf-generator.js';

/**
 * Test fixture with complete CertificateData for PDF generation.
 */
const createTestCertificateData = (): CertificateData => ({
  workshopName: 'Test Workshop Ltd',
  workshopAddress: '123 Test Street, Test City, TE5T 1NG, United Kingdom',
  operatingWorkshop: null,
  vehicleMake: 'Ford',
  vehicleModel: 'Focus',
  vehicleRegistration: 'AB12 CDE',
  vin: 'WF0AXXWPMA8A12345',
  vehicleMileage: '45,000 miles',
  jobNumber: 12345,
  date: '2025-12-08',
  time: '14:30:00',
  employeeName: 'John Smith',
  remoteOperatorName: 'John Smith',
  calibrationToolUsed: 'Test Tool v2.0',
  systemName: 'Test System',
  calibrationResult: 'Calibration Successful',
  preScanNotes: 'NO DTCs',
  postScanNotes: 'NO DTCs',
});

test('generates valid PDF buffer with complete CertificateData', async () => {
  const generator = new ChromiumCertificatePdfGenerator();
  const certificateData = createTestCertificateData();

  const startTime = Date.now();
  const pdfBuffer = await generator.generate(certificateData);
  const duration = Date.now() - startTime;

  // Validate PDF buffer
  assert.ok(pdfBuffer.length > 0, 'PDF buffer should not be empty');
  assert.ok(
    pdfBuffer.length > 1000,
    `PDF buffer should be substantial (got ${pdfBuffer.length} bytes)`
  );

  // Check PDF magic bytes
  const pdfHeader = pdfBuffer.toString('utf-8', 0, 4);
  assert.equal(pdfHeader, '%PDF', 'PDF buffer should start with %PDF');

  // Log performance characteristics
  // eslint-disable-next-line no-console
  console.log(`PDF generation took ${duration}ms, generated ${pdfBuffer.length} bytes`);
});

test('handles optional fields being null', async () => {
  const generator = new ChromiumCertificatePdfGenerator();
  const certificateData: CertificateData = {
    ...createTestCertificateData(),
    vehicleRegistration: null,
    vin: null,
    vehicleMileage: null,
    calibrationToolUsed: null,
    systemName: null,
  };

  const pdfBuffer = await generator.generate(certificateData);

  assert.ok(pdfBuffer.length > 0, 'PDF buffer should not be empty');
  const pdfHeader = pdfBuffer.toString('utf-8', 0, 4);
  assert.equal(pdfHeader, '%PDF', 'PDF buffer should be valid PDF');
});

test('throws CertificatePdfError with MISSING_FIELD code when required fields are missing', async () => {
  const generator = new ChromiumCertificatePdfGenerator();
  const certificateData: CertificateData = {
    ...createTestCertificateData(),
    workshopName: '',
  };

  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  await assert.rejects(generator.generate(certificateData), (error: unknown) => {
    if (!(error instanceof CertificatePdfError)) {
      return false;
    }
    assert.equal(error.code, 'MISSING_FIELD');
    assert.ok(error.details?.includes('workshopName'));
    return true;
  });
});

test('throws CertificatePdfError when multiple required fields are missing', async () => {
  const generator = new ChromiumCertificatePdfGenerator();
  const certificateData: CertificateData = {
    ...createTestCertificateData(),
    workshopName: '',
    jobNumber: null as unknown as number,
    date: '',
  };

  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  await assert.rejects(generator.generate(certificateData), (error: unknown) => {
    if (!(error instanceof CertificatePdfError)) {
      return false;
    }
    assert.equal(error.code, 'MISSING_FIELD');
    assert.ok(error.details?.includes('workshopName'));
    assert.ok(error.details?.includes('jobNumber'));
    assert.ok(error.details?.includes('date'));
    return true;
  });
});

test('handles long strings without breaking layout', async () => {
  const generator = new ChromiumCertificatePdfGenerator();
  const certificateData: CertificateData = {
    ...createTestCertificateData(),
    workshopName:
      'Very Long Workshop Name That Should Wrap Properly Without Breaking The PDF Layout',
    workshopAddress:
      '123 Very Long Street Name That Might Cause Issues, Test City With A Long Name, TE5T 1NG, United Kingdom',
    preScanNotes: 'This is a very long pre-scan note that should wrap properly. '.repeat(10),
    postScanNotes: 'This is a very long post-scan note that should wrap properly. '.repeat(10),
  };

  const pdfBuffer = await generator.generate(certificateData);

  assert.ok(pdfBuffer.length > 0, 'PDF buffer should not be empty');
  const pdfHeader = pdfBuffer.toString('utf-8', 0, 4);
  assert.equal(pdfHeader, '%PDF', 'PDF buffer should be valid PDF');
});

test('handles special characters in text fields', async () => {
  const generator = new ChromiumCertificatePdfGenerator();
  const certificateData: CertificateData = {
    ...createTestCertificateData(),
    workshopName: "O'Brien's Auto Shop & Repairs",
    workshopAddress: '123 Test St. <Special> "Characters" & More',
    calibrationResult: 'Calibration Successful (100%)',
    preScanNotes: 'Notes with <tags> & "quotes"',
  };

  const pdfBuffer = await generator.generate(certificateData);

  assert.ok(pdfBuffer.length > 0, 'PDF buffer should not be empty');
  const pdfHeader = pdfBuffer.toString('utf-8', 0, 4);
  assert.equal(pdfHeader, '%PDF', 'PDF buffer should be valid PDF');
});

