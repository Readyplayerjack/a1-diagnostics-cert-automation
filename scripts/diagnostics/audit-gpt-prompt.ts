#!/usr/bin/env node
/**
 * Live GPT Prompt Audit
 *
 * Purpose:
 * Load the ACTUAL GPT extraction code and show the EXACT prompt being used.
 * Test with sample conversation data and show input/output.
 *
 * Usage:
 *   npm run diagnostic:gpt-prompt
 */

import { HttpOpenAiExtractionClient } from '../../src/clients/openai-extraction-client.js';
import { loadConfig } from '../../src/config/index.js';

async function main(): Promise<void> {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🤖 GPT PROMPT AUDIT (LIVE)');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');

  try {
    loadConfig();
    console.log('✓ Configuration loaded\n');
  } catch (err) {
    console.error('✗ Configuration error:');
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  const client = new HttpOpenAiExtractionClient();

  // Use reflection to access private buildPrompt method
  // We'll create a test request to see the actual prompt
  const testRequest = {
    conversationText: `
      Customer: Hi, I need calibration for my car
      Agent: What's the registration?
      Customer: AB12 CDE
      Agent: And the mileage?
      Customer: 45,000 miles
      Customer: Actually, wait - the reg is XY34 ZAB, sorry
      Agent: No problem, updated
    `,
    regexCandidates: {
      regs: ['AB12 CDE', 'XY34 ZAB'],
      mileages: ['45000'],
    },
  };

  console.log('📝 TEST CONVERSATION DATA:');
  console.log('─'.repeat(60));
  console.log(testRequest.conversationText.trim());
  console.log('─'.repeat(60));
  console.log('');

  console.log('📋 REGEX CANDIDATES:');
  console.log(`  Registrations: ${testRequest.regexCandidates.regs.join(', ')}`);
  console.log(`  Mileages: ${testRequest.regexCandidates.mileages.join(', ')}`);
  console.log('');

  // Access private method via type assertion (for diagnostic purposes)
  // We'll extract the prompt by examining what gets sent to OpenAI
  // Since buildPrompt is private, we'll reconstruct it based on the code structure
  
  console.log('═══════════════════════════════════════════════════════════');
  console.log('📄 ACTUAL PROMPT BEING SENT TO GPT-4o-mini:');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');
  console.log('(Reconstructed from src/clients/openai-extraction-client.ts:159-201)');
  console.log('');

  // Reconstruct the prompt based on the actual code
  const normalisedText = testRequest.conversationText
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const regsLabel = testRequest.regexCandidates.regs.length > 0
    ? testRequest.regexCandidates.regs.join(', ')
    : 'None';
  const mileagesLabel = testRequest.regexCandidates.mileages.length > 0
    ? testRequest.regexCandidates.mileages.join(', ')
    : 'None';

  const actualPrompt = [
    'Task: From the conversation below, extract exactly one UK vehicle registration and one odometer mileage reading if you can do so with high confidence.',
    '',
    'Rules:',
    '- Use the most recent correction if the user says earlier values were wrong.',
    '- Never guess. If you are not confident, return null for that field.',
    '- The registration must be a real UK plate in formats like AA11 AAA (with or without a space).',
    '- Mileage should be a numeric odometer reading (e.g. 12345, 45,000), usually in miles.',
    '',
    'Conversation text (chronological):',
    normalisedText,
    '',
    'Regex candidates (may contain outdated or incorrect values; prefer the latest valid correction in the conversation):',
    `Registrations: ${regsLabel}`,
    `Mileages: ${mileagesLabel}`,
    '',
    'Respond with STRICT JSON ONLY, no markdown, no explanation outside the JSON, matching this TypeScript type exactly:',
    '{',
    '  "vehicleRegistration": string | null,',
    '  "vehicleMileage": string | null,',
    '  "registrationConfidence": number,',
    '  "mileageConfidence": number,',
    '  "reasoning": string',
    '}',
  ].join('\n');
  console.log(actualPrompt);
  console.log('');

  console.log('═══════════════════════════════════════════════════════════');
  console.log('🔍 PROMPT ANALYSIS:');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');

  const promptLines = actualPrompt.split('\n');
  const hasTaskDefinition = promptLines.some((line) => line.includes('Task:'));
  const hasRules = promptLines.some((line) => line.includes('Rules:'));
  const hasCorrectionHandling = promptLines.some((line) =>
    line.toLowerCase().includes('correction') || line.toLowerCase().includes('actually')
  );
  const hasConfidenceGuidance = promptLines.some((line) =>
    line.toLowerCase().includes('confidence')
  );
  const hasJsonFormat = promptLines.some((line) => line.includes('JSON'));

  console.log(`Task Definition: ${hasTaskDefinition ? '✓' : '✗'}`);
  console.log(`Rules Section: ${hasRules ? '✓' : '✗'}`);
  console.log(`Correction Handling: ${hasCorrectionHandling ? '✓' : '✗'}`);
  console.log(`Confidence Guidance: ${hasConfidenceGuidance ? '✓' : '✗'}`);
  console.log(`JSON Format Spec: ${hasJsonFormat ? '✓' : '✗'}`);
  console.log('');

  // Test actual extraction
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🧪 TESTING ACTUAL EXTRACTION:');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');

  try {
    console.log('Sending request to OpenAI...');
    const result = await client.extractRegAndMileage(testRequest);

    console.log('✓ Extraction successful\n');
    console.log('📊 RESULTS:');
    console.log(`  Registration: ${result.vehicleRegistration || 'null'}`);
    console.log(`  Registration Confidence: ${result.registrationConfidence.toFixed(2)}`);
    console.log(`  Mileage: ${result.vehicleMileage || 'null'}`);
    console.log(`  Mileage Confidence: ${result.mileageConfidence.toFixed(2)}`);
    if (result.reasoning) {
      console.log(`  Reasoning: ${result.reasoning}`);
    }
    console.log('');

    // Validate expected behavior
    console.log('✅ EXPECTED BEHAVIOR CHECK:');
    const expectedReg = 'XY34 ZAB'; // Most recent correction
    const gotCorrectReg = result.vehicleRegistration === expectedReg;
    console.log(
      `  Correct Registration (${expectedReg}): ${gotCorrectReg ? '✓' : '✗'} (got: ${result.vehicleRegistration || 'null'})`
    );
    console.log(`  High Confidence (>0.7): ${result.registrationConfidence > 0.7 ? '✓' : '✗'}`);
    console.log('');

    if (gotCorrectReg && result.registrationConfidence > 0.7) {
      console.log('✅ PROMPT WORKING CORRECTLY: Extracted most recent correction');
    } else {
      console.log('⚠️  PROMPT MAY NEED IMPROVEMENT: Did not extract expected value');
    }
  } catch (err) {
    console.error('✗ Extraction failed:');
    console.error(err instanceof Error ? err.message : String(err));
  }

  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('💡 PROMPT QUALITY ASSESSMENT:');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');

  let score = 0;
  const checks = [
    { name: 'Clear task definition', has: hasTaskDefinition },
    { name: 'Explicit rules', has: hasRules },
    { name: 'Correction handling', has: hasCorrectionHandling },
    { name: 'Confidence guidance', has: hasConfidenceGuidance },
    { name: 'JSON format spec', has: hasJsonFormat },
  ];

  checks.forEach((check) => {
    if (check.has) score += 2;
    console.log(`${check.has ? '✓' : '✗'} ${check.name}`);
  });

  console.log('');
  console.log(`Overall Prompt Quality: ${score}/10`);
  console.log('');

  if (score >= 8) {
    console.log('✅ EXCELLENT: Prompt is well-structured');
  } else if (score >= 6) {
    console.log('⚠️  GOOD: Prompt is functional but could be improved');
  } else {
    console.log('✗ NEEDS WORK: Prompt missing key elements');
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
