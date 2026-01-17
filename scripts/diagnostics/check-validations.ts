#!/usr/bin/env node
/**
 * Live Validation Check
 *
 * Purpose:
 * Test registration and mileage validation with sample data.
 * Show which validations exist vs missing.
 *
 * Usage:
 *   npm run diagnostic:validations
 */

import { loadConfig } from '../../src/config/index.js';

// Replicate validation logic for testing (from src/services/reg-mileage-extractor.ts:357-375)
function validateRegistration(reg: string): string | null {
  const normalised = reg.toUpperCase().replace(/\s+/g, '');
  const pattern = /^[A-Z]{2}\d{2}[A-Z]{3}$/;
  if (!pattern.test(normalised)) {
    return null;
  }
  // Reformat as AA11 AAA
  return `${normalised.slice(0, 2)}${normalised.slice(2, 4)} ${normalised.slice(4)}`;
}

function validateMileage(value: number): number | null {
  if (!Number.isFinite(value)) {
    return null;
  }
  if (value < 0 || value > 500_000) {
    return null;
  }
  return Math.round(value);
}

async function main(): Promise<void> {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('✅ VALIDATION CHECK (LIVE)');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');

  try {
    loadConfig();
  } catch (err) {
    console.error('✗ Configuration error:');
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  // Test Registration Validation
  console.log('📋 REGISTRATION VALIDATION TESTS:');
  console.log('─'.repeat(60));
  console.log('');

  const regTestCases = [
    { input: 'AB12 CDE', expected: 'valid', description: 'New format with space' },
    { input: 'AB12CDE', expected: 'valid', description: 'New format without space' },
    { input: 'ab12 cde', expected: 'valid', description: 'Lowercase (should normalize)' },
    { input: 'A123 BCD', expected: 'invalid', description: 'Old format (pre-2001)' },
    { input: '123ABC', expected: 'invalid', description: 'Wrong format' },
    { input: 'ABCD1234', expected: 'invalid', description: 'Wrong format' },
    { input: 'AB1 CDE', expected: 'invalid', description: 'Too short' },
    { input: 'AB123 CDE', expected: 'invalid', description: 'Too long' },
  ];

  let regPassed = 0;
  let regFailed = 0;

  regTestCases.forEach((testCase) => {
    const result = validateRegistration(testCase.input);
    const isValid = result !== null;
    const passed = (testCase.expected === 'valid') === isValid;

    if (passed) {
      regPassed++;
      console.log(`✓ ${testCase.input.padEnd(15)} → ${result || 'null'} (${testCase.description})`);
    } else {
      regFailed++;
      console.log(
        `✗ ${testCase.input.padEnd(15)} → Expected ${testCase.expected}, got ${isValid ? 'valid' : 'invalid'} (${testCase.description})`
      );
    }
  });

  console.log('');
  console.log(`Registration Tests: ${regPassed}/${regTestCases.length} passed`);
  console.log('');

  // Test Mileage Validation
  console.log('📋 MILEAGE VALIDATION TESTS:');
  console.log('─'.repeat(60));
  console.log('');

  const mileageTestCases = [
    { input: 50000, expected: 'valid', description: 'Normal mileage' },
    { input: 0, expected: 'valid', description: 'Zero mileage' },
    { input: 250000, expected: 'valid', description: 'High mileage' },
    { input: 500000, expected: 'invalid', description: 'At upper bound (exclusive)' },
    { input: 500001, expected: 'invalid', description: 'Above upper bound' },
    { input: -100, expected: 'invalid', description: 'Negative' },
    { input: Number.NaN, expected: 'invalid', description: 'NaN' },
    { input: Number.POSITIVE_INFINITY, expected: 'invalid', description: 'Infinity' },
  ];

  let mileagePassed = 0;
  let mileageFailed = 0;

  mileageTestCases.forEach((testCase) => {
    const result = validateMileage(testCase.input);
    const isValid = result !== null;
    const passed = (testCase.expected === 'valid') === isValid;

    if (passed) {
      mileagePassed++;
      console.log(
        `✓ ${String(testCase.input).padEnd(15)} → ${result || 'null'} (${testCase.description})`
      );
    } else {
      mileageFailed++;
      console.log(
        `✗ ${String(testCase.input).padEnd(15)} → Expected ${testCase.expected}, got ${isValid ? 'valid' : 'invalid'} (${testCase.description})`
      );
    }
  });

  console.log('');
  console.log(`Mileage Tests: ${mileagePassed}/${mileageTestCases.length} passed`);
  console.log('');

  // Summary
  console.log('═══════════════════════════════════════════════════════════');
  console.log('📊 VALIDATION SUMMARY:');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');

  const totalTests = regTestCases.length + mileageTestCases.length;
  const totalPassed = regPassed + mileagePassed;

  console.log(`Total Tests: ${totalTests}`);
  console.log(`Passed: ${totalPassed}`);
  console.log(`Failed: ${totalTests - totalPassed}`);
  console.log('');

  // Missing validations check
  console.log('🔍 MISSING VALIDATIONS:');
  console.log('─'.repeat(60));
  console.log('');

  const missingValidations: string[] = [];

  // Check for old UK format support
  const oldFormatTest = validateRegistration('A123 BCD');
  if (oldFormatTest === null) {
    missingValidations.push('Old UK registration format (A123 BCD) not supported');
  }

  // Check for confidence threshold validation
  // (This would be in buildResultFromAi, not in validate methods)
  missingValidations.push('Confidence threshold check (should reject < 0.5)');

  if (missingValidations.length > 0) {
    missingValidations.forEach((missing) => {
      console.log(`⚠️  ${missing}`);
    });
  } else {
    console.log('✓ All expected validations present');
  }

  console.log('');

  if (totalPassed === totalTests) {
    console.log('✅ ALL VALIDATIONS WORKING CORRECTLY');
    process.exit(0);
  } else {
    console.log('⚠️  SOME VALIDATIONS FAILED - Review test results above');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
